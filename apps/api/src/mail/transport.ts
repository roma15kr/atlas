import { ImapFlow, type ImapFlowOptions } from "imapflow";
import nodemailer, { type Transporter } from "nodemailer";
import { query } from "../db";
import { ApiError } from "../errors";
import { mailKeys, needsReseal, openSecret, sealSecret, type SealedSecret } from "./crypto";
import { resolveMailHost } from "./hosts";
import { refreshAccessToken, type OAuthProvider } from "./oauth";

export type Security = "SSL" | "STARTTLS";

export interface MailAccountRow {
  id: string;
  company_id: string;
  user_id: string;
  provider: "IMAP" | OAuthProvider;
  email: string;
  display_name: string | null;
  imap_host: string;
  imap_port: number;
  imap_security: Security;
  smtp_host: string;
  smtp_port: number;
  smtp_security: Security;
  username: string;
  secret: SealedSecret | { demo: true };
  signature: string | null;
  status: "CONNECTED" | "NEEDS_ATTENTION";
}

export interface ServerSettings {
  imap: { host: string; port: number; security: Security };
  smtp: { host: string; port: number; security: Security };
  username: string;
}

export type MailAuth = { user: string; pass: string } | { user: string; accessToken: string };

/** Test hook: point connections at local test servers instead of resolving real hosts. */
export interface TransportOverrides {
  imap?: (settings: ServerSettings["imap"]) => Partial<ImapFlowOptions>;
  smtp?: (settings: ServerSettings["smtp"]) => Record<string, unknown>;
  fetch?: typeof fetch;
}
let overrides: TransportOverrides = {};
export function setTransportOverrides(next: TransportOverrides): void { overrides = next; }

export const isDemoSecret = (secret: MailAccountRow["secret"]): secret is { demo: true } => "demo" in secret;

const accessTokens = new Map<string, { token: string; expiresAt: number }>();

/** Credentials for an account: the stored password, or a fresh OAuth access token from the refresh token. */
export async function accountAuth(account: MailAccountRow): Promise<MailAuth> {
  if (isDemoSecret(account.secret)) throw new ApiError(409, "MAIL_ACCOUNT_UNAVAILABLE", "Demo mailbox can't connect to a server");
  const keys = mailKeys();
  const secret = openSecret(account.secret, keys);
  if (account.provider === "IMAP") {
    if (needsReseal(account.secret, keys)) await query("UPDATE mail_accounts SET secret = $2 WHERE id = $1", [account.id, sealSecret(secret, keys)]);
    return { user: account.username, pass: secret };
  }
  const cached = accessTokens.get(account.id);
  if (cached && cached.expiresAt > Date.now() + 60_000) return { user: account.username, accessToken: cached.token };
  const tokens = await refreshAccessToken(account.provider, secret, overrides.fetch);
  accessTokens.set(account.id, { token: tokens.accessToken, expiresAt: tokens.expiresAt });
  if (tokens.refreshToken && tokens.refreshToken !== secret || needsReseal(account.secret, keys)) {
    await query("UPDATE mail_accounts SET secret = $2 WHERE id = $1", [account.id, sealSecret(tokens.refreshToken ?? secret, keys)]);
  }
  return { user: account.username, accessToken: tokens.accessToken };
}

export const forgetAccessToken = (accountId: string): void => { accessTokens.delete(accountId); };

export async function imapOptions(settings: ServerSettings["imap"], auth: MailAuth): Promise<ImapFlowOptions> {
  const base = { auth, logger: false as const, emitLogs: false, connectionTimeout: 20_000, greetingTimeout: 15_000, socketTimeout: 120_000 };
  if (overrides.imap) return { host: settings.host, port: settings.port, secure: false, ...base, ...overrides.imap(settings) } as ImapFlowOptions;
  const resolved = await resolveMailHost(settings.host, settings.port, "IMAP");
  return {
    ...base, host: resolved.address, port: resolved.port, secure: settings.security === "SSL", servername: resolved.host,
    doSTARTTLS: settings.security === "STARTTLS" ? true : undefined, tls: { servername: resolved.host, rejectUnauthorized: true }
  } as ImapFlowOptions;
}

export async function openImap(account: MailAccountRow): Promise<ImapFlow> {
  const auth = await accountAuth(account);
  const client = new ImapFlow(await imapOptions({ host: account.imap_host, port: account.imap_port, security: account.imap_security }, auth));
  client.on("error", () => undefined);
  await client.connect();
  return client;
}

export async function smtpTransport(settings: ServerSettings["smtp"], auth: MailAuth): Promise<Transporter> {
  const authOptions = "pass" in auth ? { user: auth.user, pass: auth.pass } : { type: "OAuth2" as const, user: auth.user, accessToken: auth.accessToken };
  if (overrides.smtp) return nodemailer.createTransport({ host: settings.host, port: settings.port, secure: false, auth: authOptions, ...overrides.smtp(settings) });
  const resolved = await resolveMailHost(settings.host, settings.port, "SMTP");
  return nodemailer.createTransport({
    host: resolved.address, port: resolved.port, secure: settings.security === "SSL", requireTLS: settings.security === "STARTTLS",
    tls: { servername: resolved.host, rejectUnauthorized: true }, auth: authOptions, connectionTimeout: 20_000, greetingTimeout: 15_000, socketTimeout: 60_000
  });
}

/** Logs in to both servers; used before saving an IMAP/SMTP mailbox. */
export async function testConnection(settings: ServerSettings, auth: MailAuth): Promise<void> {
  let imap: ImapFlow | null = null;
  try {
    imap = new ImapFlow(await imapOptions(settings.imap, auth));
    imap.on("error", () => undefined);
    await imap.connect();
  } catch (error) {
    throw connectionError(error, "IMAP");
  } finally {
    await imap?.logout().catch(() => imap?.close());
  }
  try {
    const transport = await smtpTransport(settings.smtp, auth);
    await transport.verify();
    transport.close();
  } catch (error) {
    throw connectionError(error, "SMTP");
  }
}

export type FailureReason = "AUTH" | "HOST_NOT_FOUND" | "UNREACHABLE" | "TLS" | "SMTP_AUTH_DISABLED" | "UNKNOWN";

export function failureReason(error: unknown): FailureReason {
  if (error instanceof ApiError) return (error.details as { reason?: FailureReason } | undefined)?.reason ?? (error.code === "MAIL_OAUTH_REVOKED" ? "AUTH" : "UNKNOWN");
  const value = error as { authenticationFailed?: boolean; code?: string; responseCode?: number; response?: string; message?: string; responseText?: string };
  const text = `${value.message ?? ""} ${value.response ?? ""} ${value.responseText ?? ""}`;
  if (/SmtpClientAuthentication is disabled|SMTP AUTH.*disabled/i.test(text)) return "SMTP_AUTH_DISABLED";
  if (value.authenticationFailed || value.code === "EAUTH" || value.responseCode === 535 || /AUTHENTICATIONFAILED|Invalid credentials|authentication failed|LOGIN failed/i.test(text)) return "AUTH";
  if (value.code === "ENOTFOUND" || value.code === "EAI_AGAIN") return "HOST_NOT_FOUND";
  if (/certificate|SSL|TLS|self.signed|wrong version number/i.test(text) || value.code === "ESOCKET" && /tls/i.test(text)) return "TLS";
  if (["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "ETIMEOUT", "NoConnection"].includes(value.code ?? "")) return "UNREACHABLE";
  return "UNKNOWN";
}

export const reasonText: Record<FailureReason, string> = {
  AUTH: "Неверный логин или пароль",
  HOST_NOT_FOUND: "Сервер не найден — проверьте адрес",
  UNREACHABLE: "Сервер недоступен — проверьте адрес и порт",
  TLS: "Ошибка защищённого соединения — проверьте тип шифрования",
  SMTP_AUTH_DISABLED: "Отправка по SMTP отключена администратором почты",
  UNKNOWN: "Не удалось подключиться к почтовому серверу",
};

export function connectionError(error: unknown, kind: "IMAP" | "SMTP"): ApiError {
  if (error instanceof ApiError && error.code !== "MAIL_CONNECTION_FAILED" && error.code !== "MAIL_OAUTH_REVOKED") return error;
  const reason = failureReason(error);
  return new ApiError(400, "MAIL_CONNECTION_FAILED", `${kind}: ${reasonText[reason]}`, { reason, kind });
}

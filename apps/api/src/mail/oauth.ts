import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config";
import { query } from "../db";
import { ApiError } from "../errors";

export type OAuthProvider = "GOOGLE" | "MICROSOFT";

export interface ProviderSettings {
  imap: { host: string; port: number; security: "SSL" | "STARTTLS" };
  smtp: { host: string; port: number; security: "SSL" | "STARTTLS" };
  /** Whether the provider stores sent mail itself, so Atlas must not append a copy. */
  savesSent: boolean;
}

export const PROVIDER_SERVERS: Record<OAuthProvider, ProviderSettings> = {
  GOOGLE: { imap: { host: "imap.gmail.com", port: 993, security: "SSL" }, smtp: { host: "smtp.gmail.com", port: 465, security: "SSL" }, savesSent: true },
  MICROSOFT: { imap: { host: "outlook.office365.com", port: 993, security: "SSL" }, smtp: { host: "smtp.office365.com", port: 587, security: "STARTTLS" }, savesSent: true }
};

interface Endpoints { authorize: string; token: string; revoke?: string; scope: string; clientId?: string; clientSecret?: string }

function endpoints(provider: OAuthProvider): Endpoints {
  if (provider === "GOOGLE") {
    return {
      authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token",
      revoke: "https://oauth2.googleapis.com/revoke", scope: "https://mail.google.com/ openid email profile",
      clientId: config.GOOGLE_CLIENT_ID || undefined, clientSecret: config.GOOGLE_CLIENT_SECRET || undefined
    };
  }
  const tenant = config.MICROSOFT_TENANT_ID;
  return {
    authorize: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`, token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    scope: "https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access openid email profile",
    clientId: config.MICROSOFT_CLIENT_ID || undefined, clientSecret: config.MICROSOFT_CLIENT_SECRET || undefined
  };
}

export const providerConfigured = (provider: OAuthProvider): boolean => {
  const settings = endpoints(provider);
  return Boolean(settings.clientId && settings.clientSecret);
};

/**
 * The provider redirects the browser to a web route, which posts the code and state to the API with
 * the user's access token; the state is bound to that user, so a code can't be redeemed by someone else.
 */
export const redirectUri = (provider: OAuthProvider): string =>
  `${config.PUBLIC_URL.replace(/\/$/, "")}/mail/oauth/${provider.toLowerCase()}`;

const stateKey = () => config.MAIL_ENCRYPTION_KEY ?? config.JWT_SECRET;
const sign = (payload: string) => createHmac("sha256", stateKey()).update(payload).digest("base64url");

/** A signed, single-use state bound to the user who started the flow; valid for 10 minutes. */
export async function createState(userId: string, provider: OAuthProvider): Promise<string> {
  const nonce = randomBytes(18).toString("base64url");
  const expires = Date.now() + 10 * 60_000;
  await query("INSERT INTO mail_oauth_states (nonce, user_id, provider, expires_at) VALUES ($1, $2, $3, $4)", [nonce, userId, provider, new Date(expires)]);
  const payload = `${nonce}.${userId}.${provider}.${expires}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

/** Checks the signature, the expiry, the user and single use, then consumes the state. */
export async function consumeState(state: string, userId: string, provider: OAuthProvider): Promise<void> {
  const [encoded, signature] = state.split(".");
  const invalid = () => new ApiError(400, "MAIL_OAUTH_STATE_INVALID", "The sign-in link has expired; start again");
  if (!encoded || !signature) throw invalid();
  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw invalid();
  const [nonce, stateUser, stateProvider, expires] = payload.split(".");
  if (stateUser !== userId || stateProvider !== provider || Number(expires) < Date.now()) throw invalid();
  const used = await query("UPDATE mail_oauth_states SET used_at = now() WHERE nonce = $1 AND user_id = $2 AND used_at IS NULL AND expires_at > now()", [nonce, userId]);
  if (!used.rowCount) throw invalid();
}

export function authorizationUrl(provider: OAuthProvider, state: string, loginHint?: string): string {
  const settings = endpoints(provider);
  if (!settings.clientId) throw new ApiError(501, "MAIL_PROVIDER_UNAVAILABLE", "This mail provider is not configured on the server");
  const params = new URLSearchParams({
    client_id: settings.clientId, redirect_uri: redirectUri(provider), response_type: "code", scope: settings.scope, state,
    access_type: "offline", prompt: "consent"
  });
  if (provider === "MICROSOFT") { params.delete("access_type"); params.set("prompt", "select_account"); }
  if (loginHint) params.set("login_hint", loginHint);
  return `${settings.authorize}?${params}`;
}

export interface TokenSet { accessToken: string; refreshToken?: string; expiresAt: number; email?: string; name?: string }

async function tokenRequest(provider: OAuthProvider, body: Record<string, string>, fetcher: typeof fetch): Promise<TokenSet> {
  const settings = endpoints(provider);
  if (!settings.clientId || !settings.clientSecret) throw new ApiError(501, "MAIL_PROVIDER_UNAVAILABLE", "This mail provider is not configured on the server");
  const response = await fetcher(settings.token, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: settings.clientId, client_secret: settings.clientSecret, ...body })
  });
  const json = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error?: string };
  if (!response.ok || !json.access_token) {
    throw new ApiError(json.error === "invalid_grant" ? 401 : 502, json.error === "invalid_grant" ? "MAIL_OAUTH_REVOKED" : "MAIL_OAUTH_FAILED", "The provider rejected the sign-in", { reason: json.error });
  }
  const claims = json.id_token ? decodeJwtPayload(json.id_token) : {};
  return {
    accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    email: (claims.email ?? claims.preferred_username) as string | undefined, name: claims.name as string | undefined
  };
}

export const exchangeCode = (provider: OAuthProvider, code: string, fetcher: typeof fetch = fetch) =>
  tokenRequest(provider, { grant_type: "authorization_code", code, redirect_uri: redirectUri(provider) }, fetcher);

export const refreshAccessToken = (provider: OAuthProvider, refreshToken: string, fetcher: typeof fetch = fetch) =>
  tokenRequest(provider, { grant_type: "refresh_token", refresh_token: refreshToken, ...(provider === "MICROSOFT" ? { scope: endpoints(provider).scope } : {}) }, fetcher);

/** Best effort: Google supports revocation; Microsoft grants are removed by the user or tenant admin. */
export async function revokeGrant(provider: OAuthProvider, refreshToken: string, fetcher: typeof fetch = fetch): Promise<void> {
  const settings = endpoints(provider);
  if (!settings.revoke) return;
  await fetcher(`${settings.revoke}?token=${encodeURIComponent(refreshToken)}`, { method: "POST" }).catch(() => undefined);
}

/** The id token came straight from the provider's token endpoint over TLS, so only its claims are read here. */
function decodeJwtPayload(token: string): Record<string, unknown> {
  try { return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>; } catch { return {}; }
}

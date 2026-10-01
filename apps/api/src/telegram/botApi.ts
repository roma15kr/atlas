import { config } from "../config";

/** A Bot API error without the URL, so the token never reaches logs. */
export class TelegramApiError extends Error {
  constructor(public readonly status: number, public readonly description: string, public readonly retryAfter?: number) {
    super(`Telegram API ${status}: ${description}`);
  }
  get blocked(): boolean { return this.status === 403 && /blocked|deactivated|kicked/i.test(this.description); }
  get chatNotFound(): boolean { return this.status === 400 && /chat not found|user not found|PEER_ID_INVALID/i.test(this.description); }
}

export interface TelegramUser { id: number; is_bot?: boolean; first_name?: string; last_name?: string; username?: string; language_code?: string }
export interface TelegramFileRef { file_id: string; file_unique_id?: string; file_size?: number; file_name?: string; mime_type?: string; width?: number; height?: number }
export interface TelegramMessage {
  message_id: number; date: number; chat: { id: number; type: string }; from?: TelegramUser; text?: string; caption?: string;
  photo?: TelegramFileRef[]; document?: TelegramFileRef; voice?: TelegramFileRef; audio?: TelegramFileRef; video?: TelegramFileRef; video_note?: TelegramFileRef;
  sticker?: TelegramFileRef & { emoji?: string }; location?: { latitude: number; longitude: number };
  contact?: { phone_number: string; first_name?: string; last_name?: string }; edit_date?: number;
  reply_to_message?: { message_id: number };
}
export interface TelegramUpdate {
  update_id: number; message?: TelegramMessage; edited_message?: TelegramMessage;
  my_chat_member?: { chat: { id: number; type: string }; from: TelegramUser; new_chat_member: { status: string } };
}
export interface UploadFile { buffer: Buffer; name: string; type: string }

type Fetcher = typeof fetch;
let fetcher: Fetcher = (...args) => fetch(...args);
/** Test hook: route Bot API calls to a fake. */
export function setTelegramFetch(next: Fetcher | null): void { fetcher = next ?? ((...args) => fetch(...args)); }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const SEND_INTERVAL_MS = 40;
let lastSend = 0;

/** Keeps outgoing messages under Telegram's global limit of about 30 per second. */
async function throttle(): Promise<void> {
  const wait = lastSend + SEND_INTERVAL_MS - Date.now();
  lastSend = Math.max(Date.now(), lastSend + SEND_INTERVAL_MS);
  if (wait > 0) await sleep(wait);
}

export const telegramConfigured = (): boolean => Boolean(config.TELEGRAM_BOT_TOKEN);

async function call<T>(method: string, params: Record<string, unknown> | FormData = {}, attempt = 0): Promise<T> {
  const token = config.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramApiError(503, "Bot token is not configured");
  const form = params instanceof FormData;
  const response = await fetcher(`${config.TELEGRAM_API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: form ? undefined : { "content-type": "application/json" },
    body: form ? params : JSON.stringify(params),
    signal: AbortSignal.timeout(method === "getUpdates" ? 40_000 : 30_000)
  });
  const json = await response.json().catch(() => ({})) as { ok?: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } };
  if (json.ok) return json.result as T;
  const status = json.error_code ?? response.status;
  const retryAfter = json.parameters?.retry_after;
  if (status === 429 && retryAfter !== undefined && retryAfter <= 30 && attempt < 3) {
    await sleep(retryAfter * 1000);
    return call(method, params, attempt + 1);
  }
  throw new TelegramApiError(status, json.description ?? `HTTP ${response.status}`, retryAfter);
}

function upload(chatId: number, field: string, file: UploadFile, caption?: string, replyTo?: number): FormData {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set(field, new Blob([file.buffer], { type: file.type }), file.name);
  if (caption) form.set("caption", caption);
  if (replyTo) form.set("reply_parameters", JSON.stringify({ message_id: replyTo, allow_sending_without_reply: true }));
  return form;
}

export const bot = {
  getMe: () => call<TelegramUser & { username: string }>("getMe"),
  setWebhook: (url: string, secretToken: string) =>
    call<boolean>("setWebhook", { url, secret_token: secretToken, allowed_updates: ["message", "edited_message", "my_chat_member"], max_connections: 20 }),
  deleteWebhook: () => call<boolean>("deleteWebhook", { drop_pending_updates: false }),
  getWebhookInfo: () => call<{ url: string; pending_update_count: number; last_error_date?: number; last_error_message?: string }>("getWebhookInfo"),
  getUpdates: (offset: number, timeout = 25) => call<TelegramUpdate[]>("getUpdates", { offset, timeout, allowed_updates: ["message", "edited_message", "my_chat_member"] }),
  sendMessage: async (chatId: number, text: string, replyTo?: number) => {
    await throttle();
    return call<TelegramMessage>("sendMessage", { chat_id: chatId, text, ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}) });
  },
  sendPhoto: async (chatId: number, file: UploadFile, caption?: string, replyTo?: number) => { await throttle(); return call<TelegramMessage>("sendPhoto", upload(chatId, "photo", file, caption, replyTo)); },
  sendDocument: async (chatId: number, file: UploadFile, caption?: string, replyTo?: number) => { await throttle(); return call<TelegramMessage>("sendDocument", upload(chatId, "document", file, caption, replyTo)); },
  getFile: (fileId: string) => call<{ file_id: string; file_path?: string; file_size?: number }>("getFile", { file_id: fileId }),
  downloadFile: async (filePath: string): Promise<Buffer> => {
    const response = await fetcher(`${config.TELEGRAM_API_BASE}/file/bot${config.TELEGRAM_BOT_TOKEN}/${filePath}`, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new TelegramApiError(response.status, "File download failed");
    return Buffer.from(await response.arrayBuffer());
  }
};

/** Telegram lets bots download files up to 20 MB. */
export const BOT_DOWNLOAD_LIMIT = 20 * 1024 * 1024;

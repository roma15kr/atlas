import { z } from "zod";

/** Compose passes unset variables as empty strings; treat those as absent. */
const optionalKey = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().refine((value) => Buffer.from(value, "base64").length === 32, "must be 32 bytes, base64-encoded").optional()
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url().optional(),
  POSTGRES_HOST: z.string().default("postgres"),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_DB: z.string().default("atlas"),
  POSTGRES_USER: z.string().default("atlas"),
  POSTGRES_PASSWORD: z.string().optional(),
  REDIS_URL: z.string().url().optional(),
  REDIS_HOST: z.string().default("redis"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  JWT_SECRET: z.string().min(32).default("dev-only-access-secret-change-me-123456789"),
  REFRESH_TOKEN_SECRET: z.string().min(32).default("dev-only-refresh-secret-change-me-123456"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  PUBLIC_URL: z.string().default("http://localhost:8080"),
  SEED_DEMO_DATA: z.enum(["true", "false"]).default("false"),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(16).max(200).optional(),
  BOOTSTRAP_ADMIN_USERNAME: z.string().trim().min(2).max(100).default("director"),
  BOOTSTRAP_ADMIN_NAME: z.string().trim().min(2).max(160).default("Atlas Director"),
  BOOTSTRAP_COMPANY_NAME: z.string().trim().min(2).max(200).default("Atlas"),
  CORS_ORIGIN: z.string().optional(),
  STORAGE_DIR: z.string().default("/data/documents"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("atlas-documents"),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-20250514"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.preprocess((value) => value === "" ? undefined : value, z.string().regex(/^[A-Za-z0-9.-]+$/).default("common")),
  MAIL_ENCRYPTION_KEY: optionalKey,
  MAIL_ENCRYPTION_KEY_PREVIOUS: optionalKey,
  MAIL_SYNC_DAYS: z.coerce.number().int().min(1).max(365).default(90),
  MAIL_POLL_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),
  MAIL_ALLOW_PRIVATE_HOSTS: z.enum(["true", "false"]).default("false"),
  MAIL_SCHEDULER: z.enum(["on", "off"]).default("on"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.preprocess((value) => value === "" ? undefined : value, z.string().regex(/^[A-Za-z0-9_-]{32,256}$/, "32-256 letters, digits, _ or -").optional()),
  TELEGRAM_MODE: z.preprocess((value) => value === "" ? undefined : value, z.enum(["webhook", "polling"]).default("webhook")),
  TELEGRAM_API_BASE: z.preprocess((value) => value === "" ? undefined : value, z.string().url().default("https://api.telegram.org")),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  VIBER_AUTH_TOKEN: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(20),
  TRUST_PROXY: z.coerce.number().int().min(0).max(3).default(2)
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid API environment: ${parsed.error.message}`);
}

if (parsed.data.NODE_ENV === "production" &&
    (parsed.data.JWT_SECRET.startsWith("dev-only") || parsed.data.REFRESH_TOKEN_SECRET.startsWith("dev-only"))) {
  throw new Error("JWT_SECRET and REFRESH_TOKEN_SECRET must be configured in production");
}

if (parsed.data.NODE_ENV === "production" && parsed.data.SEED_DEMO_DATA === "true") {
  throw new Error("SEED_DEMO_DATA cannot be enabled in production");
}

if (parsed.data.NODE_ENV === "production" && !parsed.data.DATABASE_URL && !parsed.data.POSTGRES_PASSWORD) {
  throw new Error("POSTGRES_PASSWORD or DATABASE_URL is required in production");
}

if (parsed.data.NODE_ENV === "production" && !parsed.data.REDIS_URL && !parsed.data.REDIS_PASSWORD) {
  throw new Error("REDIS_PASSWORD or REDIS_URL is required in production");
}

if (parsed.data.NODE_ENV === "production" &&
    (parsed.data.COOKIE_SECURE !== "true" || new URL(parsed.data.PUBLIC_URL).protocol !== "https:")) {
  throw new Error("Production requires an HTTPS PUBLIC_URL and COOKIE_SECURE=true");
}

if (parsed.data.TELEGRAM_BOT_TOKEN && parsed.data.TELEGRAM_MODE === "webhook" && !parsed.data.TELEGRAM_WEBHOOK_SECRET) {
  throw new Error("TELEGRAM_WEBHOOK_SECRET (at least 32 characters) is required for the Telegram webhook");
}

export const config = {
  ...parsed.data,
  cookieSecure: parsed.data.COOKIE_SECURE === "true",
  seedDemoData: parsed.data.SEED_DEMO_DATA === "true",
  corsOrigins: (parsed.data.CORS_ORIGIN ?? parsed.data.PUBLIC_URL).split(",").map((origin) => origin.trim()).filter(Boolean),
  maxUploadBytes: parsed.data.MAX_UPLOAD_MB * 1024 * 1024
};

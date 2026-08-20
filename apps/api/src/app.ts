import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { authenticate } from "./auth";
import { config } from "./config";
import { pool } from "./db";
import { errorHandler, asyncHandler, notFound } from "./errors";
import { apiLimiter, crmReadLimiter } from "./middleware";
import { connectRedis } from "./redis";
import { objectStorage } from "./storage";
import { achievementsRouter } from "./routes/achievements";
import { aiRouter } from "./routes/ai";
import { alertsRouter } from "./routes/alerts";
import { auditRouter } from "./routes/audit";
import { authRouter } from "./routes/auth";
import { clientsRouter } from "./routes/clients";
import { dashboardRouter } from "./routes/dashboard";
import { dealsRouter } from "./routes/deals";
import { documentsRouter } from "./routes/documents";
import { integrationsRouter } from "./routes/integrations";
import { messagesRouter } from "./routes/messages";
import { reportsRouter } from "./routes/reports";
import { tasksRouter } from "./routes/tasks";
import { teamRouter } from "./routes/team";

export const app = express();
app.set("trust proxy", config.TRUST_PROXY);
app.disable("x-powered-by");
app.use(pinoHttp({
  quietReqLogger: true,
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
    censor: "[Redacted]"
  }
}));
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(apiLimiter);

const healthHandler = asyncHandler(async (_req, res) => {
  const checks: Record<string, string> = {};
  const [database, redisResult, storage] = await Promise.allSettled([
    pool.query("SELECT 1"),
    connectRedis().then((client) => client ? client.ping() : Promise.reject(new Error("Redis unavailable"))),
    objectStorage.health()
  ]);
  checks.database = database.status === "fulfilled" ? "ok" : "error";
  checks.redis = redisResult.status === "fulfilled" ? "ok" : "error";
  checks.storage = storage.status === "fulfilled" ? "ok" : "error";
  const healthy = Object.values(checks).every((status) => status === "ok");
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    checks,
    features: { ai: config.ANTHROPIC_API_KEY ? "claude" : "rules", storage: config.S3_ENDPOINT ? "s3" : "local" }
  });
});
app.get("/health", healthHandler);
app.get("/api/v1/health", healthHandler);

app.use("/api/v1/auth", authRouter);
app.use("/api/v1", authenticate);
app.use("/api/v1/dashboard", dashboardRouter);
app.use("/api/v1/team", teamRouter);
app.use("/api/v1/clients", crmReadLimiter, clientsRouter);
app.use("/api/v1/deals", dealsRouter);
app.use("/api/v1/tasks", tasksRouter);
app.use("/api/v1/documents", documentsRouter);
app.use("/api/v1/reports", reportsRouter);
app.use("/api/v1/achievements", achievementsRouter);
app.use("/api/v1/alerts", alertsRouter);
app.use("/api/v1/integrations", integrationsRouter);
app.use("/api/v1/messages", messagesRouter);
app.use("/api/v1/audit", auditRouter);
app.use("/api/v1/ai", aiRouter);

app.use(notFound);
app.use(errorHandler);

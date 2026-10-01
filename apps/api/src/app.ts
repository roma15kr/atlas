import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { authenticate } from "./auth";
import { config } from "./config";
import { pool } from "./db";
import { errorHandler, asyncHandler, notFound } from "./errors";
import { apiLimiter, crmReadLimiter, ipFloodLimiter } from "./middleware";
import { connectRedis } from "./redis";
import { objectStorage } from "./storage";
import { achievementsRouter } from "./routes/achievements";
import { aiRouter } from "./routes/ai";
import { alertsRouter } from "./routes/alerts";
import { auditRouter } from "./routes/audit";
import { authRouter } from "./routes/auth";
import { chatRouter } from "./routes/chat";
import { clientsRouter } from "./routes/clients";
import { communicationsRouter } from "./routes/communications";
import { dashboardRouter } from "./routes/dashboard";
import { dealsRouter } from "./routes/deals";
import { documentsRouter } from "./routes/documents";
import { funnelsRouter } from "./routes/funnels";
import { integrationsRouter } from "./routes/integrations";
import { kpisRouter } from "./routes/kpis";
import { mailRouter } from "./routes/mail";
import { reportsRouter } from "./routes/reports";
import { taskBoardsRouter } from "./routes/taskBoards";
import { createInvite, telegramRouter } from "./routes/telegram";
import { webhookHandler } from "./telegram/runner";
import { tasksRouter } from "./routes/tasks";
import { teamRouter } from "./routes/team";
import { teamAdminRouter } from "./routes/teamAdmin";

export const app = express();
app.set("trust proxy", config.TRUST_PROXY);
app.disable("x-powered-by");
app.use(pinoHttp({
  enabled: process.env.NODE_ENV !== "test",
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
// Telegram calls from a few shared IPs; it is authenticated by its secret token instead of the per-IP limit.
app.post("/api/telegram/webhook", asyncHandler(webhookHandler));
app.use(ipFloodLimiter, apiLimiter);

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
app.use("/api/v1/team", teamRouter, teamAdminRouter);
app.use("/api/v1", communicationsRouter);
app.post("/api/v1/clients/:id/telegram-invite", createInvite);
app.use("/api/v1/telegram", telegramRouter);
app.use("/api/v1/clients", crmReadLimiter, clientsRouter);
app.use("/api/v1/funnels", funnelsRouter);
app.use("/api/v1/deals", dealsRouter);
app.use("/api/v1/task-boards", taskBoardsRouter);
app.use("/api/v1/tasks", tasksRouter);
app.use("/api/v1/documents", documentsRouter);
app.use("/api/v1/reports", reportsRouter);
app.use("/api/v1/achievements", achievementsRouter);
app.use("/api/v1/kpis", kpisRouter);
app.use("/api/v1/alerts", alertsRouter);
app.use("/api/v1/integrations", integrationsRouter);
app.use("/api/v1/mail", mailRouter);
app.use("/api/v1/chat", chatRouter);
app.use("/api/v1/audit", auditRouter);
app.use("/api/v1/ai", aiRouter);

app.use(notFound);
app.use(errorHandler);

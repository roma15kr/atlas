import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export const asyncHandler = <T extends Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>
) => (req: T, res: Response, next: NextFunction): void => {
  void handler(req, res, next).catch(next);
};

export const notFound = (_req: Request, _res: Response, next: NextFunction): void => {
  next(new ApiError(404, "NOT_FOUND", "Route not found"));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request", details: error.flatten() } });
    return;
  }
  if (error instanceof MulterError) {
    res.status(400).json({ error: { code: "UPLOAD_ERROR", message: error.message } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } });
};

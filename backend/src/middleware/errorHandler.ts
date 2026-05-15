import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const message = err instanceof Error ? err.message : "Server error";
  const status = typeof (err as { status?: number }).status === "number" ? (err as { status: number }).status : 500;
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ error: message });
};

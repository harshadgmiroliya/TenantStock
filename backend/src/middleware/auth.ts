import type { RequestHandler } from "express";
import { Types } from "mongoose";
import { verifyToken } from "../utils/jwt.js";

export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }
  try {
    const payload = verifyToken(token);
    req.user = {
      userId: new Types.ObjectId(payload.sub),
      companyId: new Types.ObjectId(payload.companyId ?? payload.tenantId),
      tenantId: new Types.ObjectId(payload.tenantId),
      role: payload.role,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

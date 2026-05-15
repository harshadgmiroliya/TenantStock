import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import type { UserRole } from "../types/roles.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

export type JwtPayload = {
  sub: string;
  /** Company / tenant identifier (same id in this implementation) */
  companyId: string;
  tenantId: string;
  role: UserRole;
};

export function signToken(userId: string, tenantId: string, role: UserRole) {
  return jwt.sign({ sub: userId, companyId: tenantId, tenantId, role }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

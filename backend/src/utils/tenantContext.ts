import type { Request } from "express";
import type { Connection } from "mongoose";
import type { Types } from "mongoose";
import type { TenantModels } from "../models/tenant/registerTenantModels.js";
import { HttpError } from "./httpError.js";

export type TenantContext = {
  tenantId: Types.ObjectId;
  models: TenantModels;
  db: Connection;
};

export function getTenantContext(req: Request): TenantContext {
  if (!req.user?.tenantId || !req.tenantModels || !req.tenantDb) {
    throw new HttpError(500, "Tenant database context is not available");
  }
  return {
    tenantId: req.user.tenantId,
    models: req.tenantModels,
    db: req.tenantDb,
  };
}

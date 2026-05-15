import type { RequestHandler } from "express";
import { Tenant } from "../models/Tenant.js";
import { tenantDatabaseManager } from "../config/tenantDatabaseManager.js";
import { getTenantModels } from "../models/tenant/registerTenantModels.js";
import { HttpError } from "../utils/httpError.js";

/** After JWT auth: attach this tenant's dedicated MongoDB database. */
export const attachTenantDb: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.user?.tenantId) {
      throw new HttpError(401, "Unauthorized");
    }
    const tenantId = req.user.tenantId.toString();
    const tenant = await Tenant.findById(req.user.tenantId).select("dbName").lean();
    const dbName = tenant?.dbName;
    const conn = await tenantDatabaseManager.ensureTenantDatabase(tenantId, dbName);
    req.tenantDb = conn;
    req.tenantModels = getTenantModels(conn);
    next();
  } catch (err) {
    next(err);
  }
};

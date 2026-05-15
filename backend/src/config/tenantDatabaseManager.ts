import type { Connection } from "mongoose";
import mongoose from "mongoose";
import { getGlobalConnection } from "./db.js";
import { getTenantModels, syncTenantIndexes } from "../models/tenant/registerTenantModels.js";

/** One MongoDB database per tenant: `tenant_<tenantId>` */
export function tenantDatabaseName(tenantId: string) {
  return `tenant_${tenantId}`;
}

class TenantDatabaseManager {
  private readonly cache = new Map<string, Connection>();

  getConnection(tenantId: string, dbName?: string): Connection {
    const key = tenantId.toString();
    const cacheKey = `${key}:${dbName ?? ""}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const global = getGlobalConnection();
    if (global.readyState !== 1) {
      throw new Error("Global MongoDB connection is not ready");
    }

    const resolvedDb = dbName ?? tenantDatabaseName(key);
    const conn = global.useDb(resolvedDb, { useCache: true });
    getTenantModels(conn);
    this.cache.set(cacheKey, conn);
    return conn;
  }

  async ensureTenantDatabase(tenantId: string, dbName?: string) {
    const conn = this.getConnection(tenantId, dbName);
    await syncTenantIndexes(conn);
    return conn;
  }

  clearCache() {
    this.cache.clear();
  }
}

export const tenantDatabaseManager = new TenantDatabaseManager();

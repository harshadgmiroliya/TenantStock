import type { Connection } from "mongoose";
import type { Types } from "mongoose";
import type { UserRole } from "./roles.js";
import type { TenantModels } from "../models/tenant/registerTenantModels.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: Types.ObjectId;
        companyId: Types.ObjectId;
        tenantId: Types.ObjectId;
        role: UserRole;
      };
      /** Dedicated MongoDB connection for this tenant (`tenant_<tenantId>` database). */
      tenantDb?: Connection;
      tenantModels?: TenantModels;
    }
  }
}

export {};

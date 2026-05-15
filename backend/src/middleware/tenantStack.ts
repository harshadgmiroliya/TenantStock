import { requireAuth } from "./auth.js";
import { attachTenantDb } from "./attachTenantDb.js";
import { asyncHandler } from "./asyncHandler.js";

/** JWT validation + route to tenant-specific database. */
export const tenantStack = [requireAuth, asyncHandler(attachTenantDb)];

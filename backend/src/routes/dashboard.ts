import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { tenantStack } from "../middleware/tenantStack.js";
import { getDashboardSummary } from "../services/dashboardService.js";
import { getTenantContext } from "../utils/tenantContext.js";

export const dashboardRouter = Router();

dashboardRouter.use(tenantStack);

dashboardRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const { tenantId, models } = getTenantContext(req);
    const summary = await getDashboardSummary(tenantId, models);
    res.json(summary);
  })
);

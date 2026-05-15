import { Router } from "express";
import type { Request } from "express";
import { Types } from "mongoose";
import type { Server } from "socket.io";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { tenantStack } from "../middleware/tenantStack.js";
import { cancelSalesOrder, createSalesOrder, fulfillSalesOrder } from "../services/orderService.js";
import { getTenantContext } from "../utils/tenantContext.js";

export const salesOrdersRouter = Router();

salesOrdersRouter.use(tenantStack);

function getIo(req: Request): Server | undefined {
  return req.app.get("io") as Server | undefined;
}

salesOrdersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { tenantId, models } = getTenantContext(req);
    const rows = await models.SalesOrder.find({ tenantId }).sort({ createdAt: -1 }).lean();
    res.json(rows);
  })
);

salesOrdersRouter.post(
  "/",
  requireRole("Owner", "Manager", "Staff"),
  asyncHandler(async (req, res) => {
    const { tenantId, models } = getTenantContext(req);
    const { items } = req.body as { items?: { skuId: string; qtyOrdered: number }[] };
    if (!items?.length) {
      res.status(400).json({ error: "items required" });
      return;
    }
    const order = await createSalesOrder(
      tenantId,
      models,
      items.map((i) => ({ skuId: new Types.ObjectId(i.skuId), qtyOrdered: i.qtyOrdered })),
      getIo(req)
    );
    res.status(201).json(order);
  })
);

salesOrdersRouter.post(
  "/:id/fulfill",
  requireRole("Owner", "Manager"),
  asyncHandler(async (req, res) => {
    const { tenantId, models, db } = getTenantContext(req);
    const id = new Types.ObjectId(req.params.id);
    const order = await fulfillSalesOrder(id, tenantId, models, db, getIo(req));
    res.json(order);
  })
);

salesOrdersRouter.post(
  "/:id/cancel",
  requireRole("Owner", "Manager"),
  asyncHandler(async (req, res) => {
    const { tenantId, models, db } = getTenantContext(req);
    const id = new Types.ObjectId(req.params.id);
    await cancelSalesOrder(id, tenantId, models, db, getIo(req));
    res.status(204).end();
  })
);

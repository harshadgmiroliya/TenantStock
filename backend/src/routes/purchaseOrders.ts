import { Router } from "express";
import type { Request } from "express";
import { Types } from "mongoose";
import type { Server } from "socket.io";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { tenantStack } from "../middleware/tenantStack.js";
import { receivePurchaseOrderLines } from "../services/poService.js";
import { getTenantContext } from "../utils/tenantContext.js";

export const purchaseOrdersRouter = Router();

purchaseOrdersRouter.use(tenantStack);

function getIo(req: Request): Server | undefined {
  return req.app.get("io") as Server | undefined;
}

purchaseOrdersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { tenantId, models } = getTenantContext(req);
    const rows = await models.PurchaseOrder.find({ tenantId }).sort({ updatedAt: -1 }).lean();
    res.json(rows);
  })
);

purchaseOrdersRouter.post(
  "/",
  requireRole("Owner", "Manager"),
  asyncHandler(async (req, res) => {
    const { tenantId, models } = getTenantContext(req);
    const { supplierId, items, status } = req.body as {
      supplierId?: string;
      items?: { skuId: string; qtyOrdered: number; unitPrice: number }[];
      status?: string;
    };
    if (!supplierId || !items?.length) {
      res.status(400).json({ error: "supplierId and items required" });
      return;
    }
    const po = await models.PurchaseOrder.create({
      tenantId,
      supplierId: new Types.ObjectId(supplierId),
      status: (status as never) ?? "Draft",
      items: items.map((i) => ({
        skuId: new Types.ObjectId(i.skuId),
        qtyOrdered: i.qtyOrdered,
        qtyReceived: 0,
        unitPrice: i.unitPrice,
      })),
    });
    getIo(req)?.to(`tenant:${tenantId.toString()}`).emit("purchaseOrder:created", { id: po._id });
    res.status(201).json(po);
  })
);

purchaseOrdersRouter.patch(
  "/:id/status",
  requireRole("Owner", "Manager"),
  asyncHandler(async (req, res) => {
    const { tenantId, models } = getTenantContext(req);
    const id = new Types.ObjectId(req.params.id);
    const { status } = req.body as { status?: string };
    if (!status) {
      res.status(400).json({ error: "status required" });
      return;
    }
    const po = await models.PurchaseOrder.findOneAndUpdate({ _id: id, tenantId }, { $set: { status } }, { new: true });
    if (!po) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    getIo(req)?.to(`tenant:${tenantId.toString()}`).emit("purchaseOrder:updated", { id: po._id });
    res.json(po);
  })
);

purchaseOrdersRouter.post(
  "/:id/receive",
  requireRole("Owner", "Manager"),
  asyncHandler(async (req, res) => {
    const { tenantId, models, db } = getTenantContext(req);
    const id = new Types.ObjectId(req.params.id);
    const { receipts } = req.body as {
      receipts?: { skuId: string; qty: number; unitPrice?: number }[];
    };
    if (!receipts?.length) {
      res.status(400).json({ error: "receipts required" });
      return;
    }
    const po = await receivePurchaseOrderLines(
      id,
      tenantId,
      models,
      db,
      receipts.map((r) => ({
        skuId: new Types.ObjectId(r.skuId),
        qty: r.qty,
        unitPrice: r.unitPrice,
      })),
      getIo(req)
    );
    res.json(po);
  })
);

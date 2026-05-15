import { Router } from "express";
import type { Request } from "express";
import { Types } from "mongoose";
import type { Server } from "socket.io";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { tenantStack } from "../middleware/tenantStack.js";
import { HttpError } from "../utils/httpError.js";
import { getTenantContext } from "../utils/tenantContext.js";

export const stockMovementsRouter = Router();

stockMovementsRouter.use(tenantStack);

function getIo(req: Request): Server | undefined {
  return req.app.get("io") as Server | undefined;
}

stockMovementsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { tenantId, models } = getTenantContext(req);
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const rows = await models.StockMovement.find({ tenantId }).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(rows);
  })
);

stockMovementsRouter.post(
  "/adjustment",
  requireRole("Owner", "Manager"),
  asyncHandler(async (req, res) => {
    const { tenantId, models, db } = getTenantContext(req);
    const { skuId, quantityDelta, note } = req.body as {
      skuId?: string;
      quantityDelta?: number;
      note?: string;
    };
    if (!skuId || typeof quantityDelta !== "number") {
      res.status(400).json({ error: "skuId and quantityDelta required" });
      return;
    }
    const session = await db.startSession();
    try {
      await session.withTransaction(async () => {
        const sku = await models.Sku.findOne({ _id: new Types.ObjectId(skuId), tenantId }).session(session);
        if (!sku) {
          throw new HttpError(404, "SKU not found");
        }
        const next = sku.stock + quantityDelta;
        if (next < 0) {
          throw new HttpError(400, "Stock cannot go negative");
        }
        sku.stock = next;
        await sku.save({ session });
        await models.StockMovement.create(
          [
            {
              tenantId,
              skuId: sku._id,
              type: "adjustment",
              quantityDelta,
              refType: "Manual",
              note: note ?? "",
            },
          ],
          { session }
        );
      });
    } finally {
      await session.endSession();
    }
    getIo(req)?.to(`tenant:${tenantId.toString()}`).emit("inventory:updated", {});
    res.status(201).json({ ok: true });
  })
);

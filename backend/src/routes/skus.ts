import { Router } from "express";
import type { Request } from "express";
import { Types } from "mongoose";
import type { Server } from "socket.io";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { tenantStack } from "../middleware/tenantStack.js";
import { getTenantContext } from "../utils/tenantContext.js";

export const skusRouter = Router();

skusRouter.use(tenantStack);

function getIo(req: Request): Server | undefined {
  return req.app.get("io") as Server | undefined;
}

skusRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { tenantId, models } = getTenantContext(req);
    const items = await models.Sku.find({ tenantId }).sort({ skuCode: 1 }).lean();
    res.json(items);
  })
);

skusRouter.post(
  "/",
  requireRole("Owner", "Manager"),
  asyncHandler(async (req, res) => {
    const { tenantId, models } = getTenantContext(req);
    const { productId, skuCode, attributes, stock, reorderPoint, unitCost } = req.body as {
      productId?: string;
      skuCode?: string;
      attributes?: Record<string, string>;
      stock?: number;
      reorderPoint?: number;
      unitCost?: number;
    };
    if (!productId || !skuCode) {
      res.status(400).json({ error: "productId and skuCode required" });
      return;
    }
    const sku = await models.Sku.create({
      tenantId,
      productId: new Types.ObjectId(productId),
      skuCode,
      attributes: attributes ?? {},
      stock: stock ?? 0,
      reorderPoint: reorderPoint ?? 0,
      unitCost: unitCost ?? 0,
    });
    getIo(req)?.to(`tenant:${tenantId.toString()}`).emit("inventory:updated", {});
    res.status(201).json(sku);
  })
);

skusRouter.patch(
  "/:id",
  requireRole("Owner", "Manager"),
  asyncHandler(async (req, res) => {
    const { tenantId, models } = getTenantContext(req);
    const id = new Types.ObjectId(req.params.id);
    const sku = await models.Sku.findOneAndUpdate(
      { _id: id, tenantId },
      {
        $set: {
          skuCode: req.body.skuCode,
          attributes: req.body.attributes,
          reorderPoint: req.body.reorderPoint,
          unitCost: req.body.unitCost,
        },
      },
      { new: true }
    );
    if (!sku) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    getIo(req)?.to(`tenant:${tenantId.toString()}`).emit("inventory:updated", {});
    res.json(sku);
  })
);

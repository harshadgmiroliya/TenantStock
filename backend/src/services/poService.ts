import type { Connection } from "mongoose";
import type { Types } from "mongoose";
import type { TenantModels } from "../models/tenant/registerTenantModels.js";
import type { Server } from "socket.io";
import { invalidateDashboardCache } from "./dashboardService.js";

function tenantRoom(tenantId: Types.ObjectId) {
  return `tenant:${tenantId.toString()}`;
}

export async function receivePurchaseOrderLines(
  poId: Types.ObjectId,
  tenantId: Types.ObjectId,
  models: TenantModels,
  conn: Connection,
  receipts: { skuId: Types.ObjectId; qty: number; unitPrice?: number }[],
  io?: Server
) {
  const { PurchaseOrder, Sku, StockMovement } = models;
  const session = await conn.startSession();
  try {
    let resultPo = await PurchaseOrder.findOne({ _id: poId, tenantId });
    if (!resultPo) {
      const err = new Error("Purchase order not found");
      (err as { status?: number }).status = 404;
      throw err;
    }
    if (!["Sent", "Confirmed"].includes(resultPo.status)) {
      const err = new Error("PO must be Sent or Confirmed to receive");
      (err as { status?: number }).status = 400;
      throw err;
    }

    await session.withTransaction(async () => {
      const po = await PurchaseOrder.findOne({ _id: poId, tenantId }).session(session);
      if (!po) throw new Error("PO not found");
      for (const r of receipts) {
        const item = po.items.find((i: { skuId: Types.ObjectId }) => i.skuId.equals(r.skuId));
        if (!item) continue;
        const remaining = item.qtyOrdered - item.qtyReceived;
        const take = Math.min(r.qty, remaining);
        if (take <= 0) continue;
        const price = r.unitPrice ?? item.unitPrice;
        await Sku.updateOne({ _id: r.skuId, tenantId }, { $inc: { stock: take } }).session(session);
        item.qtyReceived += take;
        if (typeof r.unitPrice === "number") {
          item.unitPrice = r.unitPrice;
        }
        await StockMovement.create(
          [
            {
              tenantId,
              skuId: r.skuId,
              type: "purchase",
              quantityDelta: take,
              refType: "Receipt",
              refId: po._id,
              note: `PO receipt @ ${price}`,
            },
          ],
          { session }
        );
      }
      const complete = po.items.every((i: { qtyReceived: number; qtyOrdered: number }) => i.qtyReceived >= i.qtyOrdered);
      if (complete) po.status = "Received";
      else if (po.status === "Sent") po.status = "Confirmed";
      po.markModified("items");
      await po.save({ session });
      resultPo = po;
    });

    await invalidateDashboardCache(tenantId.toString());
    io?.to(tenantRoom(tenantId)).emit("purchaseOrder:updated", { id: poId });
    io?.to(tenantRoom(tenantId)).emit("inventory:updated", {});
    return resultPo!;
  } finally {
    await session.endSession();
  }
}

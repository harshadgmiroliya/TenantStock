import type { Connection } from "mongoose";
import type { Types } from "mongoose";
import type { TenantModels } from "../models/tenant/registerTenantModels.js";
import type { Server } from "socket.io";
import { atomicDecrementStock, atomicIncrementStock } from "./stockService.js";
import { invalidateDashboardCache } from "./dashboardService.js";

function tenantRoom(tenantId: Types.ObjectId) {
  return `tenant:${tenantId.toString()}`;
}

async function recordSaleMovement(
  models: TenantModels,
  tenantId: Types.ObjectId,
  skuId: Types.ObjectId,
  quantity: number,
  stockAfter: number | undefined,
  orderId: Types.ObjectId,
  session: import("mongoose").ClientSession
) {
  const stockBefore = stockAfter !== undefined ? stockAfter + quantity : undefined;
  await models.StockMovement.create(
    [
      {
        tenantId,
        skuId,
        type: "sale",
        quantityDelta: -quantity,
        refType: "SalesOrder",
        refId: orderId,
        note: stockBefore !== undefined ? `before:${stockBefore},after:${stockAfter}` : "",
      },
    ],
    { session }
  );
}

export async function createSalesOrder(
  tenantId: Types.ObjectId,
  models: TenantModels,
  items: { skuId: Types.ObjectId; qtyOrdered: number }[],
  io?: Server
) {
  if (!items.length) {
    const err = new Error("Order must include at least one line");
    (err as { status?: number }).status = 400;
    throw err;
  }
  const doc = await models.SalesOrder.create({
    tenantId,
    status: "pending",
    items: items.map((i) => ({ skuId: i.skuId, qtyOrdered: i.qtyOrdered, qtyFulfilled: 0 })),
  });
  io?.to(tenantRoom(tenantId)).emit("salesOrder:created", { id: doc._id });
  return doc;
}

export async function fulfillSalesOrder(
  orderId: Types.ObjectId,
  tenantId: Types.ObjectId,
  models: TenantModels,
  conn: Connection,
  io?: Server
) {
  const { SalesOrder } = models;
  const session = await conn.startSession();
  try {
    let updatedOrder = await SalesOrder.findOne({ _id: orderId, tenantId });
    if (!updatedOrder) {
      const err = new Error("Order not found");
      (err as { status?: number }).status = 404;
      throw err;
    }
    if (updatedOrder.status === "cancelled" || updatedOrder.status === "fulfilled") {
      return updatedOrder;
    }

    await session.withTransaction(async () => {
      const fresh = await SalesOrder.findOne({ _id: orderId, tenantId }).session(session);
      if (!fresh) throw new Error("Order not found");
      for (const line of fresh.items) {
        const need = line.qtyOrdered - line.qtyFulfilled;
        if (need <= 0) continue;

        const dec = await atomicDecrementStock(models, tenantId, line.skuId, need, session);
        const take = dec.applied;
        if (take <= 0) continue;

        line.qtyFulfilled += take;
        await recordSaleMovement(models, tenantId, line.skuId, take, dec.stockAfter, fresh._id, session);
      }
      const anyShort = fresh.items.some((l: { qtyFulfilled: number; qtyOrdered: number }) => l.qtyFulfilled < l.qtyOrdered);
      const anyFulfilled = fresh.items.some((l: { qtyFulfilled: number }) => l.qtyFulfilled > 0);
      fresh.status = anyShort ? (anyFulfilled ? "partial" : "pending") : "fulfilled";
      fresh.markModified("items");
      await fresh.save({ session });
      updatedOrder = fresh;
    });

    await invalidateDashboardCache(tenantId.toString());
    io?.to(tenantRoom(tenantId)).emit("inventory:updated", { orderId });
    return updatedOrder!;
  } finally {
    await session.endSession();
  }
}

export async function cancelSalesOrder(
  orderId: Types.ObjectId,
  tenantId: Types.ObjectId,
  models: TenantModels,
  conn: Connection,
  io?: Server
) {
  const { SalesOrder, StockMovement } = models;
  const session = await conn.startSession();
  try {
    await session.withTransaction(async () => {
      const order = await SalesOrder.findOne({ _id: orderId, tenantId }).session(session);
      if (!order) {
        const err = new Error("Order not found");
        (err as { status?: number }).status = 404;
        throw err;
      }
      if (order.status === "cancelled") return;
      for (const line of order.items) {
        const fulfilled = line.qtyFulfilled;
        if (fulfilled > 0) {
          await atomicIncrementStock(models, tenantId, line.skuId, fulfilled, session);
          await StockMovement.create(
            [
              {
                tenantId,
                skuId: line.skuId,
                type: "return",
                quantityDelta: fulfilled,
                refType: "SalesOrder",
                refId: order._id,
                note: "Sales order cancellation — stock returned",
              },
            ],
            { session }
          );
        }
        line.qtyFulfilled = 0;
      }
      order.status = "cancelled";
      order.markModified("items");
      await order.save({ session });
    });
    await invalidateDashboardCache(tenantId.toString());
    io?.to(tenantRoom(tenantId)).emit("inventory:updated", { orderId });
  } finally {
    await session.endSession();
  }
}

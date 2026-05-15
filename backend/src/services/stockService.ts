import type { ClientSession, Types } from "mongoose";
import type { TenantModels } from "../models/tenant/registerTenantModels.js";

type SkuStockLean = { stock?: number } | null;

export type AtomicDecrementResult = {
  ok: boolean;
  applied: number;
  stockAfter?: number;
};

/**
 * Atomically decrement SKU stock only when enough quantity is available.
 * Prevents negative stock under concurrent orders (assignment requirement).
 *
 * Equivalent to:
 *   updateOne({ _id, stock: { $gte: qty } }, { $inc: { stock: -qty } })
 */
export async function atomicDecrementStock(
  models: TenantModels,
  tenantId: Types.ObjectId,
  skuId: Types.ObjectId,
  quantity: number,
  session?: ClientSession
): Promise<AtomicDecrementResult> {
  if (quantity <= 0) return { ok: true, applied: 0 };

  const res = await models.Sku.findOneAndUpdate(
    { _id: skuId, tenantId, stock: { $gte: quantity } },
    { $inc: { stock: -quantity } },
    { new: true, session }
  ).lean() as SkuStockLean;

  if (!res) {
    let q = models.Sku.findOne({ _id: skuId, tenantId }).select("stock");
    if (session) q = q.session(session);
    const current = (await q.lean()) as SkuStockLean;
    const available = typeof current?.stock === "number" ? current.stock : 0;
    const applied = Math.min(quantity, Math.max(0, available));
    if (applied <= 0) return { ok: false, applied: 0 };
    return atomicDecrementStock(models, tenantId, skuId, applied, session);
  }

  const stockAfter = typeof res.stock === "number" ? res.stock : undefined;
  return { ok: true, applied: quantity, stockAfter };
}

export async function atomicIncrementStock(
  models: TenantModels,
  tenantId: Types.ObjectId,
  skuId: Types.ObjectId,
  quantity: number,
  session?: ClientSession
) {
  if (quantity <= 0) return;
  await models.Sku.updateOne({ _id: skuId, tenantId }, { $inc: { stock: quantity } }, { session });
}

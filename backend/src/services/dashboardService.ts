import type { Types } from "mongoose";
import type { TenantModels } from "../models/tenant/registerTenantModels.js";
import { cacheDel, cacheGet, cacheSet, dashboardCacheKey } from "./cacheService.js";

const OPEN_PO_STATUSES = ["Draft", "Sent", "Confirmed"] as const;
const CACHE_TTL = Number(process.env.DASHBOARD_CACHE_TTL_SECONDS) || 60;

async function computeDashboardSummary(tenantId: Types.ObjectId, models: TenantModels) {
  const tid = tenantId;

  const [inventoryAgg] = await models.Sku.aggregate([
    { $match: { tenantId: tid } },
    {
      $group: {
        _id: null,
        inventoryValue: { $sum: { $multiply: ["$stock", "$unitCost"] } },
        skuCount: { $sum: 1 },
      },
    },
  ]);

  const inboundBySku = await models.PurchaseOrder.aggregate([
    { $match: { tenantId: tid, status: { $in: [...OPEN_PO_STATUSES] } } },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.skuId",
        inbound: { $sum: { $subtract: ["$items.qtyOrdered", "$items.qtyReceived"] } },
      },
    },
  ]);
  const inboundMap = new Map<string, number>();
  for (const row of inboundBySku) {
    inboundMap.set(String(row._id), Math.max(0, row.inbound as number));
  }

  // Low-stock via aggregation — avoids loading 10k+ SKU documents into Node memory
  const lowStockAgg = await models.Sku.aggregate([
    { $match: { tenantId: tid, $expr: { $lt: ["$stock", "$reorderPoint"] } } },
    {
      $project: {
        skuCode: 1,
        stock: 1,
        reorderPoint: 1,
        inbound: { $literal: 0 },
      },
    },
    { $limit: 200 },
  ]);
  const lowStockSkus = lowStockAgg
    .map((s) => ({
      _id: s._id,
      skuCode: s.skuCode,
      stock: s.stock,
      reorderPoint: s.reorderPoint,
      inbound: inboundMap.get(String(s._id)) ?? 0,
    }))
    .filter((s) => s.stock + s.inbound < s.reorderPoint)
    .slice(0, 50);

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const topSellers = await models.StockMovement.aggregate([
    { $match: { tenantId: tid, type: "sale", createdAt: { $gte: since30 } } },
    { $group: { _id: "$skuId", units: { $sum: { $abs: "$quantityDelta" } } } },
    { $sort: { units: -1 } },
    { $limit: 5 },
    { $lookup: { from: "skus", localField: "_id", foreignField: "_id", as: "sku" } },
    { $unwind: "$sku" },
    { $project: { skuId: "$_id", skuCode: "$sku.skuCode", productId: "$sku.productId", units: 1 } },
  ]);

  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const stockMovement7d = await models.StockMovement.aggregate([
    { $match: { tenantId: tid, createdAt: { $gte: since7 } } },
    {
      $group: {
        _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } },
        netMovement: { $sum: "$quantityDelta" },
      },
    },
    { $sort: { "_id.day": 1 } },
    { $project: { _id: 0, day: "$_id.day", netMovement: 1 } },
  ]);

  return {
    inventoryValue: inventoryAgg?.inventoryValue ?? 0,
    skuCount: inventoryAgg?.skuCount ?? 0,
    lowStockSkus,
    topSellers,
    stockMovement7d,
  };
}

export async function getDashboardSummary(tenantId: Types.ObjectId, models: TenantModels) {
  const cacheKey = dashboardCacheKey(tenantId.toString());
  const cached = await cacheGet<Awaited<ReturnType<typeof computeDashboardSummary>>>(cacheKey);
  if (cached) return { ...cached, cached: true };

  const summary = await computeDashboardSummary(tenantId, models);
  await cacheSet(cacheKey, summary, CACHE_TTL);
  return { ...summary, cached: false };
}

export async function invalidateDashboardCache(tenantId: string) {
  await cacheDel(dashboardCacheKey(tenantId));
}

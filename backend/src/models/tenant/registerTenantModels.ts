import type { Connection, Model, Schema } from "mongoose";
import {
  attributeSchema,
  productSchema,
  productVariantSchema,
  purchaseOrderSchema,
  salesOrderSchema,
  skuSchema,
  stockMovementSchema,
  supplierSchema,
} from "./schemas.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function modelOn(conn: Connection, name: string, schema: Schema): Model<any> {
  return conn.models[name] ?? conn.model(name, schema);
}

export type TenantModels = {
  Attribute: Model<any>;
  Product: Model<any>;
  ProductVariant: Model<any>;
  Sku: Model<any>;
  Supplier: Model<any>;
  PurchaseOrder: Model<any>;
  SalesOrder: Model<any>;
  StockMovement: Model<any>;
};

export function getTenantModels(conn: Connection): TenantModels {
  return {
    Attribute: modelOn(conn, "Attribute", attributeSchema),
    Product: modelOn(conn, "Product", productSchema),
    ProductVariant: modelOn(conn, "ProductVariant", productVariantSchema),
    Sku: modelOn(conn, "Sku", skuSchema),
    Supplier: modelOn(conn, "Supplier", supplierSchema),
    PurchaseOrder: modelOn(conn, "PurchaseOrder", purchaseOrderSchema),
    SalesOrder: modelOn(conn, "SalesOrder", salesOrderSchema),
    StockMovement: modelOn(conn, "StockMovement", stockMovementSchema),
  };
}

export async function syncTenantIndexes(conn: Connection) {
  const m = getTenantModels(conn);
  await Promise.all([
    m.Attribute.syncIndexes(),
    m.Product.syncIndexes(),
    m.ProductVariant.syncIndexes(),
    m.Sku.syncIndexes(),
    m.Supplier.syncIndexes(),
    m.PurchaseOrder.syncIndexes(),
    m.SalesOrder.syncIndexes(),
    m.StockMovement.syncIndexes(),
  ]);
}

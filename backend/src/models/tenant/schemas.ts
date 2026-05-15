import mongoose, { Schema } from "mongoose";
export type AttributeOption = {
  label: string;
  slug: string;
  sortOrder?: number;
};

export type ProductAttributeSelection = {
  attributeId: mongoose.Types.ObjectId;
  optionSlugs: string[];
};

export type PoStatus = "Draft" | "Sent" | "Confirmed" | "Received";
export type SalesOrderStatus = "pending" | "partial" | "fulfilled" | "cancelled";
export type MovementType = "purchase" | "sale" | "return" | "adjustment";

const tenantIdField = { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true };

const attributeOptionSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

export const attributeSchema = new Schema(
  {
    tenantId: tenantIdField,
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    options: { type: [attributeOptionSchema], default: [] },
  },
  { timestamps: true, collection: "attributes" }
);
attributeSchema.index({ slug: 1 }, { unique: true });
attributeSchema.index({ name: 1 });
attributeSchema.pre("validate", function (next) {
  const slugs = (this.options ?? []).map((o: { slug: string }) => o.slug);
  if (new Set(slugs).size !== slugs.length) {
    this.invalidate("options", "Each option slug must be unique within the attribute");
  }
  next();
});

const productAttributeSelectionSchema = new Schema(
  {
    attributeId: { type: Schema.Types.ObjectId, ref: "Attribute", required: true },
    optionSlugs: {
      type: [{ type: String, trim: true, lowercase: true }],
      required: true,
      validate: {
        validator: (v: string[]) => Array.isArray(v) && v.length > 0,
        message: "At least one option slug is required per attribute",
      },
    },
  },
  { _id: false }
);

export const productSchema = new Schema(
  {
    tenantId: tenantIdField,
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    attributeSelections: { type: [productAttributeSelectionSchema], default: [] },
  },
  { timestamps: true }
);
productSchema.index({ name: 1 });
productSchema.index({ "attributeSelections.attributeId": 1 });
productSchema.pre("validate", function (next) {
  const ids = (this.attributeSelections ?? []).map((s: { attributeId?: { toString: () => string } }) =>
    s.attributeId?.toString()
  );
  if (new Set(ids).size !== ids.length) {
    this.invalidate("attributeSelections", "Each attribute can only be selected once per product");
  }
  next();
});

const variantSelectionSchema = new Schema(
  {
    attributeId: { type: Schema.Types.ObjectId, ref: "Attribute", required: true },
    optionSlug: { type: String, required: true, trim: true, lowercase: true },
  },
  { _id: false }
);

export const productVariantSchema = new Schema(
  {
    tenantId: tenantIdField,
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    sku: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    selections: { type: [variantSelectionSchema], default: [] },
  },
  { timestamps: true, collection: "productvariants" }
);
productVariantSchema.index({ sku: 1 }, { unique: true });
productVariantSchema.index({ productId: 1, sku: 1 });

export const skuSchema = new Schema(
  {
    tenantId: tenantIdField,
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    skuCode: { type: String, required: true },
    attributes: { type: Map, of: String, default: {} },
    stock: { type: Number, required: true, default: 0, min: 0 },
    reorderPoint: { type: Number, required: true, default: 0, min: 0 },
    unitCost: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);
skuSchema.index({ skuCode: 1 }, { unique: true });
skuSchema.index({ productId: 1 });

export const supplierSchema = new Schema(
  {
    tenantId: tenantIdField,
    name: { type: String, required: true },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    defaultLeadDays: { type: Number, default: 7 },
  },
  { timestamps: true }
);
supplierSchema.index({ name: 1 });

const poItemSchema = new Schema(
  {
    skuId: { type: Schema.Types.ObjectId, ref: "Sku", required: true },
    qtyOrdered: { type: Number, required: true, min: 1 },
    qtyReceived: { type: Number, required: true, default: 0, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

export const purchaseOrderSchema = new Schema(
  {
    tenantId: tenantIdField,
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
    status: {
      type: String,
      enum: ["Draft", "Sent", "Confirmed", "Received"] satisfies PoStatus[],
      default: "Draft",
    },
    items: { type: [poItemSchema], default: [] },
  },
  { timestamps: true }
);
purchaseOrderSchema.index({ status: 1, updatedAt: -1 });

const salesItemSchema = new Schema(
  {
    skuId: { type: Schema.Types.ObjectId, ref: "Sku", required: true },
    qtyOrdered: { type: Number, required: true, min: 1 },
    qtyFulfilled: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: false }
);

export const salesOrderSchema = new Schema(
  {
    tenantId: tenantIdField,
    status: {
      type: String,
      enum: ["pending", "partial", "fulfilled", "cancelled"] satisfies SalesOrderStatus[],
      default: "pending",
    },
    items: { type: [salesItemSchema], default: [] },
  },
  { timestamps: true }
);
salesOrderSchema.index({ createdAt: -1 });
salesOrderSchema.index({ status: 1 });

export const stockMovementSchema = new Schema(
  {
    tenantId: tenantIdField,
    skuId: { type: Schema.Types.ObjectId, ref: "Sku", required: true, index: true },
    type: {
      type: String,
      enum: ["purchase", "sale", "return", "adjustment"] satisfies MovementType[],
      required: true,
    },
    quantityDelta: { type: Number, required: true },
    refType: { type: String, enum: ["PurchaseOrder", "SalesOrder", "Manual", "Receipt"], default: "Manual" },
    refId: { type: Schema.Types.ObjectId },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);
stockMovementSchema.index({ createdAt: -1 });
stockMovementSchema.index({ skuId: 1, createdAt: -1 });

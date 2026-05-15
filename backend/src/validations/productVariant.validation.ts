import { Types } from "mongoose";

export type CreateProductVariantInput = {
  productId: string;
  sku: string;
  price: number;
  stock: number;
  selections: { attributeId: string; optionSlug: string }[];
};

export type UpdateProductVariantInput = Partial<Omit<CreateProductVariantInput, "productId">> & {
  productId?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function normalizeSku(raw: string): string {
  return raw.trim();
}

function parseSelections(selections: unknown): { ok: true; value: { attributeId: string; optionSlug: string }[] } | { ok: false; errors: string[] } {
  if (!Array.isArray(selections)) return { ok: false, errors: ["selections must be an array"] };
  const errors: string[] = [];
  const parsed: { attributeId: string; optionSlug: string }[] = [];
  for (let i = 0; i < selections.length; i++) {
    const row = selections[i];
    if (!isRecord(row)) {
      errors.push(`selections[${i}] must be an object`);
      continue;
    }
    const aid = row.attributeId;
    const opt = row.optionSlug;
    if (typeof aid !== "string" || !Types.ObjectId.isValid(aid)) errors.push(`selections[${i}].attributeId invalid`);
    if (typeof opt !== "string" || !opt.trim()) errors.push(`selections[${i}].optionSlug is required`);
    if (typeof aid === "string" && Types.ObjectId.isValid(aid) && typeof opt === "string" && opt.trim()) {
      parsed.push({ attributeId: aid, optionSlug: opt.trim().toLowerCase() });
    }
  }
  if (!parsed.length) errors.push("selections must contain at least one entry");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: parsed };
}

export function validateCreateProductVariant(body: unknown): { ok: true; value: CreateProductVariantInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(body)) return { ok: false, errors: ["Body must be a JSON object"] };
  const { productId, sku, price, stock, selections } = body;
  if (typeof productId !== "string" || !Types.ObjectId.isValid(productId)) errors.push("productId must be a valid ObjectId");
  if (typeof sku !== "string" || !sku.trim()) errors.push("sku is required");
  if (typeof price !== "number" || Number.isNaN(price) || price < 0) errors.push("price must be a number >= 0");
  if (typeof stock !== "number" || Number.isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
    errors.push("stock must be a non-negative integer");
  }
  const sel = parseSelections(selections);
  if (!sel.ok) errors.push(...sel.errors);
  if (errors.length) return { ok: false, errors };
  if (!sel.ok) return { ok: false, errors: ["Invalid selections"] };
  return {
    ok: true,
    value: {
      productId: productId as string,
      sku: normalizeSku(sku as string),
      price: price as number,
      stock: stock as number,
      selections: sel.value,
    },
  };
}

export function validateUpdateProductVariant(body: unknown): { ok: true; value: UpdateProductVariantInput } | { ok: false; errors: string[] } {
  if (!isRecord(body)) return { ok: false, errors: ["Body must be a JSON object"] };
  const errors: string[] = [];
  const out: UpdateProductVariantInput = {};
  if ("productId" in body && body.productId !== undefined) {
    if (typeof body.productId !== "string" || !Types.ObjectId.isValid(body.productId)) errors.push("productId invalid");
    else out.productId = body.productId;
  }
  if ("sku" in body && body.sku !== undefined) {
    if (typeof body.sku !== "string" || !body.sku.trim()) errors.push("sku invalid");
    else out.sku = normalizeSku(body.sku);
  }
  if ("price" in body && body.price !== undefined) {
    if (typeof body.price !== "number" || body.price < 0) errors.push("price invalid");
    else out.price = body.price;
  }
  if ("stock" in body && body.stock !== undefined) {
    if (typeof body.stock !== "number" || body.stock < 0 || !Number.isInteger(body.stock)) errors.push("stock invalid");
    else out.stock = body.stock;
  }
  if ("selections" in body && body.selections !== undefined) {
    const sel = parseSelections(body.selections);
    if (!sel.ok) errors.push(...sel.errors);
    else out.selections = sel.value;
  }
  if (!Object.keys(out).length) errors.push("No valid fields to update");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: out };
}

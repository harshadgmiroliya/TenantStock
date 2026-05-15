import type { Request, Response } from "express";
import { Types } from "mongoose";
import { HttpError } from "../utils/httpError.js";
import { getTenantContext } from "../utils/tenantContext.js";
import {
  validateCreateProductVariant,
  validateUpdateProductVariant,
} from "../validations/productVariant.validation.js";

async function assertSelectionsValid(
  tenantId: Types.ObjectId,
  selections: { attributeId: string; optionSlug: string }[],
  Attribute: ReturnType<typeof getTenantContext>["models"]["Attribute"]
) {
  const ids = [...new Set(selections.map((s) => s.attributeId))].map((id) => new Types.ObjectId(id));
  const attrs = (await Attribute.find({ tenantId, _id: { $in: ids } }).lean()) as unknown as {
    _id: Types.ObjectId;
    slug: string;
    options: { slug: string }[];
  }[];
  if (attrs.length !== ids.length) {
    throw new HttpError(400, "One or more attributes do not exist for this tenant");
  }
  for (const sel of selections) {
    const attr = attrs.find((a) => a._id.toString() === sel.attributeId);
    if (!attr) throw new HttpError(400, "Invalid attribute reference");
    const match = attr.options.some((o) => o.slug === sel.optionSlug);
    if (!match) {
      throw new HttpError(400, `Option "${sel.optionSlug}" is not valid for attribute "${attr.slug}"`);
    }
  }
}

function handleMongoWrite(err: unknown) {
  if (typeof err === "object" && err !== null && "code" in err && (err as { code: number }).code === 11000) {
    throw new HttpError(409, "A variant with this SKU already exists for this tenant");
  }
  throw err;
}

export async function listProductVariants(req: Request, res: Response) {
  const { tenantId, models } = getTenantContext(req);
  const { productId } = req.query;
  const filter: Record<string, unknown> = { tenantId };
  if (typeof productId === "string" && Types.ObjectId.isValid(productId)) {
    filter.productId = new Types.ObjectId(productId);
  }
  const rows = await models.ProductVariant.find(filter).sort({ updatedAt: -1 }).lean();
  res.json(rows);
}

export async function getProductVariantById(req: Request, res: Response) {
  const { tenantId, models } = getTenantContext(req);
  const id = new Types.ObjectId(req.params.id);
  const doc = await models.ProductVariant.findOne({ _id: id, tenantId }).lean();
  if (!doc) throw new HttpError(404, "Variant not found");
  res.json(doc);
}

export async function createProductVariant(req: Request, res: Response) {
  const { tenantId, models } = getTenantContext(req);
  const parsed = validateCreateProductVariant(req.body);
  if (!parsed.ok) throw new HttpError(400, parsed.errors.join("; "));
  const product = await models.Product.findOne({ _id: new Types.ObjectId(parsed.value.productId), tenantId });
  if (!product) throw new HttpError(400, "Product not found for this tenant");
  await assertSelectionsValid(tenantId, parsed.value.selections, models.Attribute);
  try {
    const created = await models.ProductVariant.create({
      tenantId,
      productId: new Types.ObjectId(parsed.value.productId),
      sku: parsed.value.sku,
      price: parsed.value.price,
      stock: parsed.value.stock,
      selections: parsed.value.selections.map((s) => ({
        attributeId: new Types.ObjectId(s.attributeId),
        optionSlug: s.optionSlug,
      })),
    });
    res.status(201).json(created.toJSON());
  } catch (err) {
    handleMongoWrite(err);
  }
}

export async function updateProductVariant(req: Request, res: Response) {
  const { tenantId, models } = getTenantContext(req);
  const id = new Types.ObjectId(req.params.id);
  const parsed = validateUpdateProductVariant(req.body);
  if (!parsed.ok) throw new HttpError(400, parsed.errors.join("; "));
  const existing = await models.ProductVariant.findOne({ _id: id, tenantId });
  if (!existing) throw new HttpError(404, "Variant not found");

  if (parsed.value.productId) {
    const product = await models.Product.findOne({ _id: new Types.ObjectId(parsed.value.productId), tenantId });
    if (!product) throw new HttpError(400, "Product not found for this tenant");
  }

  if (parsed.value.selections) {
    await assertSelectionsValid(tenantId, parsed.value.selections, models.Attribute);
  }

  const update: Record<string, unknown> = {};
  if (parsed.value.sku !== undefined) update.sku = parsed.value.sku;
  if (parsed.value.price !== undefined) update.price = parsed.value.price;
  if (parsed.value.stock !== undefined) update.stock = parsed.value.stock;
  if (parsed.value.productId !== undefined) update.productId = new Types.ObjectId(parsed.value.productId);
  if (parsed.value.selections !== undefined) {
    update.selections = parsed.value.selections.map((s) => ({
      attributeId: new Types.ObjectId(s.attributeId),
      optionSlug: s.optionSlug,
    }));
  }

  try {
    const updated = await models.ProductVariant.findOneAndUpdate({ _id: id, tenantId }, { $set: update }, {
      new: true,
      runValidators: true,
    });
    if (!updated) throw new HttpError(404, "Variant not found");
    res.json(updated.toJSON());
  } catch (err) {
    handleMongoWrite(err);
  }
}

export async function deleteProductVariant(req: Request, res: Response) {
  const { tenantId, models } = getTenantContext(req);
  const id = new Types.ObjectId(req.params.id);
  const deleted = await models.ProductVariant.findOneAndDelete({ _id: id, tenantId });
  if (!deleted) throw new HttpError(404, "Variant not found");
  res.status(204).send();
}

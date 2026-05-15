import type { Request, Response } from "express";
import { Types } from "mongoose";
import { HttpError } from "../utils/httpError.js";
import { getTenantContext } from "../utils/tenantContext.js";
import type { ProductAttributeSelectionInput } from "../validations/product.validation.js";
import { validateCreateProduct, validateUpdateProduct } from "../validations/product.validation.js";

const selectionPopulate = { path: "attributeSelections.attributeId", select: "name slug options" };

async function assertAttributeSelections(
  tenantId: Types.ObjectId,
  selections: ProductAttributeSelectionInput[],
  Attribute: ReturnType<typeof getTenantContext>["models"]["Attribute"]
) {
  if (!selections.length) return;
  const ids = selections.map((s) => new Types.ObjectId(s.attributeId));
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
    if (!attr) continue;
    const validSlugs = new Set(attr.options.map((o) => o.slug));
    for (const slug of sel.optionSlugs) {
      if (!validSlugs.has(slug)) {
        throw new HttpError(400, `Option "${slug}" is not valid for attribute "${attr.slug}"`);
      }
    }
  }
}

function toDbSelections(selections: ProductAttributeSelectionInput[]) {
  return selections.map((s) => ({
    attributeId: new Types.ObjectId(s.attributeId),
    optionSlugs: s.optionSlugs,
  }));
}

export async function listProducts(req: Request, res: Response) {
  const { tenantId, models } = getTenantContext(req);
  const items = await models.Product.find({ tenantId }).populate(selectionPopulate).sort({ name: 1 }).lean();
  res.json(items);
}

export async function getProductById(req: Request, res: Response) {
  const { tenantId, models } = getTenantContext(req);
  const id = new Types.ObjectId(req.params.id);
  const doc = await models.Product.findOne({ _id: id, tenantId }).populate(selectionPopulate).lean();
  if (!doc) throw new HttpError(404, "Product not found");
  res.json(doc);
}

export async function createProduct(req: Request, res: Response) {
  const { tenantId, models } = getTenantContext(req);
  const parsed = validateCreateProduct(req.body);
  if (!parsed.ok) throw new HttpError(400, parsed.errors.join("; "));
  await assertAttributeSelections(tenantId, parsed.value.attributeSelections, models.Attribute);
  const created = await models.Product.create({
    tenantId,
    name: parsed.value.name,
    description: parsed.value.description,
    attributeSelections: toDbSelections(parsed.value.attributeSelections),
  });
  const doc = await models.Product.findById(created._id).populate(selectionPopulate).lean();
  res.status(201).json(doc);
}

export async function updateProduct(req: Request, res: Response) {
  const { tenantId, models } = getTenantContext(req);
  const id = new Types.ObjectId(req.params.id);
  const parsed = validateUpdateProduct(req.body);
  if (!parsed.ok) throw new HttpError(400, parsed.errors.join("; "));
  if (parsed.value.attributeSelections !== undefined) {
    await assertAttributeSelections(tenantId, parsed.value.attributeSelections, models.Attribute);
  }
  const update: Record<string, unknown> = {};
  if (parsed.value.name !== undefined) update.name = parsed.value.name;
  if (parsed.value.description !== undefined) update.description = parsed.value.description;
  if (parsed.value.attributeSelections !== undefined) {
    update.attributeSelections = toDbSelections(parsed.value.attributeSelections);
  }
  const updated = await models.Product.findOneAndUpdate({ _id: id, tenantId }, { $set: update }, { new: true, runValidators: true })
    .populate(selectionPopulate)
    .lean();
  if (!updated) throw new HttpError(404, "Product not found");
  res.json(updated);
}

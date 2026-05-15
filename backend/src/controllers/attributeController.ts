import type { Request, Response } from "express";
import { Types } from "mongoose";
import { HttpError } from "../utils/httpError.js";
import { getTenantContext } from "../utils/tenantContext.js";
import { validateCreateAttribute, validateUpdateAttribute } from "../validations/attribute.validation.js";

function handleMongoWrite(err: unknown) {
  if (typeof err === "object" && err !== null && "code" in err && (err as { code: number }).code === 11000) {
    throw new HttpError(409, "An attribute with this slug already exists for this tenant");
  }
  throw err;
}

export async function listAttributes(req: Request, res: Response) {
  const { models } = getTenantContext(req);
  const rows = await models.Attribute.find({}).sort({ name: 1 }).lean();
  res.json(rows);
}

export async function getAttributeById(req: Request, res: Response) {
  const { models } = getTenantContext(req);
  const id = new Types.ObjectId(req.params.id);
  const doc = await models.Attribute.findById(id).lean();
  if (!doc) throw new HttpError(404, "Attribute not found");
  res.json(doc);
}

export async function createAttribute(req: Request, res: Response) {
  const { tenantId, models } = getTenantContext(req);
  const parsed = validateCreateAttribute(req.body);
  if (!parsed.ok) throw new HttpError(400, parsed.errors.join("; "));
  try {
    const created = await models.Attribute.create({
      tenantId,
      name: parsed.value.name,
      slug: parsed.value.slug,
      options: parsed.value.options,
    });
    res.status(201).json(created.toJSON());
  } catch (err) {
    handleMongoWrite(err);
  }
}

export async function updateAttribute(req: Request, res: Response) {
  const { models } = getTenantContext(req);
  const id = new Types.ObjectId(req.params.id);
  const parsed = validateUpdateAttribute(req.body);
  if (!parsed.ok) throw new HttpError(400, parsed.errors.join("; "));
  const { name, slug, options } = parsed.value;
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (slug !== undefined) update.slug = slug;
  if (options !== undefined) update.options = options;
  try {
    const updated = await models.Attribute.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
    if (!updated) throw new HttpError(404, "Attribute not found");
    res.json(updated.toJSON());
  } catch (err) {
    handleMongoWrite(err);
  }
}

export async function deleteAttribute(req: Request, res: Response) {
  const { models } = getTenantContext(req);
  const id = new Types.ObjectId(req.params.id);
  const inUse = await models.ProductVariant.exists({ "selections.attributeId": id });
  if (inUse) {
    throw new HttpError(409, "Cannot delete attribute that is referenced by product variants");
  }
  const deleted = await models.Attribute.findByIdAndDelete(id);
  if (!deleted) throw new HttpError(404, "Attribute not found");
  res.status(204).send();
}

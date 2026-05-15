import { Types } from "mongoose";

export type ProductAttributeSelectionInput = {
  attributeId: string;
  optionSlugs: string[];
};

export type CreateProductInput = {
  name: string;
  description: string;
  attributeSelections: ProductAttributeSelectionInput[];
};

export type UpdateProductInput = {
  name?: string;
  description?: string;
  attributeSelections?: ProductAttributeSelectionInput[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

export function parseAttributeSelections(
  raw: unknown,
  errors: string[],
  required = false
): ProductAttributeSelectionInput[] | undefined {
  if (raw === undefined) {
    if (required) errors.push("attributeSelections must be provided (use [] if none)");
    return undefined;
  }
  if (!Array.isArray(raw)) {
    errors.push("attributeSelections must be an array");
    return undefined;
  }
  const parsed: ProductAttributeSelectionInput[] = [];
  const seenAttrs = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!isRecord(row)) {
      errors.push(`attributeSelections[${i}] must be an object`);
      continue;
    }
    const attributeId = row.attributeId;
    const optionSlugs = row.optionSlugs;
    if (typeof attributeId !== "string" || !Types.ObjectId.isValid(attributeId)) {
      errors.push(`attributeSelections[${i}].attributeId must be a valid ObjectId`);
      continue;
    }
    if (seenAttrs.has(attributeId)) {
      errors.push(`attributeSelections[${i}]: duplicate attribute`);
      continue;
    }
    seenAttrs.add(attributeId);
    if (!Array.isArray(optionSlugs) || !optionSlugs.length) {
      errors.push(`attributeSelections[${i}].optionSlugs must be a non-empty array`);
      continue;
    }
    const slugs: string[] = [];
    for (let j = 0; j < optionSlugs.length; j++) {
      const s = optionSlugs[j];
      if (typeof s !== "string" || !s.trim()) {
        errors.push(`attributeSelections[${i}].optionSlugs[${j}] must be a non-empty string`);
      } else {
        slugs.push(normalizeSlug(s));
      }
    }
    const uniqueSlugs = new Set(slugs);
    if (uniqueSlugs.size !== slugs.length) {
      errors.push(`attributeSelections[${i}].optionSlugs must not contain duplicates`);
    }
    if (slugs.length) {
      parsed.push({ attributeId, optionSlugs: slugs });
    }
  }
  return parsed;
}

export function validateCreateProduct(body: unknown): { ok: true; value: CreateProductInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(body)) return { ok: false, errors: ["Body must be a JSON object"] };
  const name = body.name;
  const description = body.description;
  if (typeof name !== "string" || !name.trim()) errors.push("name is required");
  const attributeSelections = parseAttributeSelections(body.attributeSelections, errors, true);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: (name as string).trim(),
      description: typeof description === "string" ? description.trim() : "",
      attributeSelections: attributeSelections ?? [],
    },
  };
}

export function validateUpdateProduct(body: unknown): { ok: true; value: UpdateProductInput } | { ok: false; errors: string[] } {
  if (!isRecord(body)) return { ok: false, errors: ["Body must be a JSON object"] };
  const errors: string[] = [];
  const out: UpdateProductInput = {};
  if ("name" in body) {
    if (typeof body.name !== "string" || !body.name.trim()) errors.push("name must be a non-empty string");
    else out.name = body.name.trim();
  }
  if ("description" in body) {
    if (typeof body.description !== "string") errors.push("description must be a string");
    else out.description = body.description.trim();
  }
  if ("attributeSelections" in body) {
    const selections = parseAttributeSelections(body.attributeSelections, errors);
    if (selections !== undefined) out.attributeSelections = selections;
  }
  if (!Object.keys(out).length) errors.push("No valid fields to update");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: out };
}

import type { AttributeOption } from "../models/tenant/schemas.js";

export type CreateAttributeInput = {
  name: string;
  slug: string;
  options: AttributeOption[];
};

export type UpdateAttributeInput = {
  name?: string;
  slug?: string;
  options?: AttributeOption[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

function parseOption(raw: unknown, idx: number): { ok: true; value: AttributeOption } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: `options[${idx}] must be an object` };
  const label = raw.label;
  const slug = raw.slug;
  const sortOrder = raw.sortOrder;
  if (typeof label !== "string" || !label.trim()) return { ok: false, error: `options[${idx}].label is required` };
  if (typeof slug !== "string" || !slug.trim()) return { ok: false, error: `options[${idx}].slug is required` };
  if (sortOrder !== undefined && typeof sortOrder !== "number") {
    return { ok: false, error: `options[${idx}].sortOrder must be a number` };
  }
  return {
    ok: true,
    value: {
      label: label.trim(),
      slug: normalizeSlug(slug),
      sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
    },
  };
}

export function validateCreateAttribute(body: unknown): { ok: true; value: CreateAttributeInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(body)) return { ok: false, errors: ["Body must be a JSON object"] };
  const name = body.name;
  const slug = body.slug;
  const options = body.options;
  if (typeof name !== "string" || !name.trim()) errors.push("name is required");
  if (typeof slug !== "string" || !slug.trim()) errors.push("slug is required");
  if (!Array.isArray(options)) errors.push("options must be an array");
  if (errors.length) return { ok: false, errors };
  const parsedOptions: AttributeOption[] = [];
  for (let i = 0; i < (options as unknown[]).length; i++) {
    const r = parseOption((options as unknown[])[i], i);
    if (!r.ok) errors.push(r.error);
    else parsedOptions.push(r.value);
  }
  if (!parsedOptions.length) errors.push("options must contain at least one entry");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: (name as string).trim(),
      slug: normalizeSlug(slug as string),
      options: parsedOptions,
    },
  };
}

export function validateUpdateAttribute(body: unknown): { ok: true; value: UpdateAttributeInput } | { ok: false; errors: string[] } {
  if (!isRecord(body)) return { ok: false, errors: ["Body must be a JSON object"] };
  const errors: string[] = [];
  const out: UpdateAttributeInput = {};
  if ("name" in body) {
    if (typeof body.name !== "string" || !body.name.trim()) errors.push("name must be a non-empty string");
    else out.name = body.name.trim();
  }
  if ("slug" in body) {
    if (typeof body.slug !== "string" || !body.slug.trim()) errors.push("slug must be a non-empty string");
    else out.slug = normalizeSlug(body.slug);
  }
  if ("options" in body) {
    if (!Array.isArray(body.options)) {
      errors.push("options must be an array");
    } else {
      const parsed: AttributeOption[] = [];
      for (let i = 0; i < body.options.length; i++) {
        const r = parseOption(body.options[i], i);
        if (!r.ok) errors.push(r.error);
        else parsed.push(r.value);
      }
      if (!parsed.length) errors.push("options must contain at least one entry when provided");
      else out.options = parsed;
    }
  }
  if (!Object.keys(out).length) errors.push("No valid fields to update");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: out };
}

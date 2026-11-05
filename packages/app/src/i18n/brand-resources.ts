import { brand } from "../brand.generated";

// Transform only bundled copy, before interpolation. User content is never rewritten.
export function brandResources(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, brandResourceValue(item)]),
  );
}

function brandResourceValue(value: unknown): unknown {
  if (typeof value === "string") return value.replaceAll("Paseo", brand.name);
  if (Array.isArray(value)) return value.map(brandResourceValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, brandResourceValue(item)]),
    );
  }
  return value;
}

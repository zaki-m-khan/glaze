import { createHash } from "node:crypto";

/** JSON.stringify with object keys sorted, so equal values always hash the same. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Cache key for one function call: the routine plus its exact inputs. */
export function inputHash(routineId: string, inputs: Record<string, unknown>): string {
  return sha256(`${routineId}\n${stableStringify(inputs)}`).slice(0, 16);
}

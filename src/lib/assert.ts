import type { Check } from "./suite";

export interface CheckResult {
  /** Stable label, e.g. `range(Latest Funding)` or the check's `name`. */
  check: string;
  field: string;
  severity: "error" | "warn";
  pass: boolean;
  message: string;
}

const PLACEHOLDERS = new Set(["", "0", "-", "--", "n/a", "na", "none", "null", "undefined", "unknown", "not found", "no data"]);

const MONEY_SUFFIX: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mm: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  t: 1e12,
  trillion: 1e12,
};

/** Parses "$1.2B", "USD 50M", "50 million", "1,200,000" → number. Returns undefined if it isn't money. */
export function parseMoney(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const match = /^\s*(?:usd|us\$|\$)?\s*(-?\d[\d,]*(?:\.\d+)?)\s*([a-z]+)?\s*(?:usd)?\s*$/i.exec(value);
  if (!match?.[1]) return undefined;
  const amount = Number(match[1].replace(/,/g, ""));
  const suffix = match[2]?.toLowerCase();
  if (suffix === undefined) return amount;
  const multiplier = MONEY_SUFFIX[suffix];
  return multiplier === undefined ? undefined : amount * multiplier;
}

export function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export function splitList(value: unknown, separator = ","): string[] {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0);
}

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function show(value: unknown): string {
  const text = typeof value === "string" ? JSON.stringify(value) : String(JSON.stringify(value));
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

type Verdict = { pass: boolean; message: string };
type CustomFn = (value: unknown, args: Record<string, unknown>) => Verdict;

/** Named checks that don't fit the declarative types. Add here, then reference with `fn:` in a suite. */
export const customChecks: Record<string, CustomFn> = {
  "no-placeholder": (value) =>
    typeof value === "string" && PLACEHOLDERS.has(value.trim().toLowerCase())
      ? { pass: false, message: `placeholder value ${show(value)}` }
      : { pass: true, message: "not a placeholder" },
  "list-length": (value, args) => {
    const items = splitList(value, typeof args.separator === "string" ? args.separator : ",");
    const min = typeof args.min === "number" ? args.min : 0;
    const max = typeof args.max === "number" ? args.max : Infinity;
    const pass = items.length >= min && items.length <= max;
    return { pass, message: `${items.length} items (want ${min}–${max === Infinity ? "∞" : max})` };
  },
  "list-unique": (value) => {
    const items = splitList(value).map((s) => s.toLowerCase());
    const dupes = items.length - new Set(items).size;
    return dupes === 0 ? { pass: true, message: "no duplicates" } : { pass: false, message: `${dupes} duplicate entries` };
  },
};

function evaluate(check: Check, value: unknown, now: Date): Verdict {
  if (check.type === "required") {
    return isEmpty(value) ? { pass: false, message: "missing or empty" } : { pass: true, message: "present" };
  }
  // Every other check is about the shape of a value; a missing value is the `required` check's job.
  if (isEmpty(value)) return { pass: false, message: "no value to check" };

  switch (check.type) {
    case "type": {
      const actual = typeOf(value);
      return { pass: actual === check.is, message: actual === check.is ? check.is : `expected ${check.is}, got ${actual}` };
    }
    case "enum": {
      const text = String(value);
      const pass = check.caseInsensitive
        ? check.values.some((v) => v.toLowerCase() === text.toLowerCase())
        : check.values.includes(text);
      return { pass, message: pass ? text : `${show(value)} not in [${check.values.join(", ")}]` };
    }
    case "regex": {
      const pass = new RegExp(check.pattern, check.flags).test(String(value));
      return { pass, message: pass ? "matches" : `${show(value)} doesn't match /${check.pattern}/` };
    }
    case "range": {
      const n = check.parse === "money" ? parseMoney(value) : parseNumber(value);
      if (n === undefined) return { pass: false, message: `${show(value)} isn't a ${check.parse === "money" ? "money amount" : "number"}` };
      if (check.min !== undefined && (check.exclusiveMin ? n <= check.min : n < check.min)) {
        return { pass: false, message: `${n} ${check.exclusiveMin ? "≤" : "<"} ${check.min}` };
      }
      if (check.max !== undefined && n > check.max) return { pass: false, message: `${n} > ${check.max}` };
      return { pass: true, message: String(n) };
    }
    case "date": {
      const t = typeof value === "number" ? value : Date.parse(String(value));
      if (Number.isNaN(t)) return { pass: false, message: `${show(value)} isn't a date` };
      if (check.notFuture && t > now.getTime()) return { pass: false, message: `${show(value)} is in the future` };
      if (check.notBefore && t < Date.parse(check.notBefore)) return { pass: false, message: `${show(value)} is before ${check.notBefore}` };
      return { pass: true, message: new Date(t).toISOString().slice(0, 10) };
    }
    case "custom": {
      const fn = customChecks[check.fn];
      if (!fn) return { pass: false, message: `unknown custom check "${check.fn}"` };
      return fn(value, check.args);
    }
  }
}

export function checkLabel(check: Check): string {
  if (check.name) return check.name;
  return check.type === "custom" ? `${check.fn}(${check.field})` : `${check.type}(${check.field})`;
}

/** Runs every check against one row's result. */
export function runChecks(checks: Check[], result: Record<string, unknown>, now = new Date()): CheckResult[] {
  return checks.map((check) => {
    const { pass, message } = evaluate(check, result[check.field], now);
    return { check: checkLabel(check), field: check.field, severity: check.severity, pass, message };
  });
}

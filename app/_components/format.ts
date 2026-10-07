import { parseMoney } from "@/lib/assert";

export { num, pct, seconds } from "@/lib/report";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function compactNumber(n: number): string {
  return compact.format(n);
}

/** "175000000" → "$175M". Values that aren't money are shown as-is, quoted, so junk stays visible. */
export function money(value: unknown): string {
  const n = parseMoney(value);
  if (n === undefined) return value === undefined ? "—" : JSON.stringify(value);
  // Under $1K is never a real round; show the raw value so a missing unit stays visible.
  return n < 1000 ? JSON.stringify(value) : `$${compact.format(n)}`;
}

export function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function time(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });
}

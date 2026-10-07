import { describe, expect, it } from "vitest";
import { parseMoney, runChecks, splitList } from "@/lib/assert";
import { checkSchema, type Check } from "@/lib/suite";

const check = (raw: unknown): Check => checkSchema.parse(raw);
const run = (raw: unknown, result: Record<string, unknown>) => runChecks([check(raw)], result, new Date("2026-10-07T00:00:00Z"))[0]!;

describe("parseMoney", () => {
  it.each([
    ["$1.2B", 1.2e9],
    ["USD 50M", 50e6],
    ["50 million", 50e6],
    ["1,200,000", 1_200_000],
    ["$400k", 400_000],
    [75_000_000, 75_000_000],
    ["0", 0],
  ])("parses %s", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });
  it.each(["Series B", "", "$", "12 apples", null, {}])("rejects %s", (input) => {
    expect(parseMoney(input)).toBeUndefined();
  });
});

describe("runChecks", () => {
  it("required fails on missing, null, blank and empty arrays", () => {
    for (const value of [undefined, null, "  ", []]) expect(run({ type: "required", field: "f" }, { f: value }).pass).toBe(false);
    expect(run({ type: "required", field: "f" }, { f: 0 }).pass).toBe(true);
  });
  it("non-required checks fail with a clear message when there is no value", () => {
    const r = run({ type: "type", field: "f", is: "number" }, {});
    expect(r).toMatchObject({ pass: false, message: "no value to check" });
  });
  it("type distinguishes arrays from objects", () => {
    expect(run({ type: "type", field: "f", is: "array" }, { f: [1] }).pass).toBe(true);
    expect(run({ type: "type", field: "f", is: "object" }, { f: [1] }).message).toBe("expected object, got array");
  });
  it("enum supports case-insensitive matching", () => {
    expect(run({ type: "enum", field: "f", values: ["Seed", "Series A"] }, { f: "seed" }).pass).toBe(false);
    expect(run({ type: "enum", field: "f", values: ["Seed", "Series A"], caseInsensitive: true }, { f: "seed" }).pass).toBe(true);
  });
  it("regex", () => {
    expect(run({ type: "regex", field: "f", pattern: "^[0-9]+$" }, { f: "123" }).pass).toBe(true);
    expect(run({ type: "regex", field: "f", pattern: "^[0-9]+$" }, { f: "12a" }).pass).toBe(false);
  });
  it("range parses numbers or money and honors exclusive bounds", () => {
    expect(run({ type: "range", field: "f", min: 0, exclusiveMin: true }, { f: 0 }).pass).toBe(false);
    expect(run({ type: "range", field: "f", min: 0 }, { f: 0 }).pass).toBe(true);
    expect(run({ type: "range", field: "f", parse: "money", max: 1e9 }, { f: "$2B" })).toMatchObject({ pass: false, message: "2000000000 > 1000000000" });
    expect(run({ type: "range", field: "f", parse: "money", min: 1 }, { f: "lots" }).message).toContain("isn't a money amount");
  });
  it("date rejects invalid, future and too-early dates", () => {
    expect(run({ type: "date", field: "f" }, { f: "2026-01-15" }).pass).toBe(true);
    expect(run({ type: "date", field: "f" }, { f: "2027-01-01" }).message).toContain("future");
    expect(run({ type: "date", field: "f", notBefore: "2000-01-01" }, { f: "1999-12-31" }).pass).toBe(false);
    expect(run({ type: "date", field: "f" }, { f: "not a date" }).pass).toBe(false);
  });
  it("custom: no-placeholder catches junk like \"0\" and \"N/A\"", () => {
    expect(run({ type: "custom", fn: "no-placeholder", field: "f" }, { f: "0" }).pass).toBe(false);
    expect(run({ type: "custom", fn: "no-placeholder", field: "f" }, { f: "N/A" }).pass).toBe(false);
    expect(run({ type: "custom", fn: "no-placeholder", field: "f" }, { f: "$10M" }).pass).toBe(true);
  });
  it("custom: list-length and list-unique on comma lists", () => {
    expect(run({ type: "custom", fn: "list-length", field: "f", args: { min: 3 } }, { f: "a, b" }).pass).toBe(false);
    expect(run({ type: "custom", fn: "list-unique", field: "f" }, { f: "a, B, b" }).message).toBe("1 duplicate entries");
  });
  it("unknown custom checks fail loudly instead of passing", () => {
    expect(run({ type: "custom", fn: "nope", field: "f" }, { f: 1 })).toMatchObject({ pass: false, message: 'unknown custom check "nope"' });
  });
  it("labels checks by name or type(field), and carries severity", () => {
    const [a, b] = runChecks([check({ type: "required", field: "x" }), check({ type: "required", field: "y", name: "has y", severity: "warn" })], { x: 1 });
    expect(a!.check).toBe("required(x)");
    expect(b).toMatchObject({ check: "has y", severity: "warn", pass: false });
  });
});

describe("splitList", () => {
  it("splits, trims and drops blanks", () => {
    expect(splitList(" a, b ,, c ")).toEqual(["a", "b", "c"]);
    expect(splitList(["x ", " y"])).toEqual(["x", "y"]);
    expect(splitList(42)).toEqual([]);
  });
});

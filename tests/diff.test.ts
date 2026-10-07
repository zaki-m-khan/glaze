import { describe, expect, it } from "vitest";
import { runChecks } from "@/lib/assert";
import { diffRuns } from "@/lib/diff";
import type { RowRecord } from "@/lib/record";
import { makeRun, makeSuite, row } from "./helpers";

const thresholds = { coverageDrop: 0.05, accuracyDrop: 0.05, costIncrease: 0.1 };

/** Builds a run whose rows are scored by `suite`'s checks, like the runner does. */
function scored(id: string, rows: RowRecord[], suite = makeSuite()) {
  const withChecks = rows.map((r) => (r.result ? { ...r, checks: runChecks(suite.checks, r.result) } : r));
  return makeRun(id, withChecks, suite);
}

const good = () => [row("a", { amount: "$1M" }), row("b", { amount: "$2M" }), row("c", { amount: "$3M" }), row("d", { amount: "$4M" })];

describe("diffRuns", () => {
  it("reports nothing when a run matches its baseline", () => {
    const d = diffRuns(scored("1", good()), scored("2", good()), thresholds);
    expect(d.regressions).toEqual([]);
    expect(d.improvements).toEqual([]);
  });

  it("flags a coverage drop and the row that newly failed", () => {
    const now = good();
    now[3] = row("d", undefined, { error: "Provider request failed" });
    const d = diffRuns(scored("1", good()), scored("2", now), thresholds);
    expect(d.regressions.map((r) => r.kind)).toEqual(["coverage", "new-failure"]);
    expect(d.regressions[0]).toMatchObject({ severity: "high", message: "coverage dropped 100.0% → 75.0%" });
    expect(d.regressions[1]).toMatchObject({ rowId: "d", message: "d: Clay call failed (Provider request failed)" });
  });

  it("flags a check that passed in the baseline and fails now", () => {
    const now = good();
    now[0] = row("a", { amount: "0" });
    const d = diffRuns(scored("1", good()), scored("2", now), thresholds);
    expect(d.regressions.find((r) => r.kind === "new-failure")?.message).toBe("a: positive now fails: 0 ≤ 0 (row cost 2 credits)");
    expect(d.regressions.some((r) => r.kind === "accuracy")).toBe(true);
  });

  it("treats a newly added check that fails as a regression (tightened suites must be justified)", () => {
    const strict = makeSuite();
    strict.checks = [...strict.checks, { type: "range", field: "amount", parse: "money", min: 2_500_000, exclusiveMin: false, severity: "error", name: "at least $2.5M" }];
    const d = diffRuns(scored("1", good()), scored("2", good(), strict), thresholds);
    const failures = d.regressions.filter((r) => r.kind === "new-failure");
    expect(failures.map((f) => f.rowId)).toEqual(["a", "b"]);
    expect(failures[0]!.message).toContain("new check fails");
  });

  it("ignores warn-severity checks and changes inside the threshold", () => {
    const base = good();
    const now = good().map((r) => ({ ...r, credits: 2.1 }));
    const d = diffRuns(scored("1", base), scored("2", now), thresholds);
    expect(d.regressions).toEqual([]);
  });

  it("flags cost per row going up past the threshold, and reports cost going down as an improvement", () => {
    const pricier = good().map((r) => ({ ...r, credits: 3 }));
    expect(diffRuns(scored("1", good()), scored("2", pricier), thresholds).regressions[0]).toMatchObject({
      kind: "cost",
      severity: "high",
      message: "credits / row up 50.0%: 2.00 → 3.00",
    });
    const cheaper = good().map((r) => ({ ...r, credits: 1 }));
    expect(diffRuns(scored("1", good()), scored("2", cheaper), thresholds).improvements[0]!.message).toContain("credits / row down");
  });

  it("sorts regressions by severity", () => {
    const now: RowRecord[] = good().map((r) => ({ ...r, credits: 2.25 }));
    now[0] = row("a", undefined, { credits: 2.25 });
    const d = diffRuns(scored("1", good()), scored("2", now), thresholds);
    const order = d.regressions.map((r) => r.severity);
    expect(order).toEqual([...order].sort((x, y) => ["high", "medium", "low"].indexOf(x) - ["high", "medium", "low"].indexOf(y)));
  });
});

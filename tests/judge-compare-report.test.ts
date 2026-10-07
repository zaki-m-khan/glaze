import { describe, expect, it, vi } from "vitest";
import { compareRuns } from "@/lib/compare";
import { diffRuns } from "@/lib/diff";
import { Judge, buildPrompt, parseVerdict } from "@/lib/judge";
import { COMMENT_MARKER, SAMPLE_LABEL, markdownDiff, table, terminalRun } from "@/lib/report";
import { makeRun, makeSuite, row, tempDir } from "./helpers";

const spec = { field: "one_liner", rubric: "accurately states what the company sells in one sentence", passScore: 4 };

describe("judge", () => {
  it("parses a JSON verdict even with surrounding prose", () => {
    expect(parseVerdict('Sure: {"score": 4, "reason": "names the buyer"} hope that helps')).toEqual({ score: 4, reason: "names the buyer" });
  });
  it("rejects out-of-range or missing verdicts", () => {
    expect(() => parseVerdict('{"score": 9, "reason": "x"}')).toThrow();
    expect(() => parseVerdict("no json here")).toThrow(/no JSON object/);
  });
  it("puts the rubric, row context and value in the prompt", () => {
    const prompt = buildPrompt({ spec, value: "Clay sells data enrichment to GTM teams", context: { company: "Clay" } });
    expect(prompt).toContain(spec.rubric);
    expect(prompt).toContain("company: Clay");
    expect(prompt).toContain('"Clay sells data enrichment to GTM teams"');
  });
  it("caches verdicts so re-scoring costs nothing", async () => {
    const complete = vi.fn(async () => '{"score": 3, "reason": "vague"}');
    const judge = new Judge(complete, tempDir());
    const request = { spec, value: "stuff", context: { company: "X" } };
    expect(await judge.judge(request)).toEqual({ field: "one_liner", score: 3, pass: false, reason: "vague" });
    await judge.judge(request);
    expect(complete).toHaveBeenCalledTimes(1);
  });
});

describe("compareRuns", () => {
  const suite = makeSuite();
  const judged = (id: string, value: string | undefined, score?: number) =>
    row(id, value === undefined ? undefined : { one_liner: value }, { judge: score === undefined ? [] : [{ field: "one_liner", score, pass: score >= 4, reason: `r${score}` }] });
  const withJudge = (run: ReturnType<typeof makeRun>) => ({ ...run, judge: { enabled: true, model: "m" } });

  it("decides each row by judge score; a failed row always loses", () => {
    const a = withJudge(makeRun("A", [judged("x", "good", 5), judged("y", "meh", 3), judged("z", undefined)], suite));
    const b = withJudge(makeRun("B", [judged("x", "ok", 4), judged("y", "meh", 3), judged("z", "fine", 2)], { ...suite, function: { name: "Demo", routineId: "function:t_b" } }));
    const result = compareRuns(a, b, "one_liner", new Date("2026-10-07T00:00:00Z"));
    expect(result.decidedBy).toBe("judge");
    expect(result.rows.map((r) => r.winner)).toEqual(["a", "tie", "b"]);
    expect(result.summary).toMatchObject({ winsA: 1, winsB: 1, ties: 1 });
    expect(result.b.routineId).toBe("function:t_b");
    expect(result.rows[0]!.a).toMatchObject({ value: "good", score: 5, reasons: ["r5"] });
  });

  it("falls back to failed-check counts when the judge didn't run", () => {
    const a = makeRun("A", [{ ...row("x", { amount: "0" }), checks: [{ check: "positive", field: "amount", severity: "error", pass: false, message: "0 ≤ 0" }] }]);
    const b = makeRun("B", [row("x", { amount: "$1M" })]);
    const result = compareRuns(a, b, undefined);
    expect(result.decidedBy).toBe("checks");
    expect(result.rows[0]!.winner).toBe("b");
  });

  it("refuses to compare different suites", () => {
    const other = { ...makeRun("B", []), suite: "other" };
    expect(() => compareRuns(makeRun("A", []), other, undefined)).toThrow(/different suites/);
  });
});

describe("reports", () => {
  it("formats aligned text tables", () => {
    expect(table([["a", "bb"], ["ccc", "d"]])).toBe("a    bb\n---  --\nccc  d");
  });

  it("writes a sticky PR comment with the marker, a summary row and the regressions", () => {
    const base = makeRun("1", [row("a", { amount: "$1M" }), row("b", { amount: "$1M" })]);
    const now = makeRun("2", [row("a", { amount: "$1M" }), row("b", undefined)]);
    const md = markdownDiff([diffRuns(base, now, { coverageDrop: 0.05, accuracyDrop: 0.05, costIncrease: 0.1 })], new Map([["2", now]]));
    expect(md.startsWith(COMMENT_MARKER)).toBe(true);
    expect(md).toContain("❌ Glaze: 2 regressions vs baseline");
    expect(md).toContain("| Demo Function |");
    expect(md).toContain("100.0% → 50.0% ▼");
    expect(md).toContain("**high** · coverage dropped");
  });

  it("labels synthetic data everywhere it's shown", () => {
    const run = { ...makeRun("1", [row("a", { amount: "$1M" })]), sample: true };
    expect(terminalRun(run)).toContain(SAMPLE_LABEL);
    const md = markdownDiff([diffRuns(run, run, { coverageDrop: 0.05, accuracyDrop: 0.05, costIncrease: 0.1 })], new Map([["1", run]]));
    expect(md).toContain(SAMPLE_LABEL);
  });
});

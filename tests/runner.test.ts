import { describe, expect, it, vi } from "vitest";
import { SpendLedger } from "@/lib/budget";
import { CallCache, Recordings } from "@/lib/cache";
import type { ClayClient } from "@/lib/clay";
import { inputHash } from "@/lib/hash";
import { Judge } from "@/lib/judge";
import { rescoreRun, runSuite } from "@/lib/runner";
import { makeRun, makeSuite, row, tempDir } from "./helpers";

/** Fake Clay: each run debits `cost` per item; results come from `answers` (null = failed row). */
function fakeClay(answers: Record<string, Record<string, unknown> | null>, cost = { credits: 2, actions: 1 }) {
  let balance = { credits: 100, actions: 50 };
  const runs: string[][] = [];
  const clay = {
    balance: vi.fn(async () => ({ ...balance })),
    run: vi.fn(async (_routine: string, items: { id: string; inputs: Record<string, unknown> }[]) => {
      runs.push(items.map((i) => i.id));
      balance = { credits: balance.credits - cost.credits * items.length, actions: balance.actions - cost.actions * items.length };
      return {
        routineRunId: `run_${runs.length}`,
        wallTimeMs: 1500,
        completionTimesMs: items.map((_, i) => 1000 + i * 100),
        items: items.map((i) => {
          const answer = answers[String(i.inputs["Company Domain"])];
          return answer
            ? { id: i.id, status: "complete" as const, result: answer }
            : { id: i.id, status: "failed" as const, error: "no data" };
        }),
      };
    }),
  };
  return { clay: clay as unknown as ClayClient, runs };
}

const noSleep = async () => {};

function setup(budget = { credits: 100, actions: 100 }) {
  const dir = tempDir();
  return { cache: new CallCache(`${dir}/cache`), ledger: new SpendLedger(budget, `${dir}/spend.json`), recordings: new Recordings([]) };
}

describe("runSuite (replay)", () => {
  it("never calls Clay without --live and marks unrecorded rows missing", async () => {
    const { cache, recordings } = setup();
    const run = await runSuite(makeSuite(), { cache, recordings, truth: null });
    expect(run.mode).toBe("replay");
    expect(run.rows.map((r) => r.status)).toEqual(["missing", "missing", "missing"]);
    expect(run.metrics.coverage).toBe(0);
  });

  it("replays committed recordings and re-scores them with the suite's current checks", async () => {
    const suite = makeSuite();
    const recordedRow = (id: string, result: Record<string, unknown> | undefined) =>
      row(id, result, {
        domain: `${id}.com`,
        inputs: { "Company Domain": `${id}.com` },
        inputHash: inputHash(suite.function.routineId, { "Company Domain": `${id}.com` }),
      });
    const recorded = makeRun("20261007T000000Z-demo", [recordedRow("a", { amount: "$5M" }), recordedRow("b", { amount: "0" }), recordedRow("c", undefined)]);
    const { cache } = setup();
    const run = await runSuite(suite, { cache, recordings: new Recordings([recorded]), truth: null });
    expect(run.rows.map((r) => [r.source, r.status])).toEqual([
      ["recording", "complete"],
      ["recording", "complete"],
      ["recording", "failed"],
    ]);
    expect(run.rows[1]!.checks.find((c) => c.check === "positive")).toMatchObject({ pass: false, message: "0 ≤ 0" });
    expect(run.metrics).toMatchObject({ coverage: 2 / 3, failed: 1, checksEvaluated: 4, checksPassed: 3, creditsPerRow: 2 });
  });
});

describe("runSuite (live)", () => {
  it("runs uncached rows one per Clay run, meters each from balance deltas, and caches them", async () => {
    const { cache, ledger, recordings } = setup();
    const { clay, runs } = fakeClay({ "a.com": { amount: "$1M" }, "b.com": { amount: "$2M" }, "c.com": null });
    const run = await runSuite(makeSuite(), { cache, recordings, truth: null, live: { clay, ledger, sleep: noSleep } });
    expect(runs).toEqual([["a"], ["b"], ["c"]]);
    expect(run.mode).toBe("live");
    expect(run.rows.map((r) => [r.credits, r.actions, r.latencyMs])).toEqual([
      [2, 1, 1500],
      [2, 1, 1500],
      [2, 1, 1500],
    ]);
    expect(run.spend).toMatchObject({ credits: 6, actions: 3, balanceBefore: { credits: 100 }, balanceAfter: { credits: 94 } });
    expect(ledger.spent).toEqual({ credits: 6, actions: 3 });

    const again = await runSuite(makeSuite(), { cache, recordings, truth: null, live: { clay, ledger, sleep: noSleep } });
    expect(runs).toHaveLength(3);
    expect(again.rows.every((r) => r.source === "cache")).toBe(true);
    expect(again.mode).toBe("replay");
  });

  it("refuses to cross the credit budget and falls back to replay for the rest", async () => {
    const { cache, recordings } = setup();
    const ledger = new SpendLedger({ credits: 5, actions: 100 }, `${tempDir()}/spend.json`);
    const { clay, runs } = fakeClay({ "a.com": { amount: "$1M" }, "b.com": { amount: "$1M" }, "c.com": { amount: "$1M" } });
    const lines: string[] = [];
    const run = await runSuite(makeSuite(), { cache, recordings, truth: null, live: { clay, ledger, sleep: noSleep }, log: (l) => lines.push(l) });
    expect(runs).toEqual([["a"], ["b"]]);
    expect(run.rows.map((r) => r.status)).toEqual(["complete", "complete", "missing"]);
    expect(ledger.spent.credits).toBe(4);
    expect(lines.some((l) => l.startsWith("budget stop"))).toBe(true);
  });

  it("enforces the action budget independently of credits", async () => {
    const { cache, recordings } = setup();
    const ledger = new SpendLedger({ credits: 1000, actions: 0 }, `${tempDir()}/spend.json`);
    const { clay, runs } = fakeClay({ "a.com": { amount: "$1M" } });
    await runSuite(makeSuite(), { cache, recordings, truth: null, live: { clay, ledger, sleep: noSleep } });
    expect(runs).toHaveLength(0);
  });

  it("splits a chunk's cost evenly and keeps latency as an unattributed distribution", async () => {
    const { cache, ledger, recordings } = setup();
    const { clay, runs } = fakeClay({ "a.com": { amount: "$1M" }, "b.com": { amount: "$1M" }, "c.com": { amount: "$1M" } });
    const run = await runSuite(makeSuite(), { cache, recordings, truth: null, chunkSize: 3, live: { clay, ledger, sleep: noSleep } });
    expect(runs).toEqual([["a", "b", "c"]]);
    expect(run.rows.every((r) => r.credits === 2 && r.latencyMs === undefined)).toBe(true);
    expect(run.metrics.latencyP50Ms).toBe(1100);
  });
});

describe("rescoreRun", () => {
  it("re-applies current checks to recorded outputs, keeping id, spend and sources", async () => {
    const stale = makeRun("20261007T000000Z-demo", [row("a", { amount: "0" }, { source: "live" })]);
    stale.spend = { credits: 2, actions: 1 };
    expect(stale.rows[0]!.checks).toEqual([]);
    const fresh = await rescoreRun(stale, makeSuite(), { truth: null, now: () => new Date("2026-10-07T08:00:00Z") });
    expect(fresh).toMatchObject({ id: stale.id, spend: stale.spend, rescoredAt: "2026-10-07T08:00:00.000Z" });
    expect(fresh.rows[0]).toMatchObject({ source: "live", credits: 2 });
    expect(fresh.rows[0]!.checks.map((c) => c.pass)).toEqual([true, false]);
    expect(fresh.metrics.assertionPassRate).toBe(0.5);
  });
});

describe("runSuite (judge)", () => {
  it("judges each completed row's rubric fields", async () => {
    const suite = makeSuite({ judge: [{ field: "amount", rubric: "a plausible funding amount", passScore: 4 }] });
    const { cache, ledger, recordings } = setup();
    const { clay } = fakeClay({ "a.com": { amount: "$1M" }, "b.com": null, "c.com": { amount: "0" } });
    const complete = vi.fn(async (_system: string, prompt: string) =>
      prompt.includes('"0"') ? '{"score": 1, "reason": "placeholder"}' : '{"score": 5, "reason": "fine"}',
    );
    const run = await runSuite(suite, { cache, recordings, truth: null, judge: new Judge(complete, null), live: { clay, ledger, sleep: noSleep } });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(run.rows.map((r) => r.judge.map((j) => j.pass))).toEqual([[true], [], [false]]);
    expect(run.metrics.judge).toEqual({ scored: 2, meanScore: 3, passRate: 0.5 });
  });
});

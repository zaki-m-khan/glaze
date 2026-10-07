import { runChecks } from "./assert";
import type { CachedCall, CallCache, Recordings } from "./cache";
import type { Balance, ClayClient } from "./clay";
import type { SpendLedger } from "./budget";
import { BudgetExceededError } from "./errors";
import { inputHash } from "./hash";
import type { Judge } from "./judge";
import { runId, type RowRecord, type RunRecord } from "./record";
import { computeMetrics } from "./score";
import type { Suite, SuiteRow } from "./suite";
import { loadTruth, scoreTruth, type LoadedTruth, type TruthMetrics } from "./truth/score";

export interface LiveDeps {
  clay: ClayClient;
  ledger: SpendLedger;
  /** Waits between balance reads while the meter settles. */
  sleep?: (ms: number) => Promise<void>;
  settleIntervalMs?: number;
}

export interface RunOptions {
  /** Present only with --live. Without it nothing can spend. */
  live?: LiveDeps;
  limit?: number;
  /** Ignore cached/recorded calls and pay again (live only). */
  fresh?: boolean;
  /** Rows per Clay run. 1 gives exact per-row credits and latency. */
  chunkSize?: number;
  /** Run a different routine on the suite's rows (used by compare). */
  routineId?: string;
  cache: CallCache;
  recordings: Recordings;
  judge?: Judge;
  judgeNote?: string;
  /** Overrides the committed truth snapshot (tests). */
  truth?: LoadedTruth | null;
  log?: (line: string) => void;
  now?: () => Date;
}

interface Resolved {
  row: SuiteRow;
  call?: CachedCall;
  source: RowRecord["source"];
}

/**
 * Reads the balance until two reads a few seconds apart agree. Clay debits shortly after a
 * run completes, so a single immediate read can miss the charge.
 */
export async function settledBalance(clay: ClayClient, sleep: (ms: number) => Promise<void>, intervalMs: number): Promise<Balance> {
  await sleep(intervalMs);
  let previous = await clay.balance();
  for (let i = 0; i < 6; i++) {
    await sleep(intervalMs);
    const current = await clay.balance();
    if (current.credits === previous.credits && current.actions === previous.actions) return current;
    previous = current;
  }
  return previous;
}

async function runLiveChunk(
  suite: Suite,
  routineId: string,
  chunk: SuiteRow[],
  live: LiveDeps,
  cache: CallCache,
  log: (line: string) => void,
): Promise<{ calls: CachedCall[]; before: Balance; after: Balance; samples: number[] }> {
  const sleep = live.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const interval = live.settleIntervalMs ?? 3000;
  const before = await live.clay.balance();
  const run = await live.clay.run(
    routineId,
    chunk.map((row) => ({ id: row.id, inputs: row.inputs })),
  );
  const after = await settledBalance(live.clay, sleep, interval);
  const credits = round(before.credits - after.credits);
  const actions = before.actions !== undefined && after.actions !== undefined ? before.actions - after.actions : 0;
  live.ledger.record({ at: new Date().toISOString(), suite: suite.name, routineId, rows: chunk.length, credits, actions, clayRunId: run.routineRunId });
  log(`  ${chunk.map((r) => r.domain).join(", ")}: ${credits} credits, ${actions} actions, ${(run.wallTimeMs / 1000).toFixed(1)}s`);

  const exact = chunk.length === 1;
  const byId = new Map(run.items.map((item) => [item.id, item]));
  const recordedAt = new Date().toISOString();
  const calls = chunk.map((row): CachedCall => {
    const item = byId.get(row.id);
    const call: CachedCall = {
      routineId,
      inputs: row.inputs,
      inputHash: inputHash(routineId, row.inputs),
      status: item?.status === "complete" ? "complete" : "failed",
      ...(item?.status === "complete" ? { result: item.result } : {}),
      ...(item?.status === "failed" ? { error: item.error } : {}),
      ...(item?.status === "unknown" ? { error: `unrecognized terminal status "${item.rawStatus}"` } : {}),
      ...(item === undefined ? { error: "row missing from Clay results" } : {}),
      ...(exact ? { latencyMs: run.wallTimeMs } : {}),
      credits: round(credits / chunk.length),
      actions: round(actions / chunk.length),
      clayRunId: run.routineRunId,
      recordedAt,
    };
    cache.put(call);
    return call;
  });
  return { calls, before, after, samples: exact ? [] : run.completionTimesMs };
}

export async function runSuite(suite: Suite, options: RunOptions): Promise<RunRecord> {
  const log = options.log ?? (() => {});
  const now = options.now ?? (() => new Date());
  const routineId = options.routineId ?? suite.function.routineId;
  const startedAt = now();
  const rows = suite.rowList.slice(0, options.limit ?? suite.rowList.length);

  const resolved = new Map<string, Resolved>();
  for (const row of rows) {
    const cached = options.fresh ? undefined : options.cache.get(routineId, row.inputs);
    const recorded = cached || options.fresh ? undefined : options.recordings.get(routineId, row.inputs);
    const call = cached ?? recorded;
    resolved.set(row.id, { row, call, source: cached ? "cache" : recorded ? "recording" : "missing" });
  }

  const pending = rows.filter((r) => !resolved.get(r.id)?.call);
  let spend: RunRecord["spend"] = { credits: 0, actions: 0 };
  const latencySamples: number[] = [];
  if (pending.length > 0 && options.live) {
    const chunkSize = Math.max(1, Math.min(100, options.chunkSize ?? 1));
    log(`${suite.name}: ${pending.length} uncached rows to run live (${rows.length - pending.length} replayed)`);
    try {
      for (let i = 0; i < pending.length; i += chunkSize) {
        const chunk = pending.slice(i, i + chunkSize);
        options.live.ledger.assertAffordable(
          { credits: chunk.length * suite.estimate.creditsPerRow, actions: chunk.length * suite.estimate.actionsPerRow },
          `${suite.name} rows ${i + 1}-${i + chunk.length}`,
        );
        const result = await runLiveChunk(suite, routineId, chunk, options.live, options.cache, log);
        result.calls.forEach((call, k) => resolved.set(chunk[k]!.id, { row: chunk[k]!, call, source: "live" }));
        latencySamples.push(...result.samples);
        spend = {
          credits: round(spend.credits + (result.before.credits - result.after.credits)),
          actions: spend.actions + ((result.before.actions ?? 0) - (result.after.actions ?? 0)),
          balanceBefore: spend.balanceBefore ?? result.before,
          balanceAfter: result.after,
        };
      }
    } catch (error) {
      if (!(error instanceof BudgetExceededError)) throw error;
      log(`budget stop: ${error.message}. Remaining rows fall back to replay.`);
    }
  } else if (pending.length > 0) {
    log(`${suite.name}: ${pending.length} rows have no recording; marked missing (use --live to run them)`);
  }

  const unscored: RowRecord[] = rows.map((row) => {
    const { call, source } = resolved.get(row.id)!;
    const base = { id: row.id, label: row.label, domain: row.domain, inputs: row.inputs, inputHash: inputHash(routineId, row.inputs), source, checks: [], judge: [] };
    if (!call) return { ...base, status: "missing" };
    return {
      ...base,
      status: call.status,
      ...(call.result ? { result: call.result } : {}),
      ...(call.error ? { error: call.error } : {}),
      ...(call.latencyMs !== undefined ? { latencyMs: call.latencyMs } : {}),
      ...(call.credits !== undefined ? { credits: call.credits } : {}),
      ...(call.actions !== undefined ? { actions: call.actions } : {}),
      ...(call.clayRunId ? { clayRunId: call.clayRunId } : {}),
      recordedAt: call.recordedAt,
    };
  });

  const scored = await scoreRows(suite, unscored, options);
  const finishedAt = now();
  return {
    version: 1,
    id: runId(suite.name, startedAt),
    suite: suite.name,
    suiteTitle: suite.title,
    suiteFile: suite.file.replace(/\\/g, "/"),
    function: { name: suite.function.name, routineId },
    mode: unscored.some((r) => r.source === "live") ? "live" : "replay",
    sample: false,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    spend,
    judge: scored.judge,
    ...(scored.truthSource ? { truthSource: scored.truthSource } : {}),
    rows: scored.rows,
    metrics: computeMetrics(suite, scored.rows, scored.truthMetrics, latencySamples),
  };
}

type ScoreOptions = Pick<RunOptions, "judge" | "judgeNote" | "truth" | "log" | "now">;

interface Scored {
  rows: RowRecord[];
  truthMetrics?: TruthMetrics;
  truthSource?: RunRecord["truthSource"];
  judge: RunRecord["judge"];
}

/** Applies the suite's checks, ground truth and judge to recorded rows. Never calls Clay. */
export async function scoreRows(suite: Suite, unscored: readonly RowRecord[], options: ScoreOptions): Promise<Scored> {
  const now = options.now ?? (() => new Date());
  const rows: RowRecord[] = unscored.map(({ truth: _stale, ...row }) => ({
    ...row,
    judge: [],
    checks: row.status === "complete" && row.result ? runChecks(suite.checks, row.result, now()) : [],
  }));

  const truth = options.truth === null ? undefined : (options.truth ?? loadTruth(suite.truth));
  const field = suite.truthField;
  let truthMetrics: TruthMetrics | undefined;
  if (truth && field) {
    const scored = scoreTruth(
      truth,
      rows.map((r) => ({ domain: r.domain, status: r.status, value: r.result?.[field] })),
    );
    scored.rows.forEach((t, i) => {
      if (t) rows[i]!.truth = t;
    });
    truthMetrics = scored.metrics;
  } else if (suite.truth !== "none") {
    options.log?.(`${suite.name}: no ${suite.truth} snapshot found; run \`glaze truth refresh\`. Accuracy falls back to assertions.`);
  }

  if (options.judge && suite.judge.length > 0) {
    for (const row of rows) {
      if (row.status !== "complete" || !row.result) continue;
      for (const spec of suite.judge) {
        row.judge.push(await options.judge.judge({ spec, value: row.result[spec.field], context: { company: row.label, domain: row.domain } }));
      }
    }
  }

  return {
    rows,
    ...(truthMetrics ? { truthMetrics } : {}),
    ...(truth ? { truthSource: { kind: truth.kind, source: truth.snapshot.source, generatedAt: truth.snapshot.generatedAt } } : {}),
    judge: options.judge
      ? { enabled: true, model: options.judge.model }
      : { enabled: false, note: suite.judge.length > 0 ? (options.judgeNote ?? "judge disabled") : "suite has no judge rubric" },
  };
}

/**
 * Re-scores a committed run in place: same recorded outputs, spend and id; current checks and
 * ground truth. Used after a truth refresh so the record reflects the best available truth.
 */
export async function rescoreRun(run: RunRecord, suite: Suite, options: ScoreOptions): Promise<RunRecord> {
  const scored = await scoreRows(suite, run.rows, options);
  const { truthSource: _stale, ...rest } = run;
  return {
    ...rest,
    judge: scored.judge,
    ...(scored.truthSource ? { truthSource: scored.truthSource } : {}),
    rows: scored.rows,
    metrics: computeMetrics(suite, scored.rows, scored.truthMetrics),
    rescoredAt: (options.now ?? (() => new Date()))().toISOString(),
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

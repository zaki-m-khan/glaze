import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult } from "./assert";
import type { JudgeResult } from "./judge";
import type { RowTruth, TruthMetrics } from "./truth/score";

export const RUNS_DIR = "data/runs";
/** Replay re-scores land here (gitignored) so they never overwrite the committed live record. */
export const LOCAL_RUNS_DIR = ".glaze/runs";
export const BASELINES_FILE = "data/baselines.json";

export type RowSource = "live" | "cache" | "recording" | "missing";

export interface RowRecord {
  id: string;
  label: string;
  domain: string;
  inputs: Record<string, string>;
  inputHash: string;
  source: RowSource;
  status: "complete" | "failed" | "missing";
  result?: Record<string, unknown>;
  error?: string;
  /** Wall time of the Clay run this row was in, from submit to its completion. */
  latencyMs?: number;
  /** Balance deltas attributed to this row (exact when the row ran alone). */
  credits?: number;
  actions?: number;
  clayRunId?: string;
  recordedAt?: string;
  checks: CheckResult[];
  truth?: RowTruth;
  judge: JudgeResult[];
}

export type Status = "green" | "amber" | "red";

export interface RunMetrics {
  rows: number;
  completed: number;
  failed: number;
  missing: number;
  /** Rows that completed with every required field present, over all rows. */
  coverage: number;
  failureRate: number;
  checksEvaluated: number;
  checksPassed: number;
  assertionPassRate: number | undefined;
  /** Rows whose error-severity checks all passed, over completed rows. */
  rowPassRate: number | undefined;
  latencyP50Ms: number | undefined;
  latencyP95Ms: number | undefined;
  creditsPerRow: number | undefined;
  actionsPerRow: number | undefined;
  truth?: TruthMetrics;
  judge?: { scored: number; meanScore: number | undefined; passRate: number | undefined };
  /** The suite's headline accuracy number (precision, ρ, or assertion pass rate). */
  accuracy: { label: string; value: number | undefined };
  status: Status;
}

export interface RunRecord {
  version: 1;
  id: string;
  suite: string;
  suiteTitle: string;
  suiteFile: string;
  function: { name: string; routineId: string };
  mode: "live" | "replay";
  /** True only for synthetic fixtures. Must be shown wherever the run is displayed. */
  sample: boolean;
  startedAt: string;
  finishedAt: string;
  /** Set when checks/truth were re-applied to the recorded outputs after the run. */
  rescoredAt?: string;
  spend: {
    credits: number;
    actions: number;
    balanceBefore?: { credits: number; actions?: number };
    balanceAfter?: { credits: number; actions?: number };
  };
  judge: { enabled: boolean; model?: string; note?: string };
  truthSource?: { kind: string; source: string; generatedAt: string };
  rows: RowRecord[];
  metrics: RunMetrics;
}

export function runId(suite: string, at: Date): string {
  return `${at.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${suite}`;
}

export function writeRun(record: RunRecord, dir: string): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${record.id}.json`);
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}

export function listRuns(dirs: readonly string[] = [RUNS_DIR]): RunRecord[] {
  const runs: RunRecord[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      runs.push(JSON.parse(readFileSync(join(dir, name), "utf8")) as RunRecord);
    }
  }
  return runs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function findRun(id: string, dirs: readonly string[] = [RUNS_DIR, LOCAL_RUNS_DIR]): RunRecord | undefined {
  return listRuns(dirs).find((r) => r.id === id);
}

export function latestRun(suite: string, dirs: readonly string[] = [RUNS_DIR, LOCAL_RUNS_DIR]): RunRecord | undefined {
  return listRuns(dirs)
    .filter((r) => r.suite === suite)
    .at(-1);
}

export type Baselines = Record<string, string>;

export function readBaselines(file = BASELINES_FILE): Baselines {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Baselines) : {};
}

export function writeBaselines(baselines: Baselines, file = BASELINES_FILE): void {
  const sorted = Object.fromEntries(Object.entries(baselines).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
}

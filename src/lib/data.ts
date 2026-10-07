import { existsSync, readFileSync } from "node:fs";
import type { SpendState } from "./budget";
import { listCompares, type CompareRecord } from "./compare";
import { RUNS_DIR, listRuns, readBaselines, type RunRecord } from "./record";

/** Build-time data access for the dashboard. Reads only committed files, so the site needs no secrets. */

export const REPO_URL = "https://github.com/zaki-m-khan/glaze";

export const SUITE_ORDER = ["tech-stack", "traffic", "funding"];

export function allRuns(): RunRecord[] {
  return listRuns([RUNS_DIR]);
}

/** The run each suite is judged by: its baseline, else its latest live run. */
export function headlineRuns(): RunRecord[] {
  const runs = allRuns();
  const baselines = readBaselines();
  const suites = [...new Set(runs.map((r) => r.suite))].sort((a, b) => order(a) - order(b));
  return suites.map((suite) => runs.find((r) => r.id === baselines[suite]) ?? runs.filter((r) => r.suite === suite).at(-1)!);
}

function order(suite: string): number {
  const i = SUITE_ORDER.indexOf(suite);
  return i === -1 ? SUITE_ORDER.length : i;
}

export function getRun(id: string): RunRecord | undefined {
  return allRuns().find((r) => r.id === id);
}

export function isBaseline(run: RunRecord): boolean {
  return readBaselines()[run.suite] === run.id;
}

export function compares(): CompareRecord[] {
  return listCompares();
}

export function spend(): SpendState | undefined {
  return existsSync("data/spend.json") ? (JSON.parse(readFileSync("data/spend.json", "utf8")) as SpendState) : undefined;
}

export function demoPrUrl(): string | undefined {
  return existsSync("data/demo-pr.json") ? (JSON.parse(readFileSync("data/demo-pr.json", "utf8")) as { url: string }).url : undefined;
}

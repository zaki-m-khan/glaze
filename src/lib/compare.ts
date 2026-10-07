import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mean } from "./metrics";
import type { RowRecord, RunRecord } from "./record";

export const COMPARE_DIR = "data/compare";

export interface CompareSide {
  status: RowRecord["status"];
  value: unknown;
  /** Mean judge score across rubric fields; undefined when the judge didn't run. */
  score?: number;
  reasons: string[];
  checksFailed: number;
}

export interface CompareRow {
  id: string;
  label: string;
  domain: string;
  a: CompareSide;
  b: CompareSide;
  winner: "a" | "b" | "tie";
}

interface SideSummary {
  meanScore: number | undefined;
  passRate: number | undefined;
  coverage: number;
  creditsPerRow: number | undefined;
}

export interface CompareRecord {
  version: 1;
  id: string;
  suite: string;
  suiteTitle: string;
  sample: boolean;
  createdAt: string;
  /** How the winner of a row was decided. */
  decidedBy: "judge" | "checks";
  a: { routineId: string; runId: string };
  b: { routineId: string; runId: string };
  rows: CompareRow[];
  summary: { a: SideSummary; b: SideSummary; winsA: number; winsB: number; ties: number };
}

function side(row: RowRecord | undefined, field: string | undefined): CompareSide {
  if (!row) return { status: "missing", value: undefined, reasons: [], checksFailed: 0 };
  const score = mean(row.judge.map((j) => j.score));
  return {
    status: row.status,
    value: field ? row.result?.[field] : row.result,
    ...(score !== undefined ? { score } : {}),
    reasons: row.judge.map((j) => j.reason),
    checksFailed: row.checks.filter((c) => !c.pass && c.severity === "error").length,
  };
}

/** Higher is better. A row that didn't complete always loses to one that did. */
function merit(s: CompareSide, byJudge: boolean): number {
  if (s.status !== "complete") return -Infinity;
  return byJudge ? (s.score ?? 0) : -s.checksFailed;
}

function summarize(run: RunRecord): SideSummary {
  return {
    meanScore: run.metrics.judge?.meanScore,
    passRate: run.metrics.judge?.passRate,
    coverage: run.metrics.coverage,
    creditsPerRow: run.metrics.creditsPerRow,
  };
}

/** Head-to-head of two runs of the same suite on the same rows. Pure, so it's tested with fixtures. */
export function compareRuns(a: RunRecord, b: RunRecord, field: string | undefined, createdAt = new Date()): CompareRecord {
  if (a.suite !== b.suite) throw new Error(`can't compare runs of different suites (${a.suite} vs ${b.suite})`);
  const byJudge = a.judge.enabled && b.judge.enabled;
  const bRows = new Map(b.rows.map((r) => [r.id, r]));
  const rows = a.rows.map((rowA): CompareRow => {
    const sa = side(rowA, field);
    const sb = side(bRows.get(rowA.id), field);
    const ma = merit(sa, byJudge);
    const mb = merit(sb, byJudge);
    return { id: rowA.id, label: rowA.label, domain: rowA.domain, a: sa, b: sb, winner: ma > mb ? "a" : mb > ma ? "b" : "tie" };
  });
  const winsA = rows.filter((r) => r.winner === "a").length;
  const winsB = rows.filter((r) => r.winner === "b").length;
  return {
    version: 1,
    id: `${createdAt.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${a.suite}`,
    suite: a.suite,
    suiteTitle: a.suiteTitle,
    sample: a.sample || b.sample,
    createdAt: createdAt.toISOString(),
    decidedBy: byJudge ? "judge" : "checks",
    a: { routineId: a.function.routineId, runId: a.id },
    b: { routineId: b.function.routineId, runId: b.id },
    rows,
    summary: { a: summarize(a), b: summarize(b), winsA, winsB, ties: rows.length - winsA - winsB },
  };
}

export function writeCompare(record: CompareRecord, dir = COMPARE_DIR): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${record.id}.json`);
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}

export function listCompares(dir = COMPARE_DIR): CompareRecord[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort()
    .map((n) => JSON.parse(readFileSync(join(dir, n), "utf8")) as CompareRecord);
}


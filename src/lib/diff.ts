import type { RunMetrics, RunRecord } from "./record";
import type { SuiteSpec } from "./suite";

export type Severity = "high" | "medium" | "low";

export interface Finding {
  kind: "coverage" | "accuracy" | "assertions" | "cost" | "new-failure";
  severity: Severity;
  message: string;
  rowId?: string;
}

export interface MetricDelta {
  metric: string;
  baseline: number | undefined;
  current: number | undefined;
  /** Positive = better. */
  better: boolean | undefined;
}

export interface SuiteDiff {
  suite: string;
  title: string;
  baselineId: string;
  currentId: string;
  regressions: Finding[];
  improvements: Finding[];
  deltas: MetricDelta[];
}

type Thresholds = SuiteSpec["regressions"];

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmt = (x: number | undefined, asPct: boolean) => (x === undefined ? "n/a" : asPct ? pct(x) : x.toFixed(3));

/** Severity scales with how far past the threshold the change went. */
function severityFor(change: number, threshold: number): Severity {
  return change >= threshold * 3 ? "high" : change >= threshold * 1.5 ? "medium" : "low";
}

function compareHigherIsBetter(
  name: string,
  kind: Finding["kind"],
  base: number | undefined,
  cur: number | undefined,
  threshold: number,
  asPct: boolean,
  out: { regressions: Finding[]; improvements: Finding[] },
): void {
  if (base === undefined && cur === undefined) return;
  if (base !== undefined && cur === undefined) {
    out.regressions.push({ kind, severity: "high", message: `${name} is no longer measurable (was ${fmt(base, asPct)})` });
    return;
  }
  if (base === undefined || cur === undefined) return;
  const drop = base - cur;
  if (drop > threshold) out.regressions.push({ kind, severity: severityFor(drop, threshold), message: `${name} dropped ${fmt(base, asPct)} → ${fmt(cur, asPct)}` });
  else if (-drop > threshold) out.improvements.push({ kind, severity: "low", message: `${name} rose ${fmt(base, asPct)} → ${fmt(cur, asPct)}` });
}

function compareCost(name: string, base: number | undefined, cur: number | undefined, threshold: number, out: { regressions: Finding[]; improvements: Finding[] }): void {
  if (base === undefined || cur === undefined) return;
  if (base === 0) {
    if (cur > 0) out.regressions.push({ kind: "cost", severity: "medium", message: `${name} went from 0 to ${cur.toFixed(2)}` });
    return;
  }
  const change = (cur - base) / base;
  if (change > threshold) out.regressions.push({ kind: "cost", severity: severityFor(change, threshold), message: `${name} up ${pct(change)}: ${base.toFixed(2)} → ${cur.toFixed(2)}` });
  else if (-change > threshold) out.improvements.push({ kind: "cost", severity: "low", message: `${name} down ${pct(-change)}: ${base.toFixed(2)} → ${cur.toFixed(2)}` });
}

/** Row-level: anything that worked in the baseline and doesn't now. */
function newFailures(baseline: RunRecord, current: RunRecord): Finding[] {
  const before = new Map(baseline.rows.map((r) => [r.id, r]));
  const findings: Finding[] = [];
  for (const row of current.rows) {
    const old = before.get(row.id);
    if (!old) continue;
    if (old.status === "complete" && row.status !== "complete") {
      findings.push({ kind: "new-failure", severity: "high", rowId: row.id, message: `${row.label}: Clay call ${row.status}${row.error ? ` (${row.error})` : ""}` });
      continue;
    }
    if (row.status !== "complete") continue;
    const passedBefore = new Set(old.checks.filter((c) => c.pass).map((c) => c.check));
    const knownBefore = new Set(old.checks.map((c) => c.check));
    for (const check of row.checks) {
      if (check.pass || check.severity === "warn") continue;
      if (passedBefore.has(check.check) || !knownBefore.has(check.check)) {
        const why = knownBefore.has(check.check) ? "now fails" : "new check fails";
        findings.push({ kind: "new-failure", severity: "medium", rowId: row.id, message: `${row.label}: ${check.check} ${why}: ${check.message}` });
      }
    }
  }
  return findings;
}

function delta(metric: string, base: number | undefined, cur: number | undefined, higherIsBetter: boolean): MetricDelta {
  const better = base === undefined || cur === undefined || base === cur ? undefined : higherIsBetter ? cur > base : cur < base;
  return { metric, baseline: base, current: cur, better };
}

export function metricDeltas(b: RunMetrics, c: RunMetrics): MetricDelta[] {
  return [
    delta("coverage", b.coverage, c.coverage, true),
    delta(b.accuracy.label, b.accuracy.value, c.accuracy.value, true),
    delta("assertion pass rate", b.assertionPassRate, c.assertionPassRate, true),
    delta("credits / row", b.creditsPerRow, c.creditsPerRow, false),
    delta("actions / row", b.actionsPerRow, c.actionsPerRow, false),
    delta("p50 latency (ms)", b.latencyP50Ms, c.latencyP50Ms, false),
  ];
}

export function diffRuns(baseline: RunRecord, current: RunRecord, thresholds: Thresholds): SuiteDiff {
  const out = { regressions: [] as Finding[], improvements: [] as Finding[] };
  const b = baseline.metrics;
  const c = current.metrics;
  compareHigherIsBetter("coverage", "coverage", b.coverage, c.coverage, thresholds.coverageDrop, true, out);
  if (b.accuracy.label === c.accuracy.label) {
    compareHigherIsBetter(c.accuracy.label, "accuracy", b.accuracy.value, c.accuracy.value, thresholds.accuracyDrop, c.accuracy.label !== "Spearman ρ", out);
  }
  if (c.accuracy.label !== "assertion pass rate") {
    compareHigherIsBetter("assertion pass rate", "assertions", b.assertionPassRate, c.assertionPassRate, thresholds.accuracyDrop, true, out);
  }
  compareCost("credits / row", b.creditsPerRow, c.creditsPerRow, thresholds.costIncrease, out);
  compareCost("actions / row", b.actionsPerRow, c.actionsPerRow, thresholds.costIncrease, out);
  out.regressions.push(...newFailures(baseline, current));

  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  out.regressions.sort((x, y) => rank[x.severity] - rank[y.severity]);
  return {
    suite: current.suite,
    title: current.suiteTitle,
    baselineId: baseline.id,
    currentId: current.id,
    regressions: out.regressions,
    improvements: out.improvements,
    deltas: metricDeltas(b, c),
  };
}

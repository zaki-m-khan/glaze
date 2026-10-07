import { isEmpty } from "./assert";
import { mean, percentile, ratio } from "./metrics";
import type { RowRecord, RunMetrics, Status } from "./record";
import type { Suite } from "./suite";
import type { TruthMetrics } from "./truth/score";

/** A row counts as covered when Clay completed it and every `required` field has a value. */
export function isCovered(row: RowRecord, suite: Pick<Suite, "checks">): boolean {
  if (row.status !== "complete" || !row.result) return false;
  const required = suite.checks.filter((c) => c.type === "required").map((c) => c.field);
  return required.every((field) => !isEmpty(row.result?.[field]));
}

export function accuracyOf(truth: TruthMetrics | undefined, assertionPassRate: number | undefined): RunMetrics["accuracy"] {
  if (truth?.kind === "html-signatures") return { label: "precision", value: truth.overall.precision };
  if (truth?.kind === "tranco") return { label: "Spearman ρ", value: truth.spearman };
  return { label: "assertion pass rate", value: assertionPassRate };
}

/** Green: meets both targets. Red: more than 0.2 below either. Amber: in between, or unknown. */
export function statusOf(coverage: number, accuracy: number | undefined, targets: Suite["targets"]): Status {
  if (coverage < targets.coverage - 0.2 || (accuracy !== undefined && accuracy < targets.accuracy - 0.2)) return "red";
  if (accuracy !== undefined && coverage >= targets.coverage && accuracy >= targets.accuracy) return "green";
  return "amber";
}

export function computeMetrics(
  suite: Pick<Suite, "checks" | "targets">,
  rows: readonly RowRecord[],
  truth: TruthMetrics | undefined,
  extraLatencySamplesMs: readonly number[] = [],
): RunMetrics {
  const completed = rows.filter((r) => r.status === "complete");
  const failed = rows.filter((r) => r.status === "failed").length;
  const missing = rows.filter((r) => r.status === "missing").length;
  const checks = completed.flatMap((r) => r.checks);
  const checksPassed = checks.filter((c) => c.pass).length;
  const assertionPassRate = ratio(checksPassed, checks.length);
  const rowsPassing = completed.filter((r) => r.checks.every((c) => c.pass || c.severity === "warn")).length;
  const coverage = rows.length === 0 ? 0 : rows.filter((r) => isCovered(r, suite)).length / rows.length;

  const latencies = [...rows.flatMap((r) => (r.latencyMs === undefined ? [] : [r.latencyMs])), ...extraLatencySamplesMs];
  const metered = rows.filter((r) => r.credits !== undefined);
  const judged = rows.flatMap((r) => r.judge);
  const accuracy = accuracyOf(truth, assertionPassRate);

  return {
    rows: rows.length,
    completed: completed.length,
    failed,
    missing,
    coverage,
    failureRate: rows.length === 0 ? 0 : failed / rows.length,
    checksEvaluated: checks.length,
    checksPassed,
    assertionPassRate,
    rowPassRate: ratio(rowsPassing, completed.length),
    latencyP50Ms: percentile(latencies, 50),
    latencyP95Ms: percentile(latencies, 95),
    creditsPerRow: mean(metered.map((r) => r.credits ?? 0)),
    actionsPerRow: mean(metered.filter((r) => r.actions !== undefined).map((r) => r.actions ?? 0)),
    ...(truth ? { truth } : {}),
    ...(judged.length > 0
      ? { judge: { scored: judged.length, meanScore: mean(judged.map((j) => j.score)), passRate: ratio(judged.filter((j) => j.pass).length, judged.length) } }
      : {}),
    accuracy,
    status: statusOf(coverage, accuracy.value, suite.targets),
  };
}

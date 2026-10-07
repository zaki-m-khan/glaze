import type { CompareRecord } from "./compare";
import type { MetricDelta, SuiteDiff } from "./diff";
import type { RunRecord } from "./record";

export const COMMENT_MARKER = "<!-- glaze-report -->";
export const SAMPLE_LABEL = "SAMPLE: synthetic, not Clay output";

export function pct(x: number | undefined, digits = 0): string {
  return x === undefined ? "n/a" : `${(x * 100).toFixed(digits)}%`;
}

export function num(x: number | undefined, digits = 2): string {
  return x === undefined ? "n/a" : x.toFixed(digits);
}

export function seconds(ms: number | undefined): string {
  return ms === undefined ? "n/a" : `${(ms / 1000).toFixed(1)}s`;
}

export function accuracyText(run: RunRecord): string {
  const { accuracy, truth } = run.metrics;
  if (truth?.kind === "html-signatures") return `P ${pct(truth.overall.precision)} / R ${pct(truth.overall.recall)}`;
  if (truth?.kind === "tranco") return `ρ ${num(truth.spearman)} (n=${truth.pairs})`;
  return `${pct(accuracy.value)} ${accuracy.label}`;
}

/** Left-aligned plain-text table. First row is the header. */
export function table(rows: string[][]): string {
  const widths = rows[0]!.map((_, col) => Math.max(...rows.map((r) => (r[col] ?? "").length)));
  const line = (r: string[]) => r.map((cell, i) => cell.padEnd(widths[i]!)).join("  ").trimEnd();
  return [line(rows[0]!), widths.map((w) => "-".repeat(w)).join("  "), ...rows.slice(1).map(line)].join("\n");
}

export function terminalRun(run: RunRecord): string {
  const m = run.metrics;
  const header = `${run.suiteTitle} (${run.suite})  ${run.mode.toUpperCase()}  ${run.id}${run.sample ? `  [${SAMPLE_LABEL}]` : ""}`;
  const summary = table([
    ["status", "coverage", "accuracy", "assertions", "credits/row", "actions/row", "p50", "p95"],
    [m.status, pct(m.coverage), accuracyText(run), `${m.checksPassed}/${m.checksEvaluated}`, num(m.creditsPerRow), num(m.actionsPerRow), seconds(m.latencyP50Ms), seconds(m.latencyP95Ms)],
  ]);
  const rows = table([
    ["row", "status", "source", "failed checks", "truth"],
    ...run.rows.map((r) => [
      r.domain,
      r.status,
      r.source,
      r.checks.filter((c) => !c.pass).map((c) => c.check).join(", ") || "-",
      truthCell(r.truth),
    ]),
  ]);
  const notes = [
    run.spend.credits || run.spend.actions ? `spent this run: ${run.spend.credits} credits, ${run.spend.actions} actions` : "spent this run: 0 (replayed)",
    run.judge.enabled ? `judge: ${run.judge.model}` : `judge: off (${run.judge.note})`,
  ];
  return [header, "", summary, "", rows, "", ...notes].join("\n");
}

function truthCell(truth: RunRecord["rows"][number]["truth"]): string {
  if (!truth) return "-";
  if (truth.kind === "tranco") return truth.trancoRank === null ? "unranked" : `tranco #${truth.trancoRank}`;
  if (truth.verdict === "unverifiable") return `unverifiable (${truth.reason})`;
  return `tp ${truth.truePositives.length} fp ${truth.falsePositives.length} fn ${truth.falseNegatives.length}`;
}

function deltaCell(d: MetricDelta): string {
  const isPct = !/ρ|row|ms/.test(d.metric);
  const f = (x: number | undefined) => (isPct ? pct(x, 1) : d.metric.includes("ms") ? (x === undefined ? "n/a" : String(Math.round(x))) : num(x));
  const arrow = d.better === undefined ? "" : d.better ? " ▲" : " ▼";
  return `${f(d.baseline)} → ${f(d.current)}${arrow}`;
}

export function terminalDiff(diffs: SuiteDiff[]): string {
  return diffs
    .map((d) => {
      const head = `${d.title}: ${d.regressions.length === 0 ? "no regressions" : `${d.regressions.length} regression(s)`}  (baseline ${d.baselineId} → ${d.currentId})`;
      const lines = d.regressions.map((r) => `  [${r.severity}] ${r.message}`);
      return [head, ...lines].join("\n");
    })
    .join("\n\n");
}

/** Sticky PR comment. Starts with a marker so the workflow can find and update it. */
export function markdownDiff(diffs: SuiteDiff[], runs: Map<string, RunRecord>): string {
  const total = diffs.reduce((n, d) => n + d.regressions.length, 0);
  const anySample = [...runs.values()].some((r) => r.sample);
  const lines = [
    COMMENT_MARKER,
    `## ${total === 0 ? "✅" : "❌"} Glaze: ${total === 0 ? "no regressions" : `${total} regression${total === 1 ? "" : "s"} vs baseline`}`,
    "",
    anySample ? `> **${SAMPLE_LABEL}**\n` : "",
    "Replayed recorded Clay outputs against this branch's suites and ground truth (no Clay credits spent).",
    "",
    "| Function | Status | Coverage | Accuracy | Credits/row | Regressions |",
    "|---|---|---|---|---|---|",
  ];
  for (const d of diffs) {
    const run = runs.get(d.currentId);
    if (!run) continue;
    const cov = d.deltas.find((x) => x.metric === "coverage")!;
    const acc = d.deltas[1]!;
    const cost = d.deltas.find((x) => x.metric === "credits / row")!;
    const chip = { green: "🟢", amber: "🟡", red: "🔴" }[run.metrics.status];
    lines.push(`| ${d.title} | ${chip} ${run.metrics.status} | ${deltaCell(cov)} | ${acc.metric}: ${deltaCell(acc)} | ${deltaCell(cost)} | ${d.regressions.length} |`);
  }
  for (const d of diffs.filter((x) => x.regressions.length > 0)) {
    lines.push("", `### ${d.title}`, "");
    for (const r of d.regressions.slice(0, 15)) lines.push(`- **${r.severity}** · ${r.message}`);
    if (d.regressions.length > 15) lines.push(`- …and ${d.regressions.length - 15} more`);
  }
  const improved = diffs.flatMap((d) => d.improvements.map((i) => `- ${d.title}: ${i.message}`));
  if (improved.length > 0) lines.push("", "<details><summary>Improvements</summary>", "", ...improved, "", "</details>");
  lines.push("", `<sub>Baselines: ${diffs.map((d) => `\`${d.baselineId}\``).join(", ")}</sub>`);
  return lines.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n");
}

export function terminalCompare(record: CompareRecord): string {
  const s = record.summary;
  return [
    `${record.suiteTitle}: A ${record.a.routineId} vs B ${record.b.routineId}${record.sample ? `  [${SAMPLE_LABEL}]` : ""}`,
    "",
    table([
      ["", "A", "B"],
      ["judge mean (1-5)", num(s.a.meanScore), num(s.b.meanScore)],
      ["judge pass rate", pct(s.a.passRate), pct(s.b.passRate)],
      ["coverage", pct(s.a.coverage), pct(s.b.coverage)],
      ["credits/row", num(s.a.creditsPerRow), num(s.b.creditsPerRow)],
      ["head-to-head wins", String(s.winsA), String(s.winsB)],
    ]),
    "",
    `ties: ${s.ties}`,
  ].join("\n");
}

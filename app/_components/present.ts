import type { RunRecord } from "@/lib/record";
import { money, num, pct, seconds } from "./format";

/** Plain-language presentation of a run. Every sentence is computed from the run's data. */

const LOOK: Record<string, { name: string; icon: string }> = {
  "tech-stack": { name: "Tech stack", icon: "/brand/star-blue.png" },
  traffic: { name: "Website traffic", icon: "/brand/dot-yellow.png" },
  funding: { name: "Latest funding", icon: "/brand/star-pink.png" },
};

export function look(run: RunRecord): { name: string; icon: string } {
  return LOOK[run.suite] ?? { name: run.suiteTitle, icon: "/brand/dot-blue.png" };
}

export interface Big {
  value: string;
  label: string;
}

/** The one or two numbers that matter, with labels a non-engineer can read. */
export function bigNumbers(run: RunRecord): Big[] {
  const t = run.metrics.truth;
  if (t?.kind === "html-signatures") {
    return [
      { value: pct(t.overall.recall), label: "of real tools found" },
      { value: pct(t.overall.precision), label: "of its list confirmed" },
    ];
  }
  if (t?.kind === "tranco") return [{ value: num(t.spearman), label: "match with public rankings (1.00 = perfect)" }];
  return [{ value: pct(run.metrics.assertionPassRate), label: "of answers pass basic checks" }];
}

function failingRows(run: RunRecord) {
  return run.rows.filter((r) => r.status === "complete" && r.checks.some((c) => !c.pass && c.severity === "error"));
}

function list(items: string[]): string {
  return items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** The single most interesting thing in the run, for the card. */
export function theCatch(run: RunRecord): string {
  const t = run.metrics.truth;
  if (t?.kind === "html-signatures") {
    const top = [...t.perTech].sort((a, b) => b.fp - a.fp)[0];
    if (!top || top.fp === 0) return "Everything it listed showed up on the sites.";
    const claims = top.tp + top.fp;
    return `Says ${claims} of ${t.scoredDomains} sites use ${top.tech}. We saw it on ${top.tp === 0 ? "none" : top.tp}.`;
  }
  if (t?.kind === "tranco") {
    const o = t.outliers[0];
    return o ? `Biggest miss: ${o.domain}, #${o.clayPosition} here vs #${o.trancoPosition} publicly.` : "Same order as the public list.";
  }
  const bad = failingRows(run);
  if (bad.length === 0) return "Every answer passed.";
  const field = bad[0]!.checks[0]?.field ?? "";
  const values = new Set(bad.map((r) => JSON.stringify(r.result?.[field])));
  if (values.size === 1) return `${list(bad.map((r) => r.domain))} came back as ${money(bad[0]!.result?.[field])}.`;
  return `${bad.length} companies failed a check, like ${bad[0]!.domain} (${money(bad[0]!.result?.[field])}).`;
}

/** One sentence that answers "is this function any good?" */
export function verdict(run: RunRecord): string {
  const t = run.metrics.truth;
  if (t?.kind === "html-signatures") {
    const r = t.overall.recall ?? 0;
    const p = t.overall.precision ?? 0;
    if (r >= 0.9 && p < 0.6) return "Finds almost every tool a site uses, but also lists many we couldn't find on the site.";
    if (r >= 0.9) return "Finds almost every tool a site uses, and most of its list checks out.";
    return `Found ${pct(r)} of the tools we saw on these sites.`;
  }
  if (t?.kind === "tranco") {
    const rho = t.spearman ?? 0;
    if (rho >= 0.8) return "Ranks companies almost the same way public traffic data does.";
    if (rho >= 0.5) return "Roughly agrees with public traffic data.";
    return "Often disagrees with public traffic data.";
  }
  const bad = failingRows(run).length;
  return bad === 0 ? "Every answer passed the basic checks." : `Most answers look fine, but ${bad} of ${run.metrics.rows} failed a basic check.`;
}

export function detailStats(run: RunRecord): Big[] {
  const m = run.metrics;
  const t = m.truth;
  const cost = { value: num(m.creditsPerRow, m.creditsPerRow !== undefined && Number.isInteger(m.creditsPerRow) ? 0 : 1), label: "Credits per company" };
  const time = { value: seconds(m.latencyP50Ms), label: "Time per company" };
  if (t?.kind === "html-signatures") {
    return [{ value: pct(t.overall.recall), label: "Tools found" }, { value: pct(t.overall.precision), label: "List confirmed" }, cost, time];
  }
  if (t?.kind === "tranco") return [{ value: num(t.spearman), label: "Ranking match" }, { value: pct(m.coverage), label: "Answered" }, cost, time];
  return [{ value: pct(m.assertionPassRate), label: "Checks passed" }, { value: pct(m.coverage), label: "Answered" }, cost, time];
}

export function costLine(run: RunRecord): string {
  const c = run.metrics.creditsPerRow;
  if (c === undefined) return "";
  return `${Number.isInteger(c) ? c : c.toFixed(1)} credit${c === 1 ? "" : "s"} per company`;
}


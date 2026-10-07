import { percentile } from "./metrics";
import type { RunRecord } from "./record";

/**
 * Plain-English findings computed from a run. The dashboard shows these instead of
 * hand-written copy, so every sentence stays true to the data it sits next to.
 */
export function findings(run: RunRecord): string[] {
  const out: string[] = [];
  const m = run.metrics;
  const truth = m.truth;

  if (m.failed > 0) out.push(`${m.failed} of ${m.rows} rows failed in Clay.`);

  if (truth?.kind === "html-signatures") {
    const misses = run.rows.flatMap((r) =>
      r.truth?.kind === "html-signatures" && r.truth.verdict === "verified" && r.truth.falseNegatives.length > 0
        ? [`${r.truth.falseNegatives.join(", ")} on ${r.domain}`]
        : [],
    );
    const scored = truth.scoredDomains;
    out.push(
      misses.length === 0
        ? `Clay listed every technology Glaze detected on all ${scored} verifiable sites.`
        : `Clay listed every technology Glaze detected on ${scored - misses.length} of ${scored} verifiable sites (missed ${misses.join("; ")}).`,
    );
    const unconfirmed = [...truth.perTech].filter((t) => t.fp > 0).sort((a, b) => b.fp - a.fp).slice(0, 3);
    if (unconfirmed.length > 0) {
      out.push(`Most-reported but not seen on the homepage: ${unconfirmed.map((t) => `${t.tech} (${t.fp} sites)`).join(", ")}. Likely from other pages, subdomains or history.`);
    }
    if (truth.unverifiable.length > 0) out.push(`Not scored (couldn't verify): ${truth.unverifiable.map((u) => u.domain).join(", ")}.`);
  }

  if (truth?.kind === "tranco") {
    const top = truth.outliers[0];
    if (top) {
      out.push(`Biggest disagreement: ${top.domain} is #${top.clayPosition} by Clay traffic but #${top.trancoPosition} by Tranco among these ${truth.pairs}.`);
    }
    for (const domain of truth.unranked) {
      const value = run.rows.find((r) => r.domain === domain)?.result?.siteTraffic;
      out.push(`${domain} is outside Tranco's top 1M${typeof value === "number" ? `; Clay reports ${value.toLocaleString("en-US")} visits` : ""}.`);
    }
  }

  const failing = new Map<string, string[]>();
  for (const row of run.rows) {
    for (const check of row.checks) {
      if (check.pass || check.severity === "warn") continue;
      failing.set(check.check, [...(failing.get(check.check) ?? []), row.domain]);
    }
  }
  for (const [check, domains] of failing) out.push(`"${check}" failed on ${domains.length} row${domains.length === 1 ? "" : "s"}: ${domains.join(", ")}.`);

  const costs = run.rows.flatMap((r) => (r.credits === undefined ? [] : [r.credits]));
  if (costs.length > 1 && Math.max(...costs) !== Math.min(...costs)) {
    const mean = costs.reduce((s, c) => s + c, 0) / costs.length;
    out.push(`Credits per row ranged ${Math.min(...costs)}–${Math.max(...costs)}: median ${percentile(costs, 50)}, mean ${mean.toFixed(2)}.`);
  }
  return out;
}

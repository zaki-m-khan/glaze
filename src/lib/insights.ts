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

  if (m.failed > 0) out.push(`Clay returned an error for ${m.failed} of ${m.rows} companies.`);

  if (truth?.kind === "html-signatures") {
    const misses = run.rows.flatMap((r) =>
      r.truth?.kind === "html-signatures" && r.truth.verdict === "verified" && r.truth.falseNegatives.length > 0
        ? [`${r.truth.falseNegatives.join(", ")} on ${r.domain}`]
        : [],
    );
    const scored = truth.scoredDomains;
    out.push(
      misses.length === 0
        ? `It found every tool we saw, on all ${scored} sites.`
        : `It found every tool we saw on ${scored - misses.length} of ${scored} sites. Missed: ${misses.join("; ")}.`,
    );
    const unconfirmed = [...truth.perTech].filter((t) => t.fp > 0).sort((a, b) => b.fp - a.fp).slice(0, 3);
    if (unconfirmed.length > 0) {
      out.push(`Listed often, but not on the live site: ${unconfirmed.map((t) => `${t.tech} (${t.fp} sites)`).join(", ")}. Probably from other pages or the past.`);
    }
    if (truth.unverifiable.length > 0) out.push(`Skipped ${truth.unverifiable.map((u) => u.domain).join(", ")}: the site blocked our browser.`);
  }

  if (truth?.kind === "tranco") {
    const top = truth.outliers[0];
    if (top) out.push(`Biggest mismatch: ${top.domain}. Clay ranks it #${top.clayPosition} of ${truth.pairs}; public data ranks it #${top.trancoPosition}.`);
    for (const domain of truth.unranked) {
      const value = run.rows.find((r) => r.domain === domain)?.result?.siteTraffic;
      out.push(`${domain} is too small for the public top-1M list${typeof value === "number" ? `. Clay says ${value.toLocaleString("en-US")} visits` : ""}.`);
    }
  }

  const failing = new Map<string, string[]>();
  for (const row of run.rows) {
    for (const check of row.checks) {
      if (check.pass || check.severity === "warn") continue;
      failing.set(check.check, [...(failing.get(check.check) ?? []), row.domain]);
    }
  }
  for (const [check, domains] of failing) out.push(`Failed "${check}": ${domains.join(", ")}.`);

  const costs = run.rows.flatMap((r) => (r.credits === undefined ? [] : [r.credits]));
  if (costs.length > 1 && Math.max(...costs) !== Math.min(...costs)) {
    const max = Math.max(...costs);
    const priciest = run.rows.filter((r) => r.credits === max).map((r) => r.domain);
    out.push(`Cost per company ranged ${Math.min(...costs)} to ${max} credits (typical: ${percentile(costs, 50)}). Most expensive: ${priciest.join(", ")}.`);
  }
  return out;
}

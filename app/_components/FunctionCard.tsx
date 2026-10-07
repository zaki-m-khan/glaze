import Link from "next/link";
import type { RunRecord } from "@/lib/record";
import { CostStrip, Meter, RankScatter, type RankPoint } from "./charts";
import { num, pct, seconds } from "./format";
import { StatusChip } from "./Status";

export function rankPoints(run: RunRecord): RankPoint[] {
  return run.rows.flatMap((r) =>
    r.truth?.kind === "tranco" && r.truth.clayPosition !== undefined && r.truth.trancoPosition !== undefined
      ? [{ domain: r.domain, clay: r.truth.clayPosition, tranco: r.truth.trancoPosition }]
      : [],
  );
}

export function costs(run: RunRecord): { costs: number[]; labels: string[] } {
  const metered = run.rows.filter((r) => r.credits !== undefined);
  return { costs: metered.map((r) => r.credits!), labels: metered.map((r) => r.domain) };
}

/** The headline number, what it means, and a one-line qualifier. */
export function headline(run: RunRecord): { value: string; label: string; sub: string } {
  const t = run.metrics.truth;
  if (t?.kind === "html-signatures") {
    return {
      value: pct(t.overall.precision),
      label: "of Clay's claims confirmed on the live site",
      sub: `Recall ${pct(t.overall.recall)} · ${t.scoredDomains} sites scored against rendered-page detection`,
    };
  }
  if (t?.kind === "tranco") {
    return {
      value: `ρ ${num(t.spearman)}`,
      label: "rank agreement with Tranco",
      sub: `Spearman correlation over ${t.pairs} companies in the Tranco top 1M`,
    };
  }
  return {
    value: pct(run.metrics.assertionPassRate),
    label: "of sanity checks pass",
    sub: `${run.metrics.checksPassed}/${run.metrics.checksEvaluated} checks. No free ground truth, so values are never called "correct"`,
  };
}

export function FunctionCard({ run }: { run: RunRecord }) {
  const m = run.metrics;
  const h = headline(run);
  const t = m.truth;
  const cost = costs(run);
  return (
    <Link href={`/runs/${run.id}/`} className="card" aria-label={`${run.suiteTitle}: open run details`}>
      <div className="card-head">
        <div>
          <h3>{run.suiteTitle}</h3>
          <div className="fn-id mono">{run.function.routineId}</div>
        </div>
        <StatusChip status={m.status} />
      </div>
      <div className="headline">
        <span className="big">{h.value}</span>
        <span className="big-label">{h.label}</span>
      </div>
      <div className="sub">{h.sub}</div>

      <div className="chart">
        {t?.kind === "html-signatures" && (
          <div style={{ display: "grid", gap: 10 }}>
            <Meter label="Precision (confirmed)" value={t.overall.precision} format={(v) => pct(v)} />
            <Meter label="Recall (nothing missed)" value={t.overall.recall} format={(v) => pct(v)} />
          </div>
        )}
        {t?.kind === "tranco" && <RankScatter points={rankPoints(run)} compact />}
        {!t && <CostStrip costs={cost.costs} labels={cost.labels} />}
      </div>

      <dl className="stats">
        <div>
          <dt>Coverage</dt>
          <dd>{pct(m.coverage)}</dd>
        </div>
        <div>
          <dt>Credits / row</dt>
          <dd>{num(m.creditsPerRow)}</dd>
        </div>
        <div>
          <dt>Actions / row</dt>
          <dd>{num(m.actionsPerRow)}</dd>
        </div>
        <div>
          <dt>p50 latency</dt>
          <dd>{seconds(m.latencyP50Ms)}</dd>
        </div>
      </dl>
      <div className="card-foot">
        <span>{m.rows} companies</span>
        <span>Details →</span>
      </div>
    </Link>
  );
}

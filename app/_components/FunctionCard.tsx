import Link from "next/link";
import type { RunRecord } from "@/lib/record";
import type { RankPoint } from "./charts";
import { bigNumbers, costLine, look, theCatch } from "./present";
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

export function FunctionCard({ run }: { run: RunRecord }) {
  const { name, icon } = look(run);
  return (
    <Link href={`/runs/${run.id}/`} className="card" aria-label={`${name}: see details`}>
      <div className="card-head">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, tiny brand asset */}
        <img src={icon} alt="" width={40} height={40} />
        <h3>{name}</h3>
        <StatusChip status={run.metrics.status} />
      </div>
      <div className="big-row">
        {bigNumbers(run).map((b) => (
          <div key={b.label}>
            <div className="big">{b.value}</div>
            <div className="big-label">{b.label}</div>
          </div>
        ))}
      </div>
      <p className="catch">{theCatch(run)}</p>
      <div className="card-foot">
        <span>{costLine(run)}</span>
        <b>Details →</b>
      </div>
    </Link>
  );
}

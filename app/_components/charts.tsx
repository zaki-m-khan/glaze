import type { TechStat } from "@/lib/truth/score";

/** Hand-rolled SVG charts. Colors come from CSS tokens so they follow light/dark. */

const ink3 = { fill: "var(--ink-3)" };

export function Meter({ label, value, target, format }: { label: string; value: number | undefined; target?: number; format: (v: number | undefined) => string }) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--ink-2)" }}>
        <span>{label}</span>
        <span className="num" style={{ fontWeight: 600, color: "var(--ink)" }}>
          {format(value)}
        </span>
      </div>
      <svg viewBox="0 0 100 8" preserveAspectRatio="none" style={{ width: "100%", height: 8, display: "block", marginTop: 4 }} role="img" aria-label={`${label} ${format(value)}`}>
        <rect x="0" y="0" width="100" height="8" rx="4" style={{ fill: "var(--surface-2)" }} />
        <rect x="0" y="0" width={v * 100} height="8" rx="4" style={{ fill: "var(--chart-a)" }} />
        {target !== undefined && <rect x={target * 100 - 0.4} y="0" width="0.8" height="8" style={{ fill: "var(--ink)" }} />}
      </svg>
    </div>
  );
}

export interface RankPoint {
  domain: string;
  clay: number;
  tranco: number;
}

/** Each company's rank by Clay traffic (x) vs by Tranco (y). On the diagonal = full agreement. */
export function RankScatter({ points, compact = false, highlight = [] }: { points: RankPoint[]; compact?: boolean; highlight?: string[] }) {
  const n = Math.max(2, ...points.map((p) => Math.max(p.clay, p.tranco)));
  const width = compact ? 320 : 240;
  const height = compact ? 110 : 240;
  const [left, right, top, bottom] = compact ? [8, 8, 8, 8] : [30, 10, 10, 28];
  const xScale = (rank: number) => left + ((rank - 1) / (n - 1)) * (width - left - right);
  const yScale = (rank: number) => top + ((rank - 1) / (n - 1)) * (height - top - bottom);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Clay traffic rank versus Tranco rank for each company">
      <line x1={xScale(1)} y1={yScale(1)} x2={xScale(n)} y2={yScale(n)} style={{ stroke: "var(--line)", strokeWidth: 1.5, strokeDasharray: "3 3" }} />
      {points.map((p) => {
        const hot = highlight.includes(p.domain);
        return (
          <g key={p.domain}>
            <circle cx={xScale(p.clay)} cy={yScale(p.tranco)} r={compact ? 4 : 4.5} style={{ fill: hot ? "var(--chart-b)" : "var(--chart-a)", fillOpacity: 0.9 }}>
              <title>{`${p.domain}: #${p.clay} by Clay, #${p.tranco} by Tranco`}</title>
            </circle>
            {!compact && hot && (
              <text x={xScale(p.clay) + 7} y={yScale(p.tranco) + 3.5} style={{ ...ink3, fontSize: 9 }}>
                {p.domain}
              </text>
            )}
          </g>
        );
      })}
      {!compact && (
        <>
          <text x={width / 2} y={height - 6} textAnchor="middle" style={{ ...ink3, fontSize: 9 }}>
            rank by Clay traffic →
          </text>
          <text x={12} y={height / 2} textAnchor="middle" transform={`rotate(-90 12 ${height / 2})`} style={{ ...ink3, fontSize: 9 }}>
            public rank →
          </text>
        </>
      )}
    </svg>
  );
}

/** One dot per row on a credits axis, with the median marked. Shows how uneven per-row cost is. */
export function CostStrip({ costs, labels }: { costs: number[]; labels: string[] }) {
  const max = Math.max(1, ...costs);
  const width = 320;
  const height = 54;
  const x = (c: number) => 10 + (c / max) * (width - 20);
  const sorted = [...costs].sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  const stack = new Map<number, number>();
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Credits per row from ${sorted[0]} to ${max}, median ${median}`}>
      <line x1="10" y1="34" x2={width - 10} y2="34" style={{ stroke: "var(--line)", strokeWidth: 1 }} />
      <line x1={x(median)} y1="8" x2={x(median)} y2="40" style={{ stroke: "var(--ink-3)", strokeWidth: 1, strokeDasharray: "2 2" }} />
      {costs.map((c, i) => {
        const level = stack.get(c) ?? 0;
        stack.set(c, level + 1);
        return (
          <circle key={labels[i]} cx={x(c)} cy={28 - level * 7} r="3.2" style={{ fill: c > median * 3 ? "var(--chart-b)" : "var(--chart-a)" }}>
            <title>{`${labels[i]}: ${c} credits`}</title>
          </circle>
        );
      })}
      <text x="10" y="50" style={{ ...ink3, fontSize: 9 }}>
        0
      </text>
      <text x={x(median)} y="50" textAnchor="middle" style={{ ...ink3, fontSize: 9 }}>
        typical {median}
      </text>
      <text x={width - 10} y="50" textAnchor="end" style={{ ...ink3, fontSize: 9 }}>
        {max} credits
      </text>
    </svg>
  );
}

/** Precision and recall per technology, as paired horizontal bars. */
export function TechBars({ stats }: { stats: TechStat[] }) {
  const rowH = 26;
  const labelW = 118;
  const width = 340;
  const barW = width - labelW - 44;
  const rows = [...stats].sort((a, b) => b.tp + b.fp - (a.tp + a.fp));
  const height = rows.length * rowH + 4;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Precision and recall for each technology">
      {rows.map((t, i) => {
        const y = i * rowH + 4;
        const p = t.precision ?? 0;
        const r = t.recall;
        return (
          <g key={t.tech}>
            <text x={labelW - 8} y={y + 12} textAnchor="end" style={{ fill: "var(--ink-2)", fontSize: 11 }}>
              {t.tech}
            </text>
            <rect x={labelW} y={y + 2} width={barW} height="7" rx="3.5" style={{ fill: "var(--surface-2)" }} />
            <rect x={labelW} y={y + 2} width={Math.max(p * barW, p > 0 ? 3 : 0)} height="7" rx="3.5" style={{ fill: "var(--chart-a)" }} />
            <rect x={labelW} y={y + 11} width={barW} height="7" rx="3.5" style={{ fill: "var(--surface-2)" }} />
            {r !== undefined && <rect x={labelW} y={y + 11} width={Math.max(r * barW, r > 0 ? 3 : 0)} height="7" rx="3.5" style={{ fill: "var(--chart-b)" }} />}
            <text x={width - 2} y={y + 12} textAnchor="end" className="num" style={{ fill: "var(--ink-3)", fontSize: 10 }}>
              {t.tp}/{t.tp + t.fp}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

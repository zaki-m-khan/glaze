import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { allRuns, getRun, isBaseline } from "@/lib/data";
import { findings } from "@/lib/insights";
import type { RowRecord } from "@/lib/record";
import { SAMPLE_LABEL } from "@/lib/report";
import { CostStrip, RankScatter, TechBars } from "../../_components/charts";
import { costs, rankPoints } from "../../_components/FunctionCard";
import { compactNumber, money, seconds, time } from "../../_components/format";
import { detailStats, look, verdict } from "../../_components/present";
import { StatusChip } from "../../_components/Status";

export const dynamicParams = false;

export function generateStaticParams() {
  return allRuns().map((run) => ({ id: run.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const run = getRun((await params).id);
  return { title: run ? look(run).name : "Run" };
}

type Tone = "pass" | "fail" | "warn" | "missing";

function tone(row: RowRecord): Tone {
  if (row.status === "missing") return "missing";
  if (row.status === "failed" || row.checks.some((c) => !c.pass && c.severity === "error")) return "fail";
  if (row.checks.some((c) => !c.pass)) return "warn";
  return "pass";
}

/** What to show on the right of a collapsed row. */
function summaryValue(row: RowRecord): { main: string; small: string } {
  if (row.status !== "complete") return { main: row.status === "failed" ? "Error" : "—", small: row.error ?? "not run" };
  const t = row.truth;
  if (t?.kind === "html-signatures") {
    if (t.verdict === "unverifiable") return { main: "—", small: "couldn't check" };
    const claims = t.truePositives.length + t.falsePositives.length;
    return { main: `${t.truePositives.length} of ${claims}`, small: `confirmed${t.falseNegatives.length ? ` · missed ${t.falseNegatives.length}` : ""}` };
  }
  if (t?.kind === "tranco") {
    return {
      main: t.clayValue === undefined ? "—" : `${compactNumber(t.clayValue)} visits`,
      small: t.trancoRank === null ? "not in public top 1M" : `public rank #${t.trancoRank.toLocaleString("en-US")}`,
    };
  }
  const field = row.checks[0]?.field;
  const value = field ? row.result?.[field] : Object.values(row.result ?? {})[0];
  return { main: money(value), small: row.credits === undefined ? "" : `${row.credits} credits` };
}

function Row({ row }: { row: RowRecord }) {
  const v = summaryValue(row);
  const t = row.truth;
  return (
    <details>
      <summary>
        <span className={`row-dot ${tone(row)}`} aria-hidden="true" />
        <span className="row-name">
          <b>{row.label}</b>
          <span>{row.domain}</span>
        </span>
        <span className="row-value">
          {v.main}
          <small>{v.small}</small>
        </span>
      </summary>
      <div className="row-body">
        {t?.kind === "html-signatures" && t.verdict === "verified" && (
          <div>
            <h4>Compared with what we saw on the site</h4>
            <div className="tags">
              {t.truePositives.map((x) => (
                <span key={x} className="tag tp">
                  ✓ {x}
                </span>
              ))}
              {t.falseNegatives.map((x) => (
                <span key={x} className="tag fn">
                  Missed {x}
                </span>
              ))}
              {t.falsePositives.map((x) => (
                <span key={x} className="tag fp">
                  Not on site: {x}
                </span>
              ))}
              {t.truePositives.length + t.falseNegatives.length + t.falsePositives.length === 0 && (
                <span className="muted">None of the 20 tools we check for.</span>
              )}
            </div>
          </div>
        )}
        {t?.kind === "html-signatures" && t.verdict === "unverifiable" && <p className="muted" style={{ margin: 0 }}>Couldn&apos;t check: {t.reason}.</p>}
        {t?.kind === "tranco" && (
          <dl className="kv">
            <dt>Clay says</dt>
            <dd>{t.clayValue === undefined ? "—" : `${t.clayValue.toLocaleString("en-US")} visits`}</dd>
            <dt>Public rank</dt>
            <dd>{t.trancoRank === null ? "not in the top 1M" : `#${t.trancoRank.toLocaleString("en-US")} (Tranco)`}</dd>
            {t.clayPosition !== undefined && (
              <>
                <dt>Among these</dt>
                <dd>
                  #{t.clayPosition} by Clay, #{t.trancoPosition} publicly
                </dd>
              </>
            )}
          </dl>
        )}
        {row.checks.length > 0 && (
          <div>
            <h4>Checks</h4>
            <ul className="checklist">
              {row.checks.map((c) => (
                <li key={c.check}>
                  <span className={c.pass ? "ok" : c.severity === "warn" ? "wn" : "no"}>{c.pass ? "✓" : "✗"}</span>
                  <span>
                    {c.check} <span className="muted">· {c.message}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {row.judge.length > 0 && (
          <div>
            <h4>AI judge</h4>
            <ul className="checklist">
              {row.judge.map((j) => (
                <li key={j.field}>
                  <span className={j.pass ? "ok" : "no"}>{j.score}</span>
                  <span>{j.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <dl className="kv">
          <dt>Cost</dt>
          <dd>
            {row.credits ?? "—"} credits, {row.actions ?? "—"} actions
          </dd>
          <dt>Time</dt>
          <dd>{seconds(row.latencyMs)}</dd>
          {row.recordedAt && (
            <>
              <dt>Run at</dt>
              <dd>{time(row.recordedAt)}</dd>
            </>
          )}
        </dl>
        {row.result && (
          <div>
            <h4>What Clay returned</h4>
            <pre className="raw">{JSON.stringify(row.result, null, 2)}</pre>
          </div>
        )}
      </div>
    </details>
  );
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const run = getRun((await params).id);
  if (!run) notFound();
  const t = run.metrics.truth;
  const { name, icon } = look(run);
  const cost = costs(run);
  const outliers = t?.kind === "tranco" ? t.outliers.slice(0, 3).map((o) => o.domain) : [];

  return (
    <>
      <Link href="/#results" className="backlink">
        ← All results
      </Link>
      {run.sample && <div className="sample-banner">{SAMPLE_LABEL}</div>}
      <div className="detail-head">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, tiny brand asset */}
        <img src={icon} alt="" width={56} height={56} />
        <div>
          <h1>{name}</h1>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <StatusChip status={run.metrics.status} />
            {isBaseline(run) && <span className="chip plain">Baseline</span>}
          </div>
        </div>
      </div>

      <p className="verdict">{verdict(run)}</p>

      <dl className="stats">
        {detailStats(run).map((s) => (
          <div key={s.label}>
            <dt>{s.label}</dt>
            <dd>{s.value}</dd>
          </div>
        ))}
      </dl>

      <h2>What we found</h2>
      <ul className="findings">
        {findings(run).map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>

      {t?.kind === "html-signatures" && (
        <>
          <h2>Tool by tool</h2>
          <p className="section-sub">How often Clay&apos;s claim showed up on the site, and how much of what was there Clay found.</p>
          <div className="card">
            <div className="chart">
              <TechBars stats={t.perTech} />
            </div>
            <div className="legend">
              <span>
                <i style={{ background: "var(--chart-a)" }} />
                Confirmed
              </span>
              <span>
                <i style={{ background: "var(--chart-b)" }} />
                Found
              </span>
              <span>Right: confirmed / claimed</span>
            </div>
          </div>
        </>
      )}
      {t?.kind === "tranco" && (
        <>
          <h2>Clay vs public rankings</h2>
          <p className="section-sub">Each dot is a company. Dots on the line are ranked the same by both.</p>
          <div className="card chart" style={{ maxWidth: 440 }}>
            <RankScatter points={rankPoints(run)} highlight={outliers} />
          </div>
        </>
      )}
      {!t && cost.costs.length > 0 && (
        <>
          <h2>Cost per company</h2>
          <p className="section-sub">Each dot is one company. Yellow dots cost far more than the rest.</p>
          <div className="card chart">
            <CostStrip costs={cost.costs} labels={cost.labels} />
          </div>
        </>
      )}

      <h2>Every company</h2>
      <p className="section-sub">Tap one to see exactly what Clay returned.</p>
      <div className="rows">
        {run.rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </div>

      <details className="method">
        <summary>How we checked</summary>
        <p>
          <strong>Function:</strong> {run.suiteTitle} (<code>{run.function.routineId}</code>), run through Clay&apos;s API on {time(run.startedAt)}, one
          company at a time.
        </p>
        <p>
          <strong>Compared against:</strong>{" "}
          {run.truthSource ? `${run.truthSource.source}. Snapshot taken ${time(run.truthSource.generatedAt)}.` : "nothing free exists for funding, so we only check that answers make sense. We never call a value correct."}
        </p>
        <p>
          <strong>Cost:</strong> measured from the workspace credit balance before and after each company. This run used {run.spend.credits} credits and{" "}
          {run.spend.actions} actions.
          {run.rescoredAt ? ` Re-checked against updated public data on ${time(run.rescoredAt)}; Clay's answers are unchanged.` : ""}
        </p>
        <p>
          <strong>AI judge:</strong> {run.judge.enabled ? `on (${run.judge.model}).` : "off for this run."}
        </p>
      </details>
    </>
  );
}

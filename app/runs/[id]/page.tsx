import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { allRuns, getRun, isBaseline } from "@/lib/data";
import { findings } from "@/lib/insights";
import type { RowRecord } from "@/lib/record";
import { SAMPLE_LABEL } from "@/lib/report";
import { CostStrip, RankScatter, TechBars } from "../../_components/charts";
import { costs, headline, rankPoints } from "../../_components/FunctionCard";
import { compactNumber, money, num, pct, seconds, time } from "../../_components/format";
import { StatusChip } from "../../_components/Status";

export const dynamicParams = false;

export function generateStaticParams() {
  return allRuns().map((run) => ({ id: run.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const run = getRun((await params).id);
  return { title: run ? `${run.suiteTitle} run` : "Run" };
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
  if (row.status !== "complete") return { main: row.status === "failed" ? "failed" : "—", small: row.error ?? "not recorded" };
  const t = row.truth;
  if (t?.kind === "html-signatures") {
    if (t.verdict === "unverifiable") return { main: "—", small: "unverifiable" };
    const claims = t.truePositives.length + t.falsePositives.length;
    return { main: `${t.truePositives.length}/${claims}`, small: `confirmed${t.falseNegatives.length ? ` · ${t.falseNegatives.length} missed` : ""}` };
  }
  if (t?.kind === "tranco") {
    return { main: t.clayValue === undefined ? "—" : compactNumber(t.clayValue), small: t.trancoRank === null ? "not in Tranco 1M" : `Tranco #${t.trancoRank.toLocaleString("en-US")}` };
  }
  const field = row.checks[0]?.field;
  const value = field ? row.result?.[field] : Object.values(row.result ?? {})[0];
  return { main: money(value), small: row.credits === undefined ? "" : `${row.credits} credits` };
}

function Row({ row }: { row: RowRecord }) {
  const v = summaryValue(row);
  const t = row.truth;
  const raw = row.result ? JSON.stringify(row.result, null, 2) : undefined;
  return (
    <details>
      <summary>
        <span className={`row-dot ${tone(row)}`} aria-label={tone(row)} />
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
        {row.checks.length > 0 && (
          <div>
            <h4>Checks</h4>
            <ul className="checklist">
              {row.checks.map((c) => (
                <li key={c.check}>
                  <span className={c.pass ? "ok" : c.severity === "warn" ? "wn" : "no"}>{c.pass ? "✓" : c.severity === "warn" ? "!" : "✗"}</span>
                  <span>
                    {c.check} <span className="muted">· {c.message}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {t?.kind === "html-signatures" && t.verdict === "verified" && (
          <div>
            <h4>Against rendered-page detection</h4>
            <div className="tags">
              {t.truePositives.map((x) => (
                <span key={x} className="tag tp">
                  ✓ {x}
                </span>
              ))}
              {t.falseNegatives.map((x) => (
                <span key={x} className="tag fn">
                  missed {x}
                </span>
              ))}
              {t.falsePositives.map((x) => (
                <span key={x} className="tag fp">
                  not seen: {x}
                </span>
              ))}
              {t.truePositives.length + t.falseNegatives.length + t.falsePositives.length === 0 && <span className="muted">None of the 20 detectable technologies on either side.</span>}
            </div>
          </div>
        )}
        {t?.kind === "html-signatures" && t.verdict === "unverifiable" && <p className="muted" style={{ margin: 0 }}>Not scored: {t.reason}.</p>}
        {t?.kind === "tranco" && (
          <div>
            <h4>Against Tranco</h4>
            <dl className="kv">
              <dt>Clay visits</dt>
              <dd>{t.clayValue?.toLocaleString("en-US") ?? "—"}</dd>
              <dt>Tranco rank</dt>
              <dd>{t.trancoRank === null ? "not in top 1M" : `#${t.trancoRank.toLocaleString("en-US")}`}</dd>
              {t.clayPosition !== undefined && (
                <>
                  <dt>Position here</dt>
                  <dd>
                    #{t.clayPosition} by Clay · #{t.trancoPosition} by Tranco
                  </dd>
                </>
              )}
            </dl>
          </div>
        )}
        {row.judge.length > 0 && (
          <div>
            <h4>Judge</h4>
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
        <div>
          <h4>Call</h4>
          <dl className="kv">
            <dt>Credits</dt>
            <dd>{row.credits ?? "—"}</dd>
            <dt>Actions</dt>
            <dd>{row.actions ?? "—"}</dd>
            <dt>Latency</dt>
            <dd>{seconds(row.latencyMs)}</dd>
            {row.clayRunId && (
              <>
                <dt>Clay run</dt>
                <dd className="mono">{row.clayRunId}</dd>
              </>
            )}
            {row.recordedAt && (
              <>
                <dt>Recorded</dt>
                <dd>{time(row.recordedAt)}</dd>
              </>
            )}
          </dl>
        </div>
        {raw && (
          <div>
            <h4>Raw output</h4>
            <pre className="raw">{raw}</pre>
          </div>
        )}
      </div>
    </details>
  );
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const run = getRun((await params).id);
  if (!run) notFound();
  const m = run.metrics;
  const h = headline(run);
  const t = m.truth;
  const notes = findings(run);
  const cost = costs(run);
  const outliers = t?.kind === "tranco" ? t.outliers.slice(0, 3).map((o) => o.domain) : [];

  return (
    <>
      <Link href="/" className="backlink">
        ← All functions
      </Link>
      {run.sample && <div className="sample-banner">{SAMPLE_LABEL}</div>}
      <div className="eyebrow">
        {run.mode === "live" ? "Live run" : "Replay"} · {time(run.startedAt)}
      </div>
      <h1>{run.suiteTitle}</h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <StatusChip status={m.status} />
        {isBaseline(run) && <span className="chip neutral plain">Baseline</span>}
        <span className="chip neutral plain mono">{run.function.routineId}</span>
      </div>

      <div className="headline" style={{ marginTop: 18 }}>
        <span className="big">{h.value}</span>
        <span className="big-label">{h.label}</span>
      </div>
      <div className="sub">{h.sub}</div>

      <dl className="stats four">
        <div>
          <dt>Coverage</dt>
          <dd>
            {pct(m.coverage)} <span className="muted small">({m.completed}/{m.rows})</span>
          </dd>
        </div>
        <div>
          <dt>Checks passed</dt>
          <dd>
            {m.checksPassed}/{m.checksEvaluated}
          </dd>
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
        <div>
          <dt>p95 latency</dt>
          <dd>{seconds(m.latencyP95Ms)}</dd>
        </div>
        <div>
          <dt>Run cost</dt>
          <dd>
            {run.spend.credits} cr · {run.spend.actions} act
          </dd>
        </div>
        <div>
          <dt>Failed rows</dt>
          <dd>{m.failed}</dd>
        </div>
      </dl>

      {notes.length > 0 && (
        <>
          <h2>What the run shows</h2>
          <ul className="findings">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}

      {t?.kind === "html-signatures" && (
        <>
          <h2>Per technology</h2>
          <div className="card">
            <TechBars stats={t.perTech} />
            <div className="legend">
              <span>
                <i style={{ background: "var(--chart-a)" }} />
                precision
              </span>
              <span>
                <i style={{ background: "var(--chart-b)" }} />
                recall
              </span>
              <span>confirmed / claimed</span>
            </div>
          </div>
        </>
      )}
      {t?.kind === "tranco" && (
        <>
          <h2>Clay rank vs Tranco rank</h2>
          <div className="card" style={{ maxWidth: 420 }}>
            <RankScatter points={rankPoints(run)} highlight={outliers} />
            <p className="muted small" style={{ margin: "6px 0 0" }}>
              Each dot is a company. On the dashed line, Clay and Tranco agree on its position. Labeled: largest disagreements.
            </p>
          </div>
        </>
      )}
      {!t && cost.costs.length > 0 && (
        <>
          <h2>Credits per row</h2>
          <div className="card">
            <CostStrip costs={cost.costs} labels={cost.labels} />
            <p className="muted small" style={{ margin: "6px 0 0" }}>
              One dot per company, measured from the workspace balance before and after each single-row run.
            </p>
          </div>
        </>
      )}

      <h2>Companies</h2>
      <p className="muted small" style={{ marginTop: -6 }}>
        Tap a company for checks, ground truth and the raw Clay output.
      </p>
      <div className="rows">
        {run.rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </div>

      <h2>Method</h2>
      <div className="note">
        <p style={{ marginTop: 0 }}>
          <strong>Ground truth:</strong> {run.truthSource ? `${run.truthSource.source}, snapshot ${time(run.truthSource.generatedAt)}.` : "none for this function; only schema and sanity checks."}
        </p>
        <p>
          <strong>LLM judge:</strong> {run.judge.enabled ? `${run.judge.model}.` : `off (${run.judge.note}).`}
        </p>
        <p style={{ marginBottom: 0 }}>
          <strong>Metering:</strong> one row per Clay run; credits and actions are the workspace balance delta for that run
          {run.spend.balanceBefore && run.spend.balanceAfter
            ? ` (this run: ${run.spend.balanceBefore.credits.toLocaleString("en-US")} → ${run.spend.balanceAfter.credits.toLocaleString("en-US")} credits)`
            : ""}
          .{run.rescoredAt ? ` Re-scored against current checks and truth on ${time(run.rescoredAt)}; outputs unchanged.` : ""}
        </p>
      </div>
    </>
  );
}

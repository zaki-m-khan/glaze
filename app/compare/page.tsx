import type { Metadata } from "next";
import Link from "next/link";
import { compares } from "@/lib/data";
import { SAMPLE_LABEL } from "@/lib/report";
import { num, pct, time } from "../_components/format";

export const metadata: Metadata = { title: "Compare" };

function show(value: unknown): string {
  if (value === undefined) return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

export default function ComparePage() {
  const record = compares().at(-1);

  if (!record) {
    return (
      <div className="prose">
        <Link href="/" className="backlink">
          ← Home
        </Link>
        <h1>Compare two versions</h1>
        <p className="pull">Changed a prompt? Run old and new on the same companies and see which wins.</p>
        <p>
          Glaze runs both versions, has an AI judge score each answer, and shows the winner and the cost of each. It&apos;s built and tested, but
          hasn&apos;t been run live yet, so there are no results to show.
        </p>
        <pre className="raw" style={{ maxHeight: "none" }}>
          {`npx glaze compare suites/one-liner.yaml \\
  --a function:t_<old> --b function:t_<new> --live`}
        </pre>
      </div>
    );
  }

  const s = record.summary;
  return (
    <>
      <Link href="/" className="backlink">
        ← Home
      </Link>
      {record.sample && <div className="sample-banner">{SAMPLE_LABEL}</div>}
      <h1>{record.suiteTitle}</h1>
      <p className="verdict">
        {s.winsA === s.winsB ? "Too close to call." : `Version ${s.winsA > s.winsB ? "A" : "B"} wins ${Math.max(s.winsA, s.winsB)} of ${record.rows.length}.`}
      </p>
      <p className="section-sub">Run {time(record.createdAt)}.</p>
      <div className="table-scroll" style={{ marginTop: 20 }}>
        <table>
          <thead>
            <tr>
              <th />
              <th className="n">A</th>
              <th className="n">B</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Companies won</td>
              <td className="n">{s.winsA}</td>
              <td className="n">{s.winsB}</td>
            </tr>
            <tr>
              <td>Judge score (1–5)</td>
              <td className="n">{num(s.a.meanScore)}</td>
              <td className="n">{num(s.b.meanScore)}</td>
            </tr>
            <tr>
              <td>Judge pass rate</td>
              <td className="n">{pct(s.a.passRate)}</td>
              <td className="n">{pct(s.b.passRate)}</td>
            </tr>
            <tr>
              <td>Answered</td>
              <td className="n">{pct(s.a.coverage)}</td>
              <td className="n">{pct(s.b.coverage)}</td>
            </tr>
            <tr>
              <td>Credits per company</td>
              <td className="n">{num(s.a.creditsPerRow)}</td>
              <td className="n">{num(s.b.creditsPerRow)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h2>Every company</h2>
      <div className="rows">
        {record.rows.map((row) => (
          <details key={row.id}>
            <summary>
              <span className={`row-dot ${row.winner === "tie" ? "missing" : "pass"}`} aria-hidden="true" />
              <span className="row-name">
                <b>{row.label}</b>
                <span>{row.domain}</span>
              </span>
              <span className="row-value">
                {row.winner === "tie" ? "Tie" : `${row.winner.toUpperCase()} wins`}
                <small>
                  {num(row.a.score, 1)} vs {num(row.b.score, 1)}
                </small>
              </span>
            </summary>
            <div className="row-body">
              {(["a", "b"] as const).map((k) => (
                <div key={k}>
                  <h4>{k.toUpperCase()}</h4>
                  <p style={{ margin: "0 0 4px" }}>{show(row[k].value)}</p>
                  {row[k].reasons.map((r) => (
                    <p key={r} className="muted small" style={{ margin: 0 }}>
                      Judge: {r}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </>
  );
}

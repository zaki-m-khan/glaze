import type { Metadata } from "next";
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
      <>
        <div className="eyebrow">Head to head</div>
        <h1>Compare two versions of a function</h1>
        <p className="lede">
          Edit a Claygent prompt or swap a provider, and <code>glaze compare</code> runs the old and new function on the same companies, has an LLM judge
          score both against a rubric, and shows which one wins per row and what each costs.
        </p>
        <div className="note" style={{ marginTop: 22 }}>
          <strong>No compare run yet.</strong> The live demo needs two versions of a custom function in the workspace (<code>CLAY_FN_A</code>,{" "}
          <code>CLAY_FN_B</code>) and an Anthropic key for the judge. Neither was configured for the Oct 7 benchmark, so nothing is shown here rather
          than made-up results. The command is implemented and unit-tested.
        </div>
        <h2>Run it</h2>
        <pre className="raw" style={{ maxHeight: "none" }}>
          {`npx glaze compare suites/one-liner.yaml \\
  --a function:t_<version A> \\
  --b function:t_<version B> --live`}
        </pre>
        <p className="muted small">
          The example suite asks for a one-sentence description of what each company sells, judged on accuracy, naming the buyer, and not inventing
          products.
        </p>
      </>
    );
  }

  const s = record.summary;
  return (
    <>
      {record.sample && <div className="sample-banner">{SAMPLE_LABEL}</div>}
      <div className="eyebrow">Head to head · {time(record.createdAt)}</div>
      <h1>{record.suiteTitle}</h1>
      <p className="lede">
        Same {record.rows.length} companies, two function versions, decided by {record.decidedBy === "judge" ? "LLM judge score" : "failed checks"}.
      </p>
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
              <td>Routine</td>
              <td className="n mono">{record.a.routineId}</td>
              <td className="n mono">{record.b.routineId}</td>
            </tr>
            <tr>
              <td>Rows won</td>
              <td className="n">{s.winsA}</td>
              <td className="n">{s.winsB}</td>
            </tr>
            <tr>
              <td>Judge mean (1–5)</td>
              <td className="n">{num(s.a.meanScore)}</td>
              <td className="n">{num(s.b.meanScore)}</td>
            </tr>
            <tr>
              <td>Judge pass rate</td>
              <td className="n">{pct(s.a.passRate)}</td>
              <td className="n">{pct(s.b.passRate)}</td>
            </tr>
            <tr>
              <td>Coverage</td>
              <td className="n">{pct(s.a.coverage)}</td>
              <td className="n">{pct(s.b.coverage)}</td>
            </tr>
            <tr>
              <td>Credits / row</td>
              <td className="n">{num(s.a.creditsPerRow)}</td>
              <td className="n">{num(s.b.creditsPerRow)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h2>Per company</h2>
      <div className="rows">
        {record.rows.map((row) => (
          <details key={row.id}>
            <summary>
              <span className={`row-dot ${row.winner === "tie" ? "missing" : "pass"}`} />
              <span className="row-name">
                <b>{row.label}</b>
                <span>{row.domain}</span>
              </span>
              <span className="row-value">
                {row.winner === "tie" ? "tie" : `${row.winner.toUpperCase()} wins`}
                <small>
                  {num(row.a.score, 1)} vs {num(row.b.score, 1)}
                </small>
              </span>
            </summary>
            <div className="row-body">
              {(["a", "b"] as const).map((k) => (
                <div key={k}>
                  <h4>
                    {k.toUpperCase()} · {row[k].status}
                  </h4>
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

import Link from "next/link";
import { REPO_URL, demoPrUrl, headlineRuns, spend } from "@/lib/data";
import { SAMPLE_LABEL } from "@/lib/report";
import { FunctionCard } from "./_components/FunctionCard";
import { day } from "./_components/format";

export default function Home() {
  const runs = headlineRuns();
  const ledger = spend();
  const pr = demoPrUrl();
  const sample = runs.some((r) => r.sample);
  const lastRun = runs.map((r) => r.finishedAt).sort().at(-1);

  return (
    <>
      {sample && <div className="sample-banner">{SAMPLE_LABEL}</div>}
      <div className="eyebrow">Function benchmark{lastRun ? ` · ${day(lastRun)}` : ""}</div>
      <h1>CI for Clay functions</h1>
      <p className="lede">
        Glaze runs a Clay function on a fixed set of companies, scores every output against ground truth Clay didn&apos;t produce, meters the credits it
        spends, and flags regressions on every pull request.
      </p>

      <h2>Three Clay-managed functions, live</h2>
      {runs.length === 0 ? (
        <p className="note">No runs recorded yet. Run <code>npx glaze run suites/tech-stack.yaml --live</code>.</p>
      ) : (
        <div className="grid three">
          {runs.map((run) => (
            <FunctionCard key={run.id} run={run} />
          ))}
        </div>
      )}

      <p style={{ marginTop: 18, fontWeight: 600 }}>Benchmarked on the 20 companies speaking at Sculpt 2026.</p>
      <p className="muted small" style={{ marginTop: -8 }}>
        Every number above comes from a live Clay Public API run
        {ledger ? (
          <>
            . Building this benchmark cost{" "}
            <span className="num">
              {ledger.credits} data credits and {ledger.actions} actions
            </span>
            , measured from balance deltas.
          </>
        ) : (
          "."
        )}{" "}
        Re-scoring and CI replay recorded outputs for free.
      </p>

      <div className="actions">
        {pr && (
          <a className="btn primary" href={pr}>
            See it catch a regression →
          </a>
        )}
        <Link className="btn" href="/about/">
          How it works
        </Link>
        <a className="btn" href={REPO_URL}>
          GitHub
        </a>
      </div>
    </>
  );
}

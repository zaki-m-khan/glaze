import Link from "next/link";
import { demoPrUrl, headlineRuns, spend } from "@/lib/data";
import { SAMPLE_LABEL } from "@/lib/report";
import { FunctionCard } from "./_components/FunctionCard";
import { day } from "./_components/format";

/* eslint-disable @next/next/no-img-element -- static export; brand tiles are tiny local PNGs */

const STEPS = [
  { icon: "/brand/dot-blue.png", title: "Run", text: "Glaze runs your function on 20 real companies and counts every credit." },
  { icon: "/brand/star-yellow.png", title: "Check", text: "It checks each answer against public data that Clay didn't make." },
  { icon: "/brand/dot-pink.png", title: "Catch", text: "When someone changes a function, it flags anything that got worse." },
];

export default function Home() {
  const runs = headlineRuns();
  const ledger = spend();
  const pr = demoPrUrl();
  const lastRun = runs.map((r) => r.finishedAt).sort().at(-1);

  return (
    <>
      {runs.some((r) => r.sample) && <div className="sample-banner">{SAMPLE_LABEL}</div>}

      <section className="hero">
        <div className="hero-tiles" aria-hidden="true">
          <img className="t1" src="/brand/star-blue.png" alt="" />
          <img className="t2" src="/brand/dot-yellow.png" alt="" />
          <img className="t3" src="/brand/star-pink.png" alt="" />
        </div>
        <span className="built-for">
          Built for
          <img className="logo-on-light" src="/brand/clay-logo.png" alt="Clay" width={64} height={20} />
          <img className="logo-on-dark" src="/brand/clay-logo-white.png" alt="Clay" width={64} height={20} />
        </span>
        <h1>Test your Clay functions.</h1>
        <p className="lede">Know if the answers are right, what they cost, and when they break.</p>
        <div className="actions">
          <a className="btn primary" href="#results">
            See the results
          </a>
          {pr && (
            <a className="btn" href={pr}>
              Watch it catch a bug
            </a>
          )}
        </div>
      </section>

      <h2>How it works</h2>
      <p className="section-sub">Like tests for code, but for Clay functions.</p>
      <ol className="steps">
        {STEPS.map((s) => (
          <li key={s.title} className="step">
            <img src={s.icon} alt="" width={44} height={44} />
            <div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 id="results" style={{ scrollMarginTop: 80 }}>
        Results
      </h2>
      <p className="section-sub">
        3 Clay functions, run live on the 20 companies speaking at Sculpt 2026{lastRun ? ` (${day(lastRun)})` : ""}. Tap one for details.
      </p>
      {runs.length === 0 ? (
        <p className="note">
          No runs yet. Try <code>npx glaze run suites/tech-stack.yaml --live</code>.
        </p>
      ) : (
        <div className="grid three">
          {runs.map((run) => (
            <FunctionCard key={run.id} run={run} />
          ))}
        </div>
      )}

      <div className="closing">
        <p style={{ fontWeight: 700, fontSize: 20 }}>Benchmarked on the 20 companies speaking at Sculpt 2026.</p>
        {ledger && (
          <p className="muted-inv">
            The whole test cost {ledger.credits} credits. Re-checking it is free.
          </p>
        )}
        <div className="actions">
          {pr && (
            <a className="btn primary" href={pr}>
              Watch it catch a bug
            </a>
          )}
          <Link className="btn" href="/about/">
            Why this exists
          </Link>
        </div>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { REPO_URL, demoPrUrl, spend } from "@/lib/data";

export const metadata: Metadata = { title: "About" };

export default function About() {
  const ledger = spend();
  const pr = demoPrUrl();
  return (
    <div className="prose">
      <div className="eyebrow">About</div>
      <h1>Why test a Clay function?</h1>
      <p className="lede">
        GTM teams wire Clay functions into tables, workflows and agents, and then nobody tests them. When a provider&apos;s coverage drops, a waterfall
        returns junk, or someone edits a Claygent prompt, the damage shows up weeks later as bounced emails, bad routing and wasted credits.
      </p>
      <p>Glaze treats a function like code: a fixed test set, checks that run on every change, and a diff against the last known-good run.</p>

      <h2>How it works</h2>
      <ol className="steps">
        <li>
          <span>
            <strong>Suite.</strong> A YAML file names a function, a fixed list of companies, and the checks its output must pass: required fields, types,
            enums, ranges, dates, and custom checks like &quot;not a placeholder&quot;.
          </span>
        </li>
        <li>
          <span>
            <strong>Run.</strong> Glaze calls the function through Clay&apos;s Public API, one row per run, and reads the workspace balance before and
            after to meter the exact credits and actions each row spends. Every output is cached, so re-running costs nothing.
          </span>
        </li>
        <li>
          <span>
            <strong>Score.</strong> Outputs are checked against ground truth Clay didn&apos;t produce: technologies Glaze detects itself by rendering
            each homepage in Chromium, and the public Tranco top-1M ranking. Free-text fields can be scored by an LLM judge against a rubric.
          </span>
        </li>
        <li>
          <span>
            <strong>Diff.</strong> Each run is compared to a saved baseline. Coverage or accuracy drops, cost-per-row increases, and rows that used to
            pass and now fail are flagged as regressions.
          </span>
        </li>
        <li>
          <span>
            <strong>Report.</strong> In the terminal, as JSON, on this dashboard, and as a sticky comment on every pull request that touches a suite.{" "}
            {pr ? <a href={pr}>See the demo PR.</a> : null}
          </span>
        </li>
      </ol>

      <h2>What the numbers mean</h2>
      <ul>
        <li>
          <strong>Coverage:</strong> the share of companies where Clay completed and every required field has a value. It says nothing about whether
          the value is right.
        </li>
        <li>
          <strong>Tech stack precision:</strong> of the technologies Clay reports that Glaze can detect (20 signatures), the share Glaze also saw on
          the live homepage. <strong>Recall</strong> is the share of what Glaze saw that Clay also reported.
        </li>
        <li>
          <strong>Traffic ρ:</strong> Spearman rank correlation between Clay&apos;s monthly visits and Tranco popularity rank across the same companies.
          +1 means identical ordering.
        </li>
        <li>
          <strong>Funding pass rate:</strong> the share of sanity checks that pass. There&apos;s no free source of true funding data, so Glaze never
          claims a funding value is correct, only that it&apos;s well-formed and plausible.
        </li>
      </ul>

      <h2>Limitations</h2>
      <ul>
        <li>
          Twenty companies is a demo-sized test set, chosen because they spoke at Sculpt, not at random. Large, well-known sites are easier than the
          long tail most GTM teams enrich.
        </li>
        <li>
          Tech-stack ground truth only sees the homepage, as a first-time US visitor, in one 6-second window. Clay&apos;s data is domain-wide and
          historical, so a tech Glaze didn&apos;t see may still be correct (checkout pages, subdomains, tags behind cookie consent). Treat precision as a
          lower bound. Recall is only measured over the 20 technologies Glaze can detect.
        </li>
        <li>Tranco measures popularity rank, not visits, so only the ordering is compared. One company (gonimbly.com) isn&apos;t in the top 1M.</li>
        <li>
          Credits are measured from balance deltas, so they&apos;re only exact if nothing else in the workspace spends during a run. Glaze waits for
          the balance to settle and runs rows one at a time.
        </li>
        <li>Provider data drifts. A live re-run can differ from the recorded baseline without anything being broken; CI replays recorded outputs so PR checks stay deterministic.</li>
        <li>The LLM judge wasn&apos;t enabled for the Oct 7 runs (no Anthropic key was configured), so no row here has a judge score.</li>
      </ul>

      <h2>Cost</h2>
      <p>
        {ledger
          ? `The whole benchmark, including the one-row smoke tests, spent ${ledger.credits} data credits and ${ledger.actions} actions, against hard budgets of 250 and 150 that the CLI refuses to cross.`
          : "Live runs need an explicit --live flag and stay under hard credit and action budgets."}{" "}
        Re-scoring, CI checks and this site use recorded outputs and spend nothing.
      </p>

      <div className="actions">
        <a className="btn primary" href={REPO_URL}>
          Source on GitHub
        </a>
        <Link className="btn" href="/">
          Back to the benchmark
        </Link>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { REPO_URL, demoPrUrl, spend } from "@/lib/data";

export const metadata: Metadata = { title: "Why" };

export default function Why() {
  const ledger = spend();
  const pr = demoPrUrl();
  return (
    <div className="prose">
      <Link href="/" className="backlink">
        ← Home
      </Link>
      <h1>Why test a Clay function?</h1>
      <p className="pull">Because a function can quietly start giving bad answers, and nobody looks until it costs money.</p>

      <h2>The problem</h2>
      <p>
        A Clay function is a reusable step, like &quot;find this company&apos;s funding.&quot; Teams plug one function into many tables, workflows and
        AI agents.
      </p>
      <p>Then things change underneath it:</p>
      <ul>
        <li>A data provider gets worse or goes down.</li>
        <li>Someone edits a prompt to fix one case and breaks five others.</li>
        <li>A lookup starts costing more credits than it used to.</li>
      </ul>
      <p>
        When a person looks at a table, they might spot it. When an agent calls the function through the API, nobody looks. The bad data flows straight
        into emails, routing and reports.
      </p>

      <h2>A real example</h2>
      <p>
        In our live run, Clay&apos;s funding function returned <code>&quot;2.1&quot;</code> for BILL and <code>&quot;5&quot;</code> for HubSpot. Those
        were the two most expensive lookups, at 26 credits each, and the numbers look like they lost their unit. Nothing errored, so nothing flagged it.
      </p>

      <h2>What Glaze does</h2>
      <ul>
        <li>
          <strong>Runs</strong> a function on a fixed list of real companies, and counts the exact credits each one costs.
        </li>
        <li>
          <strong>Checks</strong> every answer against public data Clay didn&apos;t make, plus simple rules (&quot;funding can&apos;t be $0&quot;).
        </li>
        <li>
          <strong>Catches</strong> changes. When someone edits a function or its rules, Glaze compares against the last good run and comments on the pull
          request. {pr ? <a href={pr}>See it happen.</a> : null}
        </li>
      </ul>
      <p>It&apos;s the same idea as tests for code, or evals for AI prompts.</p>

      <h2>Who needs it</h2>
      <ul>
        <li>Teams running Clay functions inside AI agents or apps, where no human reviews the output.</li>
        <li>Anyone editing AI research prompts who wants proof the new version is better before switching.</li>
        <li>Ops teams who want to know which lookups burn the most credits.</li>
      </ul>
      <p>If you run one table and read every row yourself, you probably don&apos;t need this.</p>

      <h2>Honest limits</h2>
      <ul>
        <li>20 big, well-known companies. Small companies are harder, and this set doesn&apos;t test them.</li>
        <li>For tech stack, we only look at each homepage, once. Clay may know about tools used on other pages or in the past.</li>
        <li>Funding has no free public source, so we only check that answers make sense.</li>
        <li>The AI judge was off for these runs.</li>
      </ul>

      <h2>Cost</h2>
      <p>
        {ledger ? `The full test used ${ledger.credits} credits and ${ledger.actions} actions. ` : ""}Re-checking it, and every pull request check,
        is free, because Glaze reuses saved answers.
      </p>

      <div className="actions">
        <Link className="btn primary" href="/#results">
          See the results
        </Link>
        <a className="btn" href={REPO_URL}>
          Code on GitHub
        </a>
      </div>
    </div>
  );
}

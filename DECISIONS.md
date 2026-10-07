# Decisions

Calls made during the unattended build, with the reason for each. Newest at the bottom.

## Setup

- **Single package.** Next.js App Router dashboard and the `glaze` CLI share one `package.json`, so Vercel builds one thing and the CLI and dashboard read the same `data/` files.
- **TypeScript 5.9, not 7.0.** TS 7 (the native port) is current on npm, but Next 16's type plugin and `eslint-config-next` are built and tested against 5.x. Strict mode plus `noUncheckedIndexedAccess`.
- **ESLint 9, not 10.** `eslint-config-next@16.4` declares `eslint >=9`, and its plugins aren't all verified on 10 yet.
- **Static export (`output: "export"`).** The dashboard needs no server and no secrets; it reads committed run records at build time.
- **CLI runs through `tsx`.** `bin/glaze.mjs` registers tsx and imports `src/cli/index.ts`, so there is no separate compile step and `npx glaze` / `npm run glaze --` both work from a fresh clone.
- **Node >= 22.12.** Vitest 5 requires it. This machine has Node 24.
- **`BUILD_PROMPT.md` is not committed.** It's a private build brief, not project documentation; everything a reader needs is in the README and this file.
- **LF line endings everywhere** (`.gitattributes`), so shell scripts and snapshots behave the same on Windows and in Linux CI.

## Clay API (M1 smoke test, Oct 7 2026)

- **Docs read:** routines/api, run + results reference, rate-limits, errors, execution-model, clay-managed-functions, custom-functions, credits/balance, plus the full `openapi.json`. They match the brief. Two additions from the docs: terminal `200` responses may carry an unrecognized `status` (treat as terminal, unhandled), and there is no endpoint to list routines, so ids can't be discovered via the API.
- **Routine id form:** `function:` + `t_...` works for these Clay-managed functions too (a bogus `function:t_...` id returns `404 {"message":"Routine not found"}`).
- **Input keys are the display names**, exactly as shown in the function's input list: `Company Domain` for tech stack and funding, `domain` for traffic.
- **Measured cost on clay.com** (balance delta, waited for balance to settle):

  | Function | Data credits / row | Actions / row | Latency |
  |---|---|---|---|
  | Website Technology Stack | 1 | 1 | 2.4 s |
  | Website Traffic | 2 | 1 | 8.5 s |
  | Company Latest Funding | 7 | 2 | 2.2 s |

  20 rows × 3 functions ≈ 200 credits and 80 actions, inside the 250 / 150 budgets with clay.com already cached.
- **Output shapes differ from what the brief assumed.** Tech stack returns one field, `Website Tech Stack`, a comma-separated string of BuiltWith-style names (~200 names for clay.com, including clearly historical ones like `html5shiv` and `pair Networks`). Traffic returns `siteTraffic` (number) and `siteTrafficDataProvider` (`Semrush`). Funding returns a single string field, `Latest Funding`, which was `"0"` for clay.com. There is no stage or date field, so the brief's stage-enum, date and stage/amount plausibility checks can't apply. The funding suite checks what the function actually returns: presence, that the value parses as a money amount, and that it's positive.
- **The smoke test ran from a throwaway script** before the client existed. Its three results were imported into the cache and the spend ledger, so the live benchmark reuses them instead of paying again.

## Core library (M2)

- **One Clay row per run by default (`--chunk-size 1`).** Clay doesn't report cost per run, so Glaze measures it from balance deltas. Running rows one at a time makes per-row credits, actions and latency exact rather than averaged. It costs only wall time (about 10 minutes for 60 rows). Larger chunks still work: cost is split evenly and latency is kept as an unattributed distribution built from the `finished` counter.
- **Waiting for the balance to settle.** After a run completes, Glaze re-reads `/credits/balance` every 3 s until two reads agree, so a charge that posts a moment late isn't missed. This assumes nothing else in the workspace spends at the same time; that limitation is in the README.
- **No 5xx retries on `POST /run`.** 429s are retried everywhere, honoring `Retry-After` plus jitter, because Clay rejected the request and nothing ran. 5xx and network errors are retried only on GETs: a POST that may have started a run would charge twice if retried.
- **Unknown terminal item statuses are kept as `unknown`** and count as failures, per the errors doc ("do not assume the set of statuses is closed").
- **Two replay sources.** `.glaze/cache/` (local, content-addressed by routine + input hash) and the rows inside committed `data/runs/*.json`. The second is what makes `npx glaze run` work on a fresh clone with no `.env`. Live mode reuses both unless `--fresh` is passed, so nothing is ever paid for twice.
- **Replay runs go to `.glaze/runs/` (gitignored), live runs to `data/runs/`.** Re-scoring recorded outputs shouldn't create committed files; only runs that actually called Clay are part of the record. Baselines can only point at committed runs.
- **Coverage = completed rows whose `required` fields are non-empty, over all rows.** "Did Clay return something?" is kept separate from "is it any good?", which assertions, ground truth and the judge answer.
- **Failed Clay rows are left out of precision/recall.** Coverage already penalizes them. Folding them into recall would count the same miss twice.
- **Spearman sign convention.** ρ is computed between Clay traffic and *negated* Tranco rank, so +1 means the same order and the number reads like an accuracy score.
- **The diff uses the branch's suite thresholds.** A threshold change shows up in the same PR as the effect it hides. A check added in a PR that fails on recorded rows counts as a regression ("new check fails"), which is how the demo PR gets caught.
- **Budgets default to 0.** A machine without `CLAY_CREDIT_BUDGET` / `CLAY_ACTION_BUDGET` can't spend even with `--live`.
- **Tranco: ID-pinned CSV instead of the rolling zip.** Glaze resolves the current list ID (`/top-1m-id`), reads its metadata, and downloads that exact list's CSV. The snapshot is reproducible by ID, it saves a zip dependency, and it avoids a race where the zip rolls over to a newer list than the ID recorded. The brief asked for the zip; this gives the same data with provenance.

## Ground truth + live benchmark (M3)

- **Ground truth renders pages in headless Chromium.** The first, static-HTML truth showed Clay at 22% precision, but most of those "false positives" were tags injected at runtime by GTM, which static HTML can't see. Rendering each homepage and matching every network request moved precision to 40% and made 3 more sites verifiable. Static mode is still available (`glaze truth refresh --static`). The browser comes from Playwright's official download.
- **Unverifiable rules.** HTTP ≥ 400, a known bot-challenge page, under 1.5 KB of HTML, or a rendered page with fewer than 10 network requests. Reddit's proof-of-work interstitial hits that last rule: Chromium solves it, but the real page never loads within the window. Reddit is left out of precision/recall instead of being scored on a challenge page.
- **`glaze rescore <run-id>` exists because the truth improved after the tech-stack run.** It re-applies current checks and truth to recorded outputs in place: same run id and spend, `rescoredAt` set, no Clay calls. The tech-stack baseline was rescored once, against the rendered truth.
- **Targets weren't changed after seeing results.** The coverage/accuracy targets in `suites/*.yaml` were committed in M2, before any live run (see git history). Tech stack shows red because its precision (40%) is under its 0.7 target. That's reported as is.
- **What precision means here.** It's the share of Clay's claims, within the 20 detectable technologies, that Glaze could confirm on the live homepage. BuiltWith-style data is domain-wide and historical (Stripe.js is reported on 17/19 sites, likely from checkout or app subdomains), so this is a lower bound on correctness, not a measure of it. Recall (99%) is the stronger claim: Clay listed every detectable technology Glaze saw except one (Meta Pixel on clay.com).
- **Funding cost isn't flat.** The smoke test measured 7 credits on clay.com, but per-row cost ranged from 3 to 26 credits. The three most expensive rows (intercom 22, bill.com 26, hubspot 26) returned `0.25`, `2.1` and `5`, values with no unit. The baseline suite doesn't catch them; the demo PR adds a plausibility check that does.
- **Budget result:** 210 / 250 data credits and 68 / 150 actions spent in total (smoke test included). Clay's balance went from 19,914.5 / 482 to 19,704.5 / 414, which matches the ledger exactly. The ledger is committed as `data/spend.json`.

# Morning report: Glaze overnight build (Oct 7, 2026)

**Nothing is faked.** Every Clay number in the repo and on the dashboard comes from live Public API runs made tonight. No sample/synthetic data exists anywhere.

## Links

- Repo: https://github.com/zaki-m-khan/glaze
- Dashboard (Vercel production): https://glaze-xi.vercel.app
- Demo PR with the bot catching a regression: https://github.com/zaki-m-khan/glaze/pull/1 (left open)

## Credits

| | Data credits | Actions |
|---|---|---|
| Start balance (Oct 7, before the smoke test) | 19,914.5 | 482 |
| End balance | 19,704.5 | 414 |
| **Spent** | **210** (budget 250) | **68** (budget 150) |

The ledger (`data/spend.json`) matches the balance API exactly. Breakdown: smoke tests 10 credits / 4 actions; tech stack 19 / 19; traffic 38 / 19; funding 143 / 26.

## Milestones

| | Status | Notes |
|---|---|---|
| M0 setup | ✅ | Next 16, TS strict, vitest, eslint; public repo; `.gitignore` in the first commit |
| M1 smoke test | ✅ | `function:` + `t_…` works for Clay-managed functions; input keys are display names (`Company Domain`, `domain`); responses in `data/smoke/` |
| M2 core + CLI + tests | ✅ | 96 tests: client polling/pagination/retries, budgets, assertions, Spearman, P/R, diff, judge, compare |
| M3 truth + live benchmark | ✅ | 3 functions × 20 companies live, baselines set; truth in `data/truth/` with source + timestamps |
| M4 dashboard + deploy | ✅ | Mobile-first, light/dark, checked at 390 px with Playwright (no horizontal overflow) |
| M5 CI + demo PR | ✅ | CI green on `main`; PR #1 has the sticky Glaze comment with 5 regressions |
| M6 compare | ⚠️ partial | Implemented and unit-tested; **no live demo** because `CLAY_FN_A`/`CLAY_FN_B` and `ANTHROPIC_API_KEY` weren't set. `/compare` shows an honest empty state |
| M7 polish | ✅ | README (real table, screenshots, mermaid), RESUME, DEMO, DECISIONS, this file |

## Headline results

- **Tech stack:** precision 40% (90/226) and recall 99% (90/91) against rendered-page detection on 19 sites. Status is **red** against the 0.7 target, which was set before any live run and not changed afterwards. Reddit was excluded as unverifiable (bot interstitial).
- **Traffic:** Spearman ρ **0.92** vs Tranco list 26Y29 (n=19; gonimbly.com unranked). Green.
- **Funding:** 95% of checks pass. clay.com and vanta.com return `"0"`. The 3 costliest rows (22–26 credits) return unit-less `0.25`, `2.1`, `5`, and the demo PR's new check catches them. Green on the baseline suite.

## Skipped, changed or worth knowing

- **LLM judge never ran:** no `ANTHROPIC_API_KEY`. Reports say "judge off", and no judge scores appear anywhere.
- **The ground-truth method changed mid-build.** Static HTML gave 22% precision, mostly because tags injected by GTM at runtime were invisible to it. I switched to rendering in headless Chromium, which gave 40%, and re-scored the recorded tech-stack run (`glaze rescore`) without spending credits. The run record carries `rescoredAt`.
- **Funding suite shape:** the function returns one string field (`Latest Funding`), with no stage or date, so the brief's stage-enum and date checks couldn't apply. See DECISIONS.md.
- **Tranco:** downloaded the ID-pinned CSV instead of the rolling zip, for reproducibility.
- **Vercel:** the global CLI (v35) was too old, so deploys used `npx vercel@latest` and the global install wasn't touched. `vercel link` connected the GitHub repo, so pushes to `main` now auto-deploy and PRs get preview comments. It also wrote a `VERCEL_OIDC_TOKEN` into `.env.local`, which is gitignored and covered by the secret scan.
- **CI hiccup, fixed:** `bin/glaze.mjs` lacked the executable bit (committed from Windows), so one CI run failed. Workflows now call `npm run glaze --`, because an unrelated public npm package is also named `glaze`.
- **Secret scan:** clean on the working tree and all history at the final push.

## Top 3 to do before Sculpt

1. **Turn on the judge (free in Clay credits).** Add `ANTHROPIC_API_KEY` to `.env.local`, then run `npx glaze rescore 20261007T073213Z-funding` and redeploy. Funding rows get Claude Haiku judge scores without re-running Clay.
2. **Run the compare demo, if you want it.** Make two versions of a one-liner custom function, enable API access, and run `npx glaze compare suites/one-liner.yaml --a function:t_… --b function:t_… --live --limit 4`. Only ~40 credits are left in tonight's budget; raise `CLAY_CREDIT_BUDGET` for all 20 rows (roughly 5 credits × 2 × 20).
3. **Rehearse on your phone** with DEMO.md, especially the "40% precision" answer. The red chip on Clay's tech stack is honest but will draw the question.

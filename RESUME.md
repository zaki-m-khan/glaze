# Resume entry

**Glaze** | TypeScript, Next.js, Clay API, Claude | [Demo](https://glaze-xi.vercel.app) — Oct. 2026

- Built Glaze, a CI and benchmarking tool for Clay functions that runs them via Clay's API, scores outputs against independent ground truth, and **comments regressions on GitHub PRs**
- Benchmarked 3 Clay functions on 20 companies for 210 credits: **99% tech-stack recall** against **Playwright**-rendered truth; flagged the 3 costliest funding rows returning unit-less values

## 3-line version

```
Glaze | TypeScript, Next.js, Clay API, Claude | Demo                                    Oct. 2026
• Built Glaze, a CI and benchmarking tool for Clay functions that runs them via Clay's API, scores outputs against independent ground truth, and comments regressions on GitHub PRs
• Benchmarked 3 Clay functions on 20 companies for 210 credits: 99% tech-stack recall against Playwright-rendered truth; flagged the 3 costliest funding rows returning unit-less values
```

## Where each number comes from

| Claim | Source |
|---|---|
| 3 functions, 20 companies | `suites/*.yaml`, `data/runs/` (baseline runs, Oct 7 2026) |
| 210 credits | `data/spend.json`; matches Clay's balance (19,914.5 → 19,704.5) |
| 99% recall | `data/runs/20261007T070958Z-tech-stack.json` → `metrics.truth.overall.recall` = 90/91 |
| 3 costliest funding rows, unit-less | intercom.com (22 credits, `0.25`), bill.com (26, `2.1`), hubspot.com (26, `5`) in `data/runs/20261007T073213Z-funding.json` |

Other numbers you can safely use: traffic Spearman ρ = 0.92 vs Tranco (n=19); funding credits per row ranged 3–26. "Claude" in the heading refers to the LLM-judge integration (Claude Haiku 4.5). It is implemented and tested but wasn't run live, because no Anthropic key was configured. Don't claim judge scores.

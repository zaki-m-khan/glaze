# 60-second demo (phone)

Open https://glaze-xi.vercel.app before you start. Have the PR (https://github.com/zaki-m-khan/glaze/pull/1) open in a second tab.

**0:00, the problem.** "Teams wire Clay functions into tables and agents, and nobody tests them. When a provider's coverage drops or a waterfall returns junk, you find out weeks later from bounced emails and a credit bill."

**0:10, what Glaze is.** "Glaze is CI for Clay functions. I benchmarked three of your own functions on the 20 companies speaking at Sculpt today, through the Public API, and scored every output against data Clay didn't produce."

**0:20, the cards.** Scroll the home page.
- "Traffic agrees with the public Tranco ranking at ρ 0.92. Strong."
- "Tech stack has 99% recall: it found nearly everything I detected by rendering each homepage in Chromium. But only 40% of what it reports shows up on the live site. Stripe on 17 of 19 companies. It's domain-wide history, so use it for 'has used X', not 'runs X today'."
- "Funding has no free ground truth, so I only run sanity checks and never call a value correct."

**0:35, cost.** Tap the funding card and point at the dot strip. "Every row runs alone, so every credit is attributed to a company. Median 4 credits, but some rows cost 26. Now look what those rows returned." Tap Intercom: "22 credits for `0.25`."

**0:45, the bot.** Switch to the PR tab. "So I opened a PR that adds one check: a funding round should be at least $10K. CI replays the recorded outputs, so it spends no credits, diffs against the baseline, and the bot comments: five rows now fail, each one with its credit cost. That's the check you want in front of every prompt edit."

**0:55, close.** "The whole benchmark cost 210 credits, metered from your balance API, and CI runs for free after that. Code's on GitHub."

---

## Likely questions from a Clay engineer

**"Why not just use Clay's own run history?"**
Run history tells you what happened. It doesn't tell you whether the output was right, and it has no notion of a baseline or a PR. Glaze adds the parts history lacks: a fixed test set, independent ground truth, and a diff that blocks a change. It also works across workspaces and in CI without anyone opening the app. If Clay exposed per-run cost and history through the API, Glaze would read those instead of measuring balance deltas.

**"How do you handle provider nondeterminism?"**
Two ways. CI never calls Clay: it replays recorded outputs, so a PR check is deterministic, and it only fails when *your change* (a suite, a check, scoring code) changes the result. Live re-runs are separate, scheduled benchmark runs. When a live run differs from the baseline, that difference is the signal you want, and the thresholds (`coverageDrop`, `accuracyDrop`, `costIncrease`) decide what counts as a regression rather than noise. I'd add repeated live runs per row to estimate variance before trusting a threshold.

**"What does a run cost?"**
Measured, not estimated. Tech stack was 1 credit and 1 action per row. Traffic was 2 and 1. Funding averaged 7.5 credits and 1.4 actions but ranged 3–26, because the waterfall keeps trying providers. The whole 3 × 20 benchmark plus smoke tests cost 210 credits and 68 actions, and the ledger matches the balance API exactly. Re-scoring and CI cost nothing. Live runs need `--live` and stop before crossing hard budgets on both meters.

**"Isn't 40% precision unfair? BuiltWith sees more than the homepage."**
Yes, and the dashboard says so: precision is a lower bound, because Glaze only sees one homepage as a first-time visitor. That's why recall is the headline claim: Clay listed 90 of the 91 technologies I could verify. The useful product finding is that this function answers "has this company ever used X", and a team using it to route "currently runs Segment" leads should know that.

**"How would this work for a custom Claygent function?"**
Same suite format, with an LLM judge for free text. `glaze compare` runs two versions of a function on the same rows and scores them head to head, with credits per row for each, so a prompt edit becomes a PR with evidence. It's implemented and unit-tested. I didn't run it live tonight because I didn't have two function versions or a judge key configured, so I'm not showing numbers for it.

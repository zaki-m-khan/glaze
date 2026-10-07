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

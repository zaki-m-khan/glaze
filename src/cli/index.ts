import { existsSync, writeFileSync } from "node:fs";
import { Command, InvalidArgumentError } from "commander";
import { SpendLedger } from "../lib/budget";
import { CallCache, Recordings } from "../lib/cache";
import { ClayClient } from "../lib/clay";
import { COMPARE_DIR, compareRuns, writeCompare } from "../lib/compare";
import { diffRuns, type SuiteDiff } from "../lib/diff";
import { loadEnv, readAnthropicApiKey, readBudgets, readClayApiKey } from "../lib/env";
import { GlazeError } from "../lib/errors";
import { Judge, anthropicCompleter } from "../lib/judge";
import {
  LOCAL_RUNS_DIR,
  RUNS_DIR,
  findRun,
  latestRun,
  listRuns,
  readBaselines,
  writeBaselines,
  writeRun,
  type RunRecord,
} from "../lib/record";
import { markdownDiff, terminalCompare, terminalDiff, terminalRun } from "../lib/report";
import { rescoreRun, runSuite, type RunOptions } from "../lib/runner";
import { loadCompanies, loadSuite, suiteSchema } from "../lib/suite";
import { refreshHtmlTruth, refreshTranco } from "../lib/truth/refresh";

const COMPARE_RUNS_DIR = `${COMPARE_DIR}/runs`;
const GOLDEN = "suites/golden-companies.yaml";

const log = (line: string) => console.error(line);

function positiveInt(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new InvalidArgumentError("must be a positive integer");
  return n;
}

function suitePath(nameOrPath: string): string {
  if (existsSync(nameOrPath)) return nameOrPath;
  const guess = `suites/${nameOrPath}.yaml`;
  if (existsSync(guess)) return guess;
  throw new GlazeError(`No suite at ${nameOrPath} or ${guess}`);
}

function makeJudge(): { judge?: Judge; judgeNote?: string } {
  const key = readAnthropicApiKey();
  return key ? { judge: new Judge(anthropicCompleter(key)) } : { judgeNote: "ANTHROPIC_API_KEY not set; LLM judge skipped" };
}

function baseOptions(live: boolean): RunOptions {
  return {
    cache: new CallCache(),
    recordings: new Recordings(listRuns([RUNS_DIR, COMPARE_RUNS_DIR])),
    ...makeJudge(),
    log,
    ...(live ? { live: { clay: new ClayClient({ apiKey: readClayApiKey() }), ledger: new SpendLedger(readBudgets()) } } : {}),
  };
}

function printLedger(options: RunOptions): void {
  if (!options.live) return;
  const { spent, remaining } = options.live.ledger;
  log(`ledger: spent ${spent.credits} credits / ${spent.actions} actions; ${remaining.credits} / ${remaining.actions} left in budget`);
}

/** Thresholds come from the suite file on the current branch, so changing them shows up in the same PR diff. */
function thresholdsFor(run: RunRecord) {
  const defaults = suiteSchema.shape.regressions.parse(undefined);
  return existsSync(run.suiteFile) ? loadSuite(run.suiteFile).regressions : defaults;
}

const program = new Command()
  .name("glaze")
  .description("CI and benchmarking for Clay functions. Replay mode by default; --live spends Clay credits.")
  .showHelpAfterError();

program
  .command("run")
  .description("Run a suite, score it, and write a run record")
  .argument("<suite>", "suite file or name, e.g. suites/tech-stack.yaml or tech-stack")
  .option("--live", "call Clay for rows with no recording (spends credits, within budget)")
  .option("--fresh", "with --live: ignore recordings and pay for every row again")
  .option("--limit <n>", "only the first n rows", positiveInt)
  .option("--chunk-size <n>", "rows per Clay run; 1 gives exact per-row cost and latency", positiveInt, 1)
  .option("--json", "print the run record as JSON instead of a table")
  .action(async (file: string, opts: { live?: boolean; fresh?: boolean; limit?: number; chunkSize: number; json?: boolean }) => {
    const suite = loadSuite(suitePath(file));
    const options = { ...baseOptions(Boolean(opts.live)), limit: opts.limit, fresh: opts.fresh, chunkSize: opts.chunkSize };
    const run = await runSuite(suite, options);
    const out = writeRun(run, run.mode === "live" ? RUNS_DIR : LOCAL_RUNS_DIR);
    console.log(opts.json ? JSON.stringify(run, null, 2) : terminalRun(run));
    log(`\nwrote ${out}`);
    printLedger(options);
  });

program
  .command("baseline")
  .description("Mark a run as the baseline for its suite")
  .argument("<run-id>")
  .action((id: string) => {
    const run = findRun(id, [RUNS_DIR]);
    if (!run) throw new GlazeError(`No committed run ${id} in ${RUNS_DIR} (replay runs in ${LOCAL_RUNS_DIR} can't be baselines)`);
    writeBaselines({ ...readBaselines(), [run.suite]: run.id });
    console.log(`baseline for ${run.suite} is now ${run.id}`);
  });

program
  .command("rescore")
  .description("Re-apply the suite's current checks and ground truth to a committed run (no Clay calls)")
  .argument("<run-id>")
  .action(async (id: string) => {
    const run = findRun(id, [RUNS_DIR]);
    if (!run) throw new GlazeError(`No committed run ${id} in ${RUNS_DIR}`);
    const rescored = await rescoreRun(run, loadSuite(run.suiteFile), { log, ...makeJudge() });
    console.log(terminalRun(rescored));
    log(`\nrewrote ${writeRun(rescored, RUNS_DIR)}`);
  });

program
  .command("diff")
  .description("Diff each suite's latest run against its baseline")
  .option("--suite <name>", "only this suite")
  .option("--replay", "re-score each suite from recordings first (what CI does)")
  .option("--fail-on <what>", "exit 1 when there are regressions", (v) => {
    if (v !== "regressions") throw new InvalidArgumentError('only "regressions" is supported');
    return v;
  })
  .option("--format <format>", "text | markdown | json", "text")
  .option("--out <file>", "also write the report to a file")
  .action(async (opts: { suite?: string; replay?: boolean; failOn?: string; format: string; out?: string }) => {
    const baselines = readBaselines();
    const suites = opts.suite ? [opts.suite] : Object.keys(baselines);
    if (suites.length === 0) throw new GlazeError("No baselines yet. Run `glaze baseline <run-id>` first.");
    const diffs: SuiteDiff[] = [];
    const runs = new Map<string, RunRecord>();
    for (const name of suites) {
      const baselineId = baselines[name];
      const baseline = baselineId ? findRun(baselineId) : undefined;
      if (!baseline) throw new GlazeError(`Suite ${name} has no baseline run (looked for ${baselineId ?? "none"})`);
      let current = latestRun(name) ?? baseline;
      if (opts.replay) {
        current = await runSuite(loadSuite(baseline.suiteFile), baseOptions(false));
        writeRun(current, LOCAL_RUNS_DIR);
      }
      runs.set(current.id, current);
      diffs.push(diffRuns(baseline, current, thresholdsFor(current)));
    }
    const text = opts.format === "markdown" ? markdownDiff(diffs, runs) : opts.format === "json" ? JSON.stringify(diffs, null, 2) : terminalDiff(diffs);
    console.log(text);
    if (opts.out) writeFileSync(opts.out, `${text}\n`);
    if (opts.failOn && diffs.some((d) => d.regressions.length > 0)) process.exitCode = 1;
  });

program
  .command("compare")
  .description("Run two versions of a function on a suite's rows and score them head to head")
  .argument("<suite>")
  .requiredOption("--a <routine>", "routine id of version A, e.g. function:t_...")
  .requiredOption("--b <routine>", "routine id of version B")
  .option("--live", "call Clay for rows with no recording")
  .option("--limit <n>", "only the first n rows", positiveInt)
  .action(async (file: string, opts: { a: string; b: string; live?: boolean; limit?: number }) => {
    const suite = loadSuite(suitePath(file));
    const options = { ...baseOptions(Boolean(opts.live)), limit: opts.limit };
    const runA = await runSuite(suite, { ...options, routineId: opts.a });
    const runB = await runSuite(suite, { ...options, routineId: opts.b });
    const record = compareRuns(runA, runB, suite.judge[0]?.field);
    if (runA.mode === "live" || runB.mode === "live") {
      writeRun(runA, COMPARE_RUNS_DIR);
      writeRun(runB, COMPARE_RUNS_DIR);
      log(`wrote ${writeCompare(record)}`);
    }
    console.log(terminalCompare(record));
    printLedger(options);
  });

program
  .command("report")
  .description("Print a run (default: the latest run of every suite)")
  .argument("[run-id]")
  .option("--json", "print JSON")
  .action((id: string | undefined, opts: { json?: boolean }) => {
    const all = listRuns([RUNS_DIR, LOCAL_RUNS_DIR]);
    const runs = id ? all.filter((r) => r.id === id) : [...new Set(all.map((r) => r.suite))].map((s) => all.filter((r) => r.suite === s).at(-1)!);
    if (runs.length === 0) throw new GlazeError(id ? `No run ${id}` : "No runs yet");
    console.log(opts.json ? JSON.stringify(runs, null, 2) : runs.map(terminalRun).join("\n\n"));
  });

program
  .command("truth")
  .description("Ground truth that Clay didn't produce")
  .command("refresh")
  .description("Rebuild HTML-signature and Tranco snapshots for the golden companies (free, no Clay credits)")
  .option("--companies <file>", "company list", GOLDEN)
  .option("--static", "fetch raw HTML instead of rendering in Chromium (faster, misses runtime-injected tags)")
  .action(async (opts: { companies: string; static?: boolean }) => {
    const domains = loadCompanies(opts.companies).map((c) => c.domain);
    log(`HTML signatures for ${domains.length} domains (${opts.static ? "static" : "rendered"})`);
    const html = await refreshHtmlTruth(domains, log, opts.static ? "static" : "rendered");
    log("Tranco ranks");
    const tranco = await refreshTranco(domains);
    const ranked = tranco.entries.filter((e) => e.rank !== null).length;
    console.log(`html-signatures: ${html.entries.filter((e) => e.verdict === "verified").length}/${domains.length} verifiable`);
    console.log(`tranco ${tranco.listId}: ${ranked}/${domains.length} in the top 1M`);
  });

loadEnv();
program.parseAsync().catch((error: unknown) => {
  if (error instanceof GlazeError) {
    console.error(`glaze: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  throw error;
});

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { suiteSchema, type Suite } from "@/lib/suite";
import type { RowRecord, RunRecord } from "@/lib/record";
import { computeMetrics } from "@/lib/score";

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "glaze-test-"));
}

export function makeSuite(overrides: Partial<Suite> = {}): Suite {
  const spec = suiteSchema.parse({
    name: "demo",
    title: "Demo Function",
    function: { name: "Demo", routineId: "function:t_demo" },
    rows: "companies.yaml",
    inputs: { "Company Domain": "$domain" },
    estimate: { creditsPerRow: 2, actionsPerRow: 1 },
    checks: [
      { type: "required", field: "amount" },
      { type: "range", field: "amount", parse: "money", min: 0, exclusiveMin: true, name: "positive" },
    ],
    targets: { coverage: 0.9, accuracy: 0.8 },
  });
  return {
    ...spec,
    file: "suites/demo.yaml",
    rowList: ["a.com", "b.com", "c.com"].map((domain) => ({
      id: domain.split(".")[0]!,
      label: domain.toUpperCase(),
      domain,
      inputs: { "Company Domain": domain },
    })),
    ...overrides,
  };
}

export function row(id: string, result: Record<string, unknown> | undefined, extra: Partial<RowRecord> = {}): RowRecord {
  return {
    id,
    label: id,
    domain: `${id}.com`,
    inputs: { "Company Domain": `${id}.com` },
    inputHash: `h-${id}`,
    source: "recording",
    status: result ? "complete" : "failed",
    ...(result ? { result } : { error: "Provider request failed" }),
    checks: [],
    judge: [],
    recordedAt: "2026-10-07T00:00:00.000Z",
    credits: 2,
    actions: 1,
    latencyMs: 1000,
    ...extra,
  };
}

export function makeRun(id: string, rows: RowRecord[], suite: Suite = makeSuite()): RunRecord {
  return {
    version: 1,
    id,
    suite: suite.name,
    suiteTitle: suite.title,
    suiteFile: suite.file,
    function: suite.function,
    mode: "replay",
    sample: false,
    startedAt: "2026-10-07T00:00:00.000Z",
    finishedAt: "2026-10-07T00:00:01.000Z",
    spend: { credits: 0, actions: 0 },
    judge: { enabled: false, note: "test" },
    rows,
    metrics: computeMetrics(suite, rows, undefined),
  };
}

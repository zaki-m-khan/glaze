import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inputHash } from "./hash";
import type { RunRecord } from "./record";

/** One recorded Clay call for one row: everything needed to replay it without spending. */
export interface CachedCall {
  routineId: string;
  inputs: Record<string, string>;
  inputHash: string;
  status: "complete" | "failed";
  result?: Record<string, unknown>;
  error?: string;
  latencyMs?: number;
  credits?: number;
  actions?: number;
  clayRunId?: string;
  recordedAt: string;
}

export const CACHE_DIR = ".glaze/cache/calls";

/** Content-addressed on disk: `<routine>/<hash of routine + inputs>.json`. */
export class CallCache {
  constructor(private readonly dir = CACHE_DIR) {}

  private path(routineId: string, hash: string): string {
    return join(this.dir, routineId.replace(/[^A-Za-z0-9_-]/g, "_"), `${hash}.json`);
  }

  get(routineId: string, inputs: Record<string, string>): CachedCall | undefined {
    const file = this.path(routineId, inputHash(routineId, inputs));
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as CachedCall) : undefined;
  }

  put(call: CachedCall): void {
    const file = this.path(call.routineId, call.inputHash);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, `${JSON.stringify(call, null, 2)}\n`);
  }
}

/**
 * Calls recorded in committed run files. This is what makes replay work on a fresh clone:
 * `.glaze/cache` is local, but `data/runs` is in git.
 */
export class Recordings {
  private readonly calls = new Map<string, CachedCall>();

  constructor(runs: readonly RunRecord[]) {
    for (const run of runs) {
      for (const row of run.rows) {
        if (row.status === "missing" || !row.recordedAt) continue;
        const key = `${run.function.routineId}\n${row.inputHash}`;
        const existing = this.calls.get(key);
        if (existing && existing.recordedAt >= row.recordedAt) continue;
        this.calls.set(key, {
          routineId: run.function.routineId,
          inputs: row.inputs,
          inputHash: row.inputHash,
          status: row.status,
          result: row.result,
          error: row.error,
          latencyMs: row.latencyMs,
          credits: row.credits,
          actions: row.actions,
          clayRunId: row.clayRunId,
          recordedAt: row.recordedAt,
        });
      }
    }
  }

  get(routineId: string, inputs: Record<string, string>): CachedCall | undefined {
    return this.calls.get(`${routineId}\n${inputHash(routineId, inputs)}`);
  }
}

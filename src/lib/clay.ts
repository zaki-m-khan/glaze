import {
  ClayApiError,
  ClayAuthError,
  ClayNotFoundError,
  ClayRateLimitError,
  RunTimeoutError,
} from "./errors";

export const CLAY_API_BASE = "https://api.clay.com/public/v0";

export interface RunItemInput {
  id: string;
  inputs: Record<string, unknown>;
}

export type RunItemResult =
  | { id: string; status: "complete"; result: Record<string, unknown> }
  | { id: string; status: "failed"; error: string }
  /** Clay's docs say terminal statuses are an open set; keep unknown ones instead of guessing. */
  | { id: string; status: "unknown"; rawStatus: string };

export interface Balance {
  credits: number;
  /** Absent on legacy billing plans. */
  actions?: number;
}

export interface CompletedRun {
  routineRunId: string;
  items: RunItemResult[];
  /** ms from submit until the `finished` counter reached 1, 2, ... n. Rows aren't identified, so this is a distribution. */
  completionTimesMs: number[];
  wallTimeMs: number;
}

export interface ClayClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  /** Retries for 429s (all requests) and 5xx/network errors (GET only). */
  maxRetries?: number;
}

export interface WaitOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  onProgress?: (finished: number, total: number) => void;
}

const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;

/**
 * Client for the Clay Public API routines + credits endpoints.
 *
 * Retry policy: 429s are retried on every request (Clay rejected it, so nothing ran),
 * honoring Retry-After. 5xx and network errors are retried only on GETs: retrying a
 * POST /run that may have started would run the function twice and pay twice.
 */
export class ClayClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly maxRetries: number;

  constructor(options: ClayClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? CLAY_API_BASE;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.maxRetries = options.maxRetries ?? 6;
  }

  async balance(): Promise<Balance> {
    const { body } = await this.request("GET", "/credits/balance");
    const record = asRecord(body);
    const credits = record.balance;
    if (typeof credits !== "number") throw new ClayApiError(200, "balance missing from response", "/credits/balance");
    const actions = record.action_execution_balance;
    return typeof actions === "number" ? { credits, actions } : { credits };
  }

  async startRun(routineId: string, items: RunItemInput[]): Promise<string> {
    if (items.length < 1 || items.length > 100) throw new RangeError("A routine run takes 1-100 items");
    const path = `/routines/${encodeURIComponent(routineId)}/run`;
    const { body } = await this.request("POST", path, { items });
    const runId = asRecord(body).routine_run_id;
    if (typeof runId !== "string") throw new ClayApiError(202, "routine_run_id missing from response", path);
    return runId;
  }

  /** One poll. Returns null while the run is in progress, else every result page concatenated. */
  async fetchResults(
    routineRunId: string,
    onProgress?: (finished: number, total: number) => void,
  ): Promise<RunItemResult[] | null> {
    const items: RunItemResult[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ limit: "100" });
      if (cursor) query.set("cursor", cursor);
      const path = `/routines/run/${encodeURIComponent(routineRunId)}/results?${query.toString()}`;
      const { status, body } = await this.request("GET", path);
      const page = asRecord(body);
      if (typeof page.finished === "number" && typeof page.total === "number") onProgress?.(page.finished, page.total);
      if (status === 202) {
        if (cursor) throw new ClayApiError(202, "run went back to in_progress mid-pagination", path);
        return null;
      }
      const data = page.data;
      if (!Array.isArray(data)) throw new ClayApiError(status, "results page has no data array", path);
      items.push(...data.map(parseItem));
      cursor = typeof page.cursor === "string" && page.cursor !== "" ? page.cursor : undefined;
    } while (cursor);
    return items;
  }

  /** Starts a run and polls until it is terminal. */
  async run(routineId: string, items: RunItemInput[], options: WaitOptions = {}): Promise<CompletedRun> {
    const pollIntervalMs = options.pollIntervalMs ?? 1000;
    const timeoutMs = options.timeoutMs ?? 10 * 60_000;
    const startedAt = this.now();
    const routineRunId = await this.startRun(routineId, items);
    const completionTimesMs: number[] = [];

    const track = (finished: number, total: number) => {
      const elapsed = this.now() - startedAt;
      while (completionTimesMs.length < Math.min(finished, total)) completionTimesMs.push(elapsed);
      options.onProgress?.(finished, total);
    };

    for (;;) {
      await this.sleep(pollIntervalMs);
      const results = await this.fetchResults(routineRunId, track);
      if (results) {
        const wallTimeMs = this.now() - startedAt;
        while (completionTimesMs.length < results.length) completionTimesMs.push(wallTimeMs);
        return { routineRunId, items: results, completionTimesMs, wallTimeMs };
      }
      if (this.now() - startedAt > timeoutMs) throw new RunTimeoutError(routineRunId, timeoutMs);
    }
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: unknown }> {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: { "clay-api-key": this.apiKey, accept: "application/json", "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (error) {
        if (method === "GET" && attempt < this.maxRetries) {
          await this.sleep(this.backoff(attempt));
          continue;
        }
        throw error;
      }

      const parsed = await readJson(response);
      if (response.ok) return { status: response.status, body: parsed };

      const message = typeof asRecord(parsed).message === "string" ? String(asRecord(parsed).message) : response.statusText;
      if (response.status === 429) {
        const waitMs = retryAfterMs(response.headers.get("retry-after")) ?? this.backoff(attempt);
        if (attempt < this.maxRetries) {
          await this.sleep(waitMs + this.random() * 250);
          continue;
        }
        throw new ClayRateLimitError(path, message, waitMs);
      }
      if (response.status >= 500 && method === "GET" && attempt < this.maxRetries) {
        await this.sleep(this.backoff(attempt));
        continue;
      }
      if (response.status === 401 || response.status === 403) throw new ClayAuthError(response.status, message, path);
      if (response.status === 404) throw new ClayNotFoundError(404, message, path);
      throw new ClayApiError(response.status, message, path);
    }
  }

  /** Exponential backoff with full jitter. */
  private backoff(attempt: number): number {
    const cap = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
    return Math.round(cap / 2 + (this.random() * cap) / 2);
  }
}

function parseItem(raw: unknown): RunItemResult {
  const item = asRecord(raw);
  const id = String(item.id);
  if (item.status === "complete") return { id, status: "complete", result: asRecord(item.result) };
  if (item.status === "failed") {
    const message = asRecord(item.error).message;
    return { id, status: "failed", error: typeof message === "string" ? message : "unknown error" };
  }
  return { id, status: "unknown", rawStatus: String(item.status) };
}

export function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 200) };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

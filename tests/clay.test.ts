import { describe, expect, it, vi } from "vitest";
import { ClayClient, retryAfterMs } from "@/lib/clay";
import { ClayApiError, ClayAuthError, ClayNotFoundError, ClayRateLimitError, RunTimeoutError } from "@/lib/errors";

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | Error;

/** A fetch double that serves scripted replies in order and records every request. */
function scripted(replies: Reply[]) {
  const calls: { url: string; method: string; body?: string; headers: Record<string, string> }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body as string | undefined, headers: init?.headers as Record<string, string> });
    const reply = replies.shift();
    if (!reply) throw new Error(`unexpected request ${String(url)}`);
    if (reply instanceof Error) throw reply;
    return new Response(reply.body === undefined ? "" : JSON.stringify(reply.body), { status: reply.status, headers: reply.headers });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

function client(replies: Reply[], extra: Partial<ConstructorParameters<typeof ClayClient>[0]> = {}) {
  const { fetch, calls } = scripted(replies);
  const sleeps: number[] = [];
  let clock = 0;
  const c = new ClayClient({
    apiKey: "test-key",
    baseUrl: "https://clay.test/v0",
    fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
    random: () => 0.5,
    ...extra,
  });
  return { c, calls, sleeps };
}

const inProgress = (finished: number, total = 3) => ({ status: 202, body: { routine_run_id: "run_1", status: "in_progress", total, finished } });

describe("ClayClient.balance", () => {
  it("reads both meters and sends the API key header", async () => {
    const { c, calls } = client([{ status: 200, body: { balance: 100.5, action_execution_balance: 40 } }]);
    expect(await c.balance()).toEqual({ credits: 100.5, actions: 40 });
    expect(calls[0]!.url).toBe("https://clay.test/v0/credits/balance");
    expect(calls[0]!.headers["clay-api-key"]).toBe("test-key");
  });
  it("omits actions on legacy plans", async () => {
    const { c } = client([{ status: 200, body: { balance: 7 } }]);
    expect(await c.balance()).toEqual({ credits: 7 });
  });
});

describe("ClayClient.run", () => {
  it("starts a run, polls through 202s, and paginates the results", async () => {
    const { c, calls } = client([
      { status: 202, body: { routine_run_id: "run_1", status: "in_progress" } },
      inProgress(0),
      inProgress(2),
      { status: 200, body: { routine_run_id: "run_1", status: "complete", total: 3, finished: 3, data: [{ id: "a", status: "complete", result: { x: 1 } }], cursor: "c2" } },
      {
        status: 200,
        body: {
          routine_run_id: "run_1",
          status: "complete",
          total: 3,
          finished: 3,
          data: [
            { id: "b", status: "failed", error: { message: "Provider request failed" } },
            { id: "c", status: "cancelled" },
          ],
        },
      },
    ]);
    const run = await c.run("function:t_1", [
      { id: "a", inputs: { d: "a.com" } },
      { id: "b", inputs: { d: "b.com" } },
      { id: "c", inputs: { d: "c.com" } },
    ]);
    expect(run.routineRunId).toBe("run_1");
    expect(run.items).toEqual([
      { id: "a", status: "complete", result: { x: 1 } },
      { id: "b", status: "failed", error: "Provider request failed" },
      { id: "c", status: "unknown", rawStatus: "cancelled" },
    ]);
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://clay.test/v0/routines/function%3At_1/run" });
    expect(JSON.parse(calls[0]!.body!)).toEqual({ items: [{ id: "a", inputs: { d: "a.com" } }, { id: "b", inputs: { d: "b.com" } }, { id: "c", inputs: { d: "c.com" } }] });
    expect(calls[4]!.url).toContain("cursor=c2");
    // finished went 0 → 2 on the 2nd poll (t=2000) and 3 on completion (t=3000)
    expect(run.completionTimesMs).toEqual([2000, 2000, 3000]);
  });

  it("times out with a typed error", async () => {
    const { c } = client([{ status: 202, body: { routine_run_id: "run_1", status: "in_progress" } }, inProgress(0), inProgress(0), inProgress(0)]);
    await expect(c.run("r", [{ id: "a", inputs: {} }], { pollIntervalMs: 1000, timeoutMs: 2500 })).rejects.toBeInstanceOf(RunTimeoutError);
  });

  it("rejects batches outside 1-100 items without calling Clay", async () => {
    const { c, calls } = client([]);
    await expect(c.startRun("r", [])).rejects.toThrow(RangeError);
    expect(calls).toHaveLength(0);
  });
});

describe("retries", () => {
  it("honors Retry-After on 429 then succeeds", async () => {
    const { c, sleeps } = client([{ status: 429, body: { message: "slow down" }, headers: { "retry-after": "3" } }, { status: 200, body: { balance: 1 } }]);
    expect(await c.balance()).toEqual({ credits: 1 });
    expect(sleeps[0]).toBe(3000 + 0.5 * 250);
  });

  it("retries a 429 on POST /run, since Clay rejected it and nothing ran", async () => {
    const { c, calls } = client([{ status: 429, body: {} }, { status: 202, body: { routine_run_id: "run_9", status: "in_progress" } }]);
    expect(await c.startRun("r", [{ id: "a", inputs: {} }])).toBe("run_9");
    expect(calls.filter((x) => x.method === "POST")).toHaveLength(2);
  });

  it("never retries a 5xx on POST /run (it might have started and charged)", async () => {
    const { c, calls } = client([{ status: 502, body: { message: "bad gateway" } }]);
    await expect(c.startRun("r", [{ id: "a", inputs: {} }])).rejects.toMatchObject({ status: 502 });
    expect(calls).toHaveLength(1);
  });

  it("retries 5xx and network errors on GET with exponential backoff", async () => {
    const { c, sleeps } = client([new TypeError("fetch failed"), { status: 503, body: {} }, { status: 200, body: { balance: 2 } }]);
    expect(await c.balance()).toEqual({ credits: 2 });
    // full jitter at random()=0.5: cap/2 + 0.5*cap/2 with cap = 500, then 1000
    expect(sleeps).toEqual([375, 750]);
  });

  it("gives up after maxRetries with a typed rate-limit error", async () => {
    const { c } = client(
      [
        { status: 429, body: { message: "limited" } },
        { status: 429, body: { message: "limited" } },
      ],
      { maxRetries: 1 },
    );
    const error = await c.balance().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ClayRateLimitError);
    expect(error).toBeInstanceOf(ClayApiError);
  });
});

describe("typed errors", () => {
  it.each([
    [401, ClayAuthError],
    [403, ClayAuthError],
    [404, ClayNotFoundError],
    [422, ClayApiError],
  ])("maps HTTP %i", async (status, type) => {
    const { c } = client([{ status, body: { message: "nope" } }]);
    const error = await c.startRun("r", [{ id: "a", inputs: {} }]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(type);
    expect((error as ClayApiError).message).toContain("nope");
  });

  it("keeps a non-JSON error body readable", async () => {
    const c = new ClayClient({ apiKey: "k", fetch: (async () => new Response("<html>down</html>", { status: 400 })) as typeof globalThis.fetch });
    await expect(c.balance()).rejects.toThrow("<html>down</html>");
  });
});

describe("retryAfterMs", () => {
  it("parses seconds and HTTP dates", () => {
    expect(retryAfterMs("2")).toBe(2000);
    expect(retryAfterMs(null)).toBeUndefined();
    expect(retryAfterMs("garbage")).toBeUndefined();
    expect(retryAfterMs(new Date(Date.now() + 5000).toUTCString())).toBeGreaterThan(3000);
  });
});

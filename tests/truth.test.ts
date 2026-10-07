import { describe, expect, it } from "vitest";
import { classifyPage, clayMentions, detect, fetchSiteTruth, type SiteTruth } from "@/lib/truth/html-signatures";
import { scoreTechStack, scoreTraffic } from "@/lib/truth/score";
import { ranksFromCsv, type TrancoSnapshot } from "@/lib/truth/tranco";

const page = (body: string) => `<!doctype html><html><head><title>x</title></head><body>${body}${" ".repeat(2000)}</body></html>`;

describe("detect", () => {
  it("finds script-tag signatures and records the evidence", () => {
    const html = page(`
      <script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script>
      <script src="//js.hs-scripts.com/123.js"></script>
      <script>window.intercomSettings = {}</script>
      <script src="/_next/static/chunks/main.js"></script>`);
    const { detected, evidence } = detect(html, {});
    expect(detected).toEqual(["Google Tag Manager", "HubSpot", "Intercom", "Next.js"]);
    expect(evidence["HubSpot"]).toContain("hs-scripts");
  });

  it("finds CDN and hosting from response headers", () => {
    expect(detect(page(""), { server: "cloudflare", "cf-ray": "abc" }).detected).toEqual(["Cloudflare"]);
    expect(detect(page(""), { "x-vercel-id": "iad1::xyz" }).detected).toEqual(["Vercel"]);
    expect(detect(page(""), { "x-served-by": "cache-sjc10043-SJC" }).detected).toEqual(["Fastly"]);
  });

  it("doesn't count a GTM container as Google Analytics", () => {
    expect(detect(page('<script src="https://www.googletagmanager.com/gtm.js?id=GTM-X1Y2"></script>'), {}).detected).not.toContain("Google Analytics");
  });
});

describe("classifyPage", () => {
  it("marks blocked and empty pages unverifiable", () => {
    expect(classifyPage(403, page(""))).toBe("HTTP 403");
    expect(classifyPage(200, "<html><title>Just a moment...</title></html>")).toBe("bot challenge page");
    expect(classifyPage(200, "<html></html>")).toBe("only 13 bytes of HTML");
    // Reddit's proof-of-work interstitial: a real-looking 8 KB page with no site content.
    expect(classifyPage(200, page('<script>e.elements.namedItem("solution").value=n,e.requestSubmit()</script>'))).toBe("bot challenge page");
    expect(classifyPage(200, page("<p>hello</p>"))).toBeUndefined();
  });
});

describe("fetchSiteTruth", () => {
  it("keeps useful headers, drops the rest, and detects", async () => {
    const fetch = (async () =>
      new Response(page('<script src="https://js.stripe.com/v3/"></script>'), {
        status: 200,
        headers: { server: "Vercel", "set-cookie": "secret=1", "content-type": "text/html" },
      })) as unknown as typeof globalThis.fetch;
    const site = await fetchSiteTruth("example.com", fetch);
    expect(site.verdict).toBe("verified");
    expect(site.detected).toEqual(["Vercel", "Stripe.js"]);
    expect(site.headers).toEqual({ server: "Vercel", "content-type": "text/html" });
  });

  it("is unverifiable (not empty-handed verified) when the fetch fails", async () => {
    const fetch = (async () => {
      throw new Error("ETIMEDOUT");
    }) as unknown as typeof globalThis.fetch;
    expect(await fetchSiteTruth("down.com", fetch)).toMatchObject({ verdict: "unverifiable", reason: "fetch failed: ETIMEDOUT" });
  });
});

describe("clayMentions", () => {
  it("maps BuiltWith-style names onto our signatures, case-insensitively", () => {
    const hits = clayMentions(["Google Universal Analytics", "hubspot", "Webflow Hosting", "Facebook Pixel", "jQuery"]);
    expect([...hits].sort()).toEqual(["Google Analytics", "HubSpot", "Meta Pixel"]);
  });
});

const site = (domain: string, detected: string[]): SiteTruth => ({ domain, method: "rendered", verdict: "verified", detected, evidence: {}, headers: {} });

describe("scoreTechStack", () => {
  const snapshot = {
    source: "test",
    method: "test",
    generatedAt: "2026-10-07T00:00:00Z",
    entries: [
      site("a.com", ["Google Tag Manager", "HubSpot"]),
      site("b.com", ["Cloudflare"]),
      { domain: "c.com", method: "rendered" as const, verdict: "unverifiable" as const, reason: "HTTP 403", detected: [], evidence: {}, headers: {} },
    ],
  };

  it("micro-averages precision and recall over verifiable sites only", () => {
    const { rows, metrics } = scoreTechStack(
      [
        { domain: "a.com", status: "complete", value: "Google Tag Manager, Segment, jQuery" },
        { domain: "b.com", status: "complete", value: "Cloudflare CDN" },
        { domain: "c.com", status: "complete", value: "Google Tag Manager" },
      ],
      snapshot,
    );
    if (metrics.kind !== "html-signatures") throw new Error("wrong kind");
    // a: tp GTM, fp Segment, fn HubSpot. b: tp Cloudflare. c excluded.
    expect(metrics.overall).toMatchObject({ tp: 2, fp: 1, fn: 1 });
    expect(metrics.overall.precision).toBeCloseTo(2 / 3);
    expect(metrics.overall.recall).toBeCloseTo(2 / 3);
    expect(metrics.scoredDomains).toBe(2);
    expect(metrics.unverifiable).toEqual([{ domain: "c.com", reason: "HTTP 403" }]);
    expect(rows[0]).toEqual({ kind: "html-signatures", verdict: "verified", truePositives: ["Google Tag Manager"], falsePositives: ["Segment"], falseNegatives: ["HubSpot"] });
    expect(metrics.perTech.find((t) => t.tech === "Segment")).toMatchObject({ tp: 0, fp: 1, precision: 0 });
  });

  it("doesn't score a failed Clay row (coverage already counts it)", () => {
    const { rows, metrics } = scoreTechStack([{ domain: "a.com", status: "failed", value: undefined }], snapshot);
    expect(rows[0]).toBeUndefined();
    if (metrics.kind !== "html-signatures") throw new Error("wrong kind");
    expect(metrics.overall).toMatchObject({ tp: 0, fp: 0, fn: 0 });
  });
});

describe("scoreTraffic", () => {
  const snapshot: TrancoSnapshot = {
    source: "test",
    method: "test",
    generatedAt: "2026-10-07T00:00:00Z",
    listId: "TEST",
    listCreatedOn: "2026-10-06",
    entries: [
      { domain: "big.com", rank: 10 },
      { domain: "mid.com", rank: 500 },
      { domain: "small.com", rank: 9000 },
      { domain: "tiny.com", rank: null },
    ],
  };

  it("reports +1 when Clay's traffic order matches Tranco's popularity order", () => {
    const { metrics } = scoreTraffic(
      [
        { domain: "big.com", status: "complete", value: 1_000_000 },
        { domain: "mid.com", status: "complete", value: 50_000 },
        { domain: "small.com", status: "complete", value: 900 },
        { domain: "tiny.com", status: "complete", value: 10 },
      ],
      snapshot,
    );
    if (metrics.kind !== "tranco") throw new Error("wrong kind");
    expect(metrics.spearman).toBeCloseTo(1);
    expect(metrics.pairs).toBe(3);
    expect(metrics.unranked).toEqual(["tiny.com"]);
  });

  it("reports -1 for a reversed order, and lists rows Clay had no number for", () => {
    const { metrics, rows } = scoreTraffic(
      [
        { domain: "big.com", status: "complete", value: 1 },
        { domain: "mid.com", status: "complete", value: "2" },
        { domain: "small.com", status: "complete", value: 3 },
        { domain: "tiny.com", status: "failed", value: undefined },
      ],
      snapshot,
    );
    if (metrics.kind !== "tranco") throw new Error("wrong kind");
    expect(metrics.spearman).toBeCloseTo(-1);
    expect(metrics.noClayValue).toEqual(["tiny.com"]);
    expect(rows[0]).toMatchObject({ trancoRank: 10, clayValue: 1, clayPosition: 3, trancoPosition: 1 });
  });
});

describe("ranksFromCsv", () => {
  it("finds the wanted domains, case-insensitively, with CRLF line endings", () => {
    const csv = "1,google.com\r\n2,Clay.com\r\n3,example.org\r\n";
    expect(ranksFromCsv(csv, ["clay.com", "missing.io"])).toEqual([
      { domain: "clay.com", rank: 2 },
      { domain: "missing.io", rank: null },
    ]);
  });
  it("keeps the first (best) rank if a domain repeats", () => {
    expect(ranksFromCsv("1,a.com\n2,a.com\n", ["a.com"])).toEqual([{ domain: "a.com", rank: 1 }]);
  });
});

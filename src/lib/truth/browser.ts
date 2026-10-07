import { BROWSER_UA, KEPT_HEADERS, classifyPage, detect, type SiteTruth } from "./html-signatures";

/** How long to keep listening after load for tags that a tag manager injects late. */
const SETTLE_MS = 6000;
/** A real marketing homepage makes dozens of requests; a handful means we saw an interstitial. */
const MIN_REQUESTS = 10;

/**
 * Renders the homepage in headless Chromium and records every network request, so tags
 * injected at runtime (by GTM, Segment, etc.) count as detected. Static HTML misses them.
 */
export async function renderSiteTruths(domains: readonly string[], log: (line: string) => void): Promise<SiteTruth[]> {
  // Loaded lazily: only `glaze truth refresh` needs a browser.
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const out: SiteTruth[] = [];
    for (const domain of domains) {
      const site = await renderOne(browser, domain);
      log(`  ${domain}: ${site.verdict === "verified" ? `${site.detected.length} techs (${site.requests} requests)` : `unverifiable (${site.reason})`}`);
      out.push(site);
    }
    return out;
  } finally {
    await browser.close();
  }
}

type Browser = Awaited<ReturnType<(typeof import("@playwright/test"))["chromium"]["launch"]>>;

async function renderOne(browser: Browser, domain: string): Promise<SiteTruth> {
  const base: SiteTruth = { domain, method: "rendered", verdict: "unverifiable", detected: [], evidence: {}, headers: {} };
  const context = await browser.newContext({ userAgent: BROWSER_UA, viewport: { width: 1366, height: 900 }, locale: "en-US" });
  const page = await context.newPage();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  try {
    const response = await page.goto(`https://${domain}/`, { waitUntil: "load", timeout: 30_000 });
    await page.waitForTimeout(SETTLE_MS);
    const html = await page.content();
    const status = response?.status() ?? 0;
    const raw = response ? await response.allHeaders() : {};
    const headers: Record<string, string> = {};
    for (const name of KEPT_HEADERS) if (raw[name] !== undefined) headers[name] = raw[name];
    const seen = { ...base, finalUrl: page.url(), httpStatus: status, htmlBytes: html.length, requests: requests.length, headers };
    const problem =
      classifyPage(status, html) ??
      (requests.length < MIN_REQUESTS ? `only ${requests.length} network requests; the page didn't finish loading (likely a bot interstitial)` : undefined);
    if (problem) return { ...seen, reason: problem };
    return { ...seen, verdict: "verified", ...detect(`${html}\n${requests.join("\n")}`, headers) };
  } catch (error) {
    return { ...base, reason: `render failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}` };
  } finally {
    await context.close();
  }
}

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { renderSiteTruths } from "./browser";
import { fetchSiteTruth, type SiteTruth, type TruthSnapshot } from "./html-signatures";
import { TRUTH_FILES } from "./score";
import { buildTrancoSnapshot, type TrancoSnapshot } from "./tranco";

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

function save(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

const METHODS = {
  rendered:
    "Each homepage is loaded in headless Chromium (desktop Chrome user agent, en-US, 30s timeout), then left running 6s more so tag managers can inject their tags. " +
    "Technologies are matched against the final DOM, every network request URL, and the document's response headers (src/lib/truth/html-signatures.ts). " +
    "Only the homepage is checked, as a first-time US visitor who hasn't answered a cookie banner. Tags that load only after consent, on other pages, or on other subdomains are invisible, so a missing tag here is weaker evidence than a detected one.",
  static:
    "GET https://<domain>/ with a desktop Chrome user agent, 10s timeout, redirects followed. Technologies are matched by script URLs, inline globals and server headers (src/lib/truth/html-signatures.ts). " +
    "Only server-rendered HTML is seen, so tags injected later by a tag manager are invisible.",
};

export async function refreshHtmlTruth(
  domains: readonly string[],
  log: (line: string) => void,
  method: SiteTruth["method"] = "rendered",
): Promise<TruthSnapshot<SiteTruth>> {
  const entries =
    method === "rendered"
      ? await renderSiteTruths(domains, log)
      : await mapLimit(domains, 4, async (domain) => {
          const site = await fetchSiteTruth(domain);
          log(`  ${domain}: ${site.verdict === "verified" ? `${site.detected.length} techs` : `unverifiable (${site.reason})`}`);
          return site;
        });
  const snapshot: TruthSnapshot<SiteTruth> = {
    source: `Homepages ${method === "rendered" ? "rendered" : "fetched"} directly by Glaze (independent of Clay and BuiltWith)`,
    method: METHODS[method],
    generatedAt: new Date().toISOString(),
    entries,
  };
  save(TRUTH_FILES["html-signatures"], snapshot);
  return snapshot;
}

export async function refreshTranco(domains: readonly string[]): Promise<TrancoSnapshot> {
  const snapshot = await buildTrancoSnapshot(domains);
  save(TRUTH_FILES.tranco, snapshot);
  return snapshot;
}

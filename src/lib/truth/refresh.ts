import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
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

export async function refreshHtmlTruth(domains: readonly string[], log: (line: string) => void): Promise<TruthSnapshot<SiteTruth>> {
  const entries = await mapLimit(domains, 4, async (domain) => {
    const site = await fetchSiteTruth(domain);
    log(`  ${domain}: ${site.verdict === "verified" ? `${site.detected.length} techs` : `unverifiable (${site.reason})`}`);
    return site;
  });
  const snapshot: TruthSnapshot<SiteTruth> = {
    source: "Homepage HTML and response headers fetched directly by Glaze",
    method:
      "GET https://<domain>/ with a desktop Chrome user agent, 10s timeout, redirects followed. Technologies are matched by script URLs, inline globals and server headers (src/lib/truth/html-signatures.ts). " +
      "Only the homepage is checked and only server-rendered HTML is seen, so tags injected later by a tag manager are invisible: absence here is weaker evidence than presence.",
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

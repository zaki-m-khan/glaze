import type { TruthSnapshot } from "./html-signatures";

/** Tranco: a research ranking of the top 1M sites, aggregated from 5 independent providers. */
export const TRANCO_API = "https://tranco-list.eu";

export interface TrancoListInfo {
  listId: string;
  createdOn: string;
  providers: string[];
  window: { start: string; end: string };
  downloadUrl: string;
}

export interface TrancoEntry {
  domain: string;
  /** 1 = most popular. null = not in the top 1M. */
  rank: number | null;
}

export interface TrancoSnapshot extends TruthSnapshot<TrancoEntry> {
  listId: string;
  listCreatedOn: string;
}

export async function latestListInfo(fetchImpl: typeof fetch = fetch): Promise<TrancoListInfo> {
  const idResponse = await fetchImpl(`${TRANCO_API}/top-1m-id`);
  if (!idResponse.ok) throw new Error(`Tranco list id request failed: HTTP ${idResponse.status}`);
  const listId = (await idResponse.text()).trim();
  const metaResponse = await fetchImpl(`${TRANCO_API}/api/lists/id/${encodeURIComponent(listId)}`);
  if (!metaResponse.ok) throw new Error(`Tranco list metadata request failed: HTTP ${metaResponse.status}`);
  const meta = (await metaResponse.json()) as {
    list_id: string;
    created_on: string;
    download: string;
    configuration: { providers: string[]; startDate: string; endDate: string };
  };
  return {
    listId: meta.list_id,
    createdOn: meta.created_on,
    providers: meta.configuration.providers,
    window: { start: meta.configuration.startDate, end: meta.configuration.endDate },
    downloadUrl: meta.download,
  };
}

/** Scans `rank,domain` CSV text for the wanted domains without materializing all 1M rows. */
export function ranksFromCsv(csv: string, domains: readonly string[]): TrancoEntry[] {
  const wanted = new Map(domains.map((d) => [d.toLowerCase(), null as number | null]));
  let remaining = wanted.size;
  let start = 0;
  while (start < csv.length && remaining > 0) {
    let end = csv.indexOf("\n", start);
    if (end === -1) end = csv.length;
    const comma = csv.indexOf(",", start);
    if (comma > start && comma < end) {
      const domain = csv.slice(comma + 1, end).trim().toLowerCase();
      if (wanted.get(domain) === null) {
        wanted.set(domain, Number(csv.slice(start, comma)));
        remaining--;
      }
    }
    start = end + 1;
  }
  return domains.map((domain) => ({ domain, rank: wanted.get(domain.toLowerCase()) ?? null }));
}

export async function buildTrancoSnapshot(domains: readonly string[], fetchImpl: typeof fetch = fetch): Promise<TrancoSnapshot> {
  const info = await latestListInfo(fetchImpl);
  const response = await fetchImpl(info.downloadUrl);
  if (!response.ok) throw new Error(`Tranco download failed: HTTP ${response.status}`);
  const entries = ranksFromCsv(await response.text(), domains);
  return {
    source: `Tranco list ${info.listId} (${TRANCO_API}/list/${info.listId}/1000000)`,
    method: `Daily Tranco top-1M, Dowdall combination of ${info.providers.join(", ")} over ${info.window.start} to ${info.window.end}. Ranks are pay-level domains; absent = not in the top 1M.`,
    generatedAt: new Date().toISOString(),
    listId: info.listId,
    listCreatedOn: info.createdOn,
    entries,
  };
}

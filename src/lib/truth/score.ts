import { existsSync, readFileSync } from "node:fs";
import { parseNumber, splitList } from "../assert";
import { precisionRecall, spearman, sumConfusion, type PrecisionRecall } from "../metrics";
import type { TruthKind } from "../suite";
import { SIGNATURES, clayMentions, type SiteTruth, type TruthSnapshot } from "./html-signatures";
import type { TrancoSnapshot } from "./tranco";

export const TRUTH_FILES = {
  "html-signatures": "data/truth/html-signatures.json",
  tranco: "data/truth/tranco.json",
} as const;

export type RowTruth =
  | { kind: "html-signatures"; verdict: "unverifiable"; reason: string }
  | { kind: "html-signatures"; verdict: "verified"; truePositives: string[]; falsePositives: string[]; falseNegatives: string[] }
  | { kind: "tranco"; trancoRank: number | null; clayValue: number | undefined; clayPosition?: number; trancoPosition?: number };

export interface TechStat extends PrecisionRecall {
  tech: string;
}

export type TruthMetrics =
  | {
      kind: "html-signatures";
      /** Micro-averaged over every (domain, tech) pair in the detectable set. */
      overall: PrecisionRecall;
      perTech: TechStat[];
      scoredDomains: number;
      unverifiable: { domain: string; reason: string }[];
      detectable: string[];
    }
  | {
      kind: "tranco";
      /** Spearman ρ between Clay traffic and Tranco popularity (rank inverted, so +1 = same order). */
      spearman: number | undefined;
      pairs: number;
      unranked: string[];
      noClayValue: string[];
      outliers: { domain: string; clayPosition: number; trancoPosition: number; shift: number }[];
    };

export interface TruthInput {
  domain: string;
  status: "complete" | "failed" | "missing";
  value: unknown;
}

export type LoadedTruth =
  | { kind: "html-signatures"; snapshot: TruthSnapshot<SiteTruth> }
  | { kind: "tranco"; snapshot: TrancoSnapshot };

export function loadTruth(kind: TruthKind): LoadedTruth | undefined {
  if (kind === "none") return undefined;
  const file = TRUTH_FILES[kind];
  if (!existsSync(file)) return undefined;
  const snapshot = JSON.parse(readFileSync(file, "utf8"));
  return kind === "tranco" ? { kind, snapshot: snapshot as TrancoSnapshot } : { kind, snapshot: snapshot as TruthSnapshot<SiteTruth> };
}

export function scoreTechStack(rows: readonly TruthInput[], snapshot: TruthSnapshot<SiteTruth>): { rows: (RowTruth | undefined)[]; metrics: TruthMetrics } {
  const sites = new Map(snapshot.entries.map((e) => [e.domain, e]));
  const perTech = new Map(SIGNATURES.map((s) => [s.id, { tp: 0, fp: 0, fn: 0 }]));
  const unverifiable: { domain: string; reason: string }[] = [];
  let scoredDomains = 0;

  const rowTruths = rows.map((row): RowTruth | undefined => {
    const site = sites.get(row.domain);
    if (!site || site.verdict === "unverifiable") {
      const reason = site?.reason ?? "not in truth snapshot";
      unverifiable.push({ domain: row.domain, reason });
      return { kind: "html-signatures", verdict: "unverifiable", reason };
    }
    // A failed Clay row has no claims to score; coverage already counts it against the function.
    if (row.status !== "complete") return undefined;
    scoredDomains++;
    const reported = clayMentions(splitList(row.value));
    const truth = new Set(site.detected);
    const truePositives = [...truth].filter((t) => reported.has(t));
    const falsePositives = [...reported].filter((t) => !truth.has(t));
    const falseNegatives = [...truth].filter((t) => !reported.has(t));
    for (const t of truePositives) perTech.get(t)!.tp++;
    for (const t of falsePositives) perTech.get(t)!.fp++;
    for (const t of falseNegatives) perTech.get(t)!.fn++;
    return { kind: "html-signatures", verdict: "verified", truePositives, falsePositives, falseNegatives };
  });

  const techStats = [...perTech.entries()].map(([tech, c]) => ({ tech, ...precisionRecall(c) }));
  return {
    rows: rowTruths,
    metrics: {
      kind: "html-signatures",
      overall: precisionRecall(sumConfusion([...perTech.values()])),
      perTech: techStats.filter((t) => t.tp + t.fp + t.fn > 0),
      scoredDomains,
      unverifiable,
      detectable: SIGNATURES.map((s) => s.id),
    },
  };
}

/** Position 1 = biggest. Ties share the better position. */
function positions(values: readonly number[], descending: boolean): number[] {
  return values.map((v) => 1 + values.filter((w) => (descending ? w > v : w < v)).length);
}

export function scoreTraffic(rows: readonly TruthInput[], snapshot: TrancoSnapshot): { rows: (RowTruth | undefined)[]; metrics: TruthMetrics } {
  const ranks = new Map(snapshot.entries.map((e) => [e.domain, e.rank]));
  const unranked: string[] = [];
  const noClayValue: string[] = [];
  const pairs: { index: number; domain: string; traffic: number; rank: number }[] = [];

  const base = rows.map((row, index): RowTruth => {
    const trancoRank = ranks.get(row.domain) ?? null;
    const clayValue = row.status === "complete" ? parseNumber(row.value) : undefined;
    if (trancoRank === null) unranked.push(row.domain);
    if (clayValue === undefined) noClayValue.push(row.domain);
    if (trancoRank !== null && clayValue !== undefined) pairs.push({ index, domain: row.domain, traffic: clayValue, rank: trancoRank });
    return { kind: "tranco", trancoRank, clayValue };
  });

  const clayPos = positions(pairs.map((p) => p.traffic), true);
  const trancoPos = positions(pairs.map((p) => p.rank), false);
  const outliers = pairs
    .map((p, i) => ({ domain: p.domain, clayPosition: clayPos[i]!, trancoPosition: trancoPos[i]!, shift: clayPos[i]! - trancoPos[i]! }))
    .sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift))
    .filter((o) => Math.abs(o.shift) >= 3)
    .slice(0, 5);
  pairs.forEach((p, i) => {
    base[p.index] = { kind: "tranco", trancoRank: p.rank, clayValue: p.traffic, clayPosition: clayPos[i], trancoPosition: trancoPos[i] };
  });

  return {
    rows: base,
    metrics: {
      kind: "tranco",
      spearman: spearman(
        pairs.map((p) => p.traffic),
        pairs.map((p) => -p.rank),
      ),
      pairs: pairs.length,
      unranked,
      noClayValue,
      outliers,
    },
  };
}

export function scoreTruth(truth: LoadedTruth, rows: readonly TruthInput[]): { rows: (RowTruth | undefined)[]; metrics: TruthMetrics } {
  return truth.kind === "tranco" ? scoreTraffic(rows, truth.snapshot) : scoreTechStack(rows, truth.snapshot);
}

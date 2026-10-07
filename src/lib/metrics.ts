/** Pure statistics. Everything here is deterministic and unit-tested. */

/** Linear-interpolated percentile (same definition as numpy's default). `p` in [0, 100]. */
export function percentile(values: readonly number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (Math.min(Math.max(p, 0), 100) / 100) * (sorted.length - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (index - lo);
}

/** 1-based ranks; tied values share the mean of the ranks they span. */
export function averageRanks(values: readonly number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  for (let start = 0; start < order.length; ) {
    let end = start;
    while (end + 1 < order.length && order[end + 1]!.v === order[start]!.v) end++;
    const rank = (start + end) / 2 + 1;
    for (let k = start; k <= end; k++) ranks[order[k]!.i] = rank;
    start = end + 1;
  }
  return ranks;
}

export function pearson(xs: readonly number[], ys: readonly number[]): number | undefined {
  if (xs.length !== ys.length) throw new RangeError("pearson needs equal-length inputs");
  const n = xs.length;
  if (n < 2) return undefined;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return undefined;
  return sxy / Math.sqrt(sxx * syy);
}

/** Spearman's ρ: Pearson correlation of average ranks, so ties are handled correctly. */
export function spearman(xs: readonly number[], ys: readonly number[]): number | undefined {
  if (xs.length !== ys.length) throw new RangeError("spearman needs equal-length inputs");
  return pearson(averageRanks(xs), averageRanks(ys));
}

export interface Confusion {
  tp: number;
  fp: number;
  fn: number;
}

export interface PrecisionRecall extends Confusion {
  /** undefined when there were no predictions (tp + fp = 0). */
  precision: number | undefined;
  /** undefined when there was nothing to find (tp + fn = 0). */
  recall: number | undefined;
  f1: number | undefined;
}

export function precisionRecall({ tp, fp, fn }: Confusion): PrecisionRecall {
  const precision = tp + fp === 0 ? undefined : tp / (tp + fp);
  const recall = tp + fn === 0 ? undefined : tp / (tp + fn);
  const f1 =
    precision === undefined || recall === undefined || precision + recall === 0
      ? undefined
      : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, precision, recall, f1 };
}

export function sumConfusion(items: readonly Confusion[]): Confusion {
  return items.reduce((acc, c) => ({ tp: acc.tp + c.tp, fp: acc.fp + c.fp, fn: acc.fn + c.fn }), { tp: 0, fp: 0, fn: 0 });
}

export function ratio(numerator: number, denominator: number): number | undefined {
  return denominator === 0 ? undefined : numerator / denominator;
}

export function mean(values: readonly number[]): number | undefined {
  return values.length === 0 ? undefined : values.reduce((s, v) => s + v, 0) / values.length;
}

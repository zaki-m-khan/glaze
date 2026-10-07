import { describe, expect, it } from "vitest";
import { averageRanks, pearson, percentile, precisionRecall, spearman, sumConfusion } from "@/lib/metrics";

describe("percentile", () => {
  it("interpolates linearly like numpy", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 95)).toBeCloseTo(48);
    expect(percentile([5], 95)).toBe(5);
  });
  it("is order-independent and handles empty input", () => {
    expect(percentile([4, 1, 3, 2], 0)).toBe(1);
    expect(percentile([4, 1, 3, 2], 100)).toBe(4);
    expect(percentile([], 50)).toBeUndefined();
  });
});

describe("averageRanks", () => {
  it("gives tied values the mean of their ranks", () => {
    expect(averageRanks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    expect(averageRanks([3, 3, 3])).toEqual([2, 2, 2]);
  });
});

describe("spearman", () => {
  it("is 1 for any monotonic increasing relation and -1 for decreasing", () => {
    expect(spearman([1, 2, 3, 4, 5], [1, 4, 9, 16, 25])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4, 5], [50, 40, 30, 20, 10])).toBeCloseTo(-1);
  });
  it("matches the textbook value (no ties: 1 - 6Σd²/n(n²-1))", () => {
    const x = [106, 86, 100, 101, 99, 103, 97, 113, 112, 110];
    const y = [7, 0, 27, 50, 28, 29, 20, 12, 6, 17];
    expect(spearman(x, y)).toBeCloseTo(-0.17575757, 6);
  });
  it("handles ties via average ranks (scipy.stats.spearmanr agrees)", () => {
    expect(spearman([1, 2, 2, 3], [1, 3, 2, 4])).toBeCloseTo(0.9486833, 6);
  });
  it("is undefined when a side has no variance or too few points", () => {
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeUndefined();
    expect(spearman([1], [2])).toBeUndefined();
  });
  it("rejects mismatched lengths", () => {
    expect(() => spearman([1, 2], [1])).toThrow(RangeError);
    expect(() => pearson([1, 2], [1])).toThrow(RangeError);
  });
});

describe("precisionRecall", () => {
  it("computes precision, recall and F1", () => {
    const r = precisionRecall({ tp: 6, fp: 2, fn: 4 });
    expect(r.precision).toBeCloseTo(0.75);
    expect(r.recall).toBeCloseTo(0.6);
    expect(r.f1).toBeCloseTo(2 / 3);
  });
  it("leaves undefined what can't be computed instead of reporting 0", () => {
    expect(precisionRecall({ tp: 0, fp: 0, fn: 3 }).precision).toBeUndefined();
    expect(precisionRecall({ tp: 0, fp: 2, fn: 0 }).recall).toBeUndefined();
  });
  it("sums confusion counts", () => {
    expect(sumConfusion([{ tp: 1, fp: 2, fn: 3 }, { tp: 4, fp: 0, fn: 1 }])).toEqual({ tp: 5, fp: 2, fn: 4 });
  });
});

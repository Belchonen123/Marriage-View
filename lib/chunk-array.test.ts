import { describe, expect, it } from "vitest";
import { chunkArray } from "./chunk-array";

describe("chunkArray", () => {
  it("splits evenly", () => {
    expect(chunkArray([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("handles remainder", () => {
    expect(chunkArray([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });

  it("empty", () => {
    expect(chunkArray([], 5)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { normalizeFocusAreas } from "./journal-focus-areas";

describe("normalizeFocusAreas", () => {
  it("returns empty for non-array", () => {
    expect(normalizeFocusAreas(null)).toEqual([]);
    expect(normalizeFocusAreas({})).toEqual([]);
  });

  it("keeps allowlisted keys once", () => {
    expect(
      normalizeFocusAreas(["values_alignment", "values_alignment", "future_goals", "nope"]),
    ).toEqual(["values_alignment", "future_goals"]);
  });
});

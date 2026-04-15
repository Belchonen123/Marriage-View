import { describe, expect, it } from "vitest";
import {
  answersExactlyEqual,
  categoryMultiplierForSection,
  resolveCategoryKey,
  scorePairExplain,
} from "./score";
import type { QuestionRow } from "@/lib/types";

function q(partial: Partial<QuestionRow> & Pick<QuestionRow, "id" | "prompt" | "answer_type">): QuestionRow {
  return {
    version: 1,
    sort_order: 0,
    section: null,
    options: null,
    weight: 1,
    required: true,
    dealbreaker: false,
    ...partial,
  };
}

describe("answersExactlyEqual", () => {
  it("matches single and likert by string equality", () => {
    const single = q({
      id: "s",
      prompt: "Test",
      answer_type: "single",
      options: ["A", "B"],
    });
    expect(answersExactlyEqual(single, "A", "A")).toBe(true);
    expect(answersExactlyEqual(single, "A", "B")).toBe(false);
  });

  it("matches multi as same set regardless of order", () => {
    const multi = q({
      id: "m",
      prompt: "Pick",
      answer_type: "multi",
      options: ["x", "y", "z"],
    });
    expect(answersExactlyEqual(multi, ["y", "x"], ["x", "y"])).toBe(true);
    expect(answersExactlyEqual(multi, ["x"], ["x", "y"])).toBe(false);
  });
});

describe("scorePairExplain", () => {
  it("returns dealbreaker with zero total and a clear reason", () => {
    const questions: QuestionRow[] = [
      q({
        id: "1",
        prompt: "Want children?",
        answer_type: "single",
        dealbreaker: true,
        options: ["Yes", "No"],
      }),
    ];
    const ex = scorePairExplain(questions, { "1": "Yes" }, { "1": "No" });
    expect(ex.hardFail).toBe(true);
    expect(ex.totalPercent).toBe(0);
    expect(ex.reasons.some((r) => r.toLowerCase().includes("dealbreaker"))).toBe(true);
  });

  it("applies category multipliers via section keywords", () => {
    expect(resolveCategoryKey("Values & principles")).toBe("values");
    expect(categoryMultiplierForSection("Long-term goals")).toBeGreaterThan(1);
  });

  it("on hardFail, totalPercent is 0 but category breakdown can still show non-zero within-topic percents", () => {
    const questions: QuestionRow[] = [
      q({
        id: "db",
        prompt: "Want children?",
        answer_type: "single",
        dealbreaker: true,
        options: ["Yes", "No"],
        section: "Family & children",
        weight: 1,
      }),
      q({
        id: "ok",
        prompt: "Exercise weekly?",
        answer_type: "single",
        options: ["Often", "Rarely"],
        section: "Lifestyle & habits",
        weight: 1,
      }),
    ];
    const ex = scorePairExplain(questions, { db: "Yes", ok: "Often" }, { db: "No", ok: "Often" });
    expect(ex.hardFail).toBe(true);
    expect(ex.totalPercent).toBe(0);
    expect(Object.values(ex.categoryBreakdown).some((c) => c.percent > 0)).toBe(true);
  });
});

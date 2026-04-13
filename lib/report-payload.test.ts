import { describe, expect, it } from "vitest";
import { REPORT_DETAILS_MAX_LEN, parseReportPayload } from "./report-payload";

const self = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const other = "11111111-2222-4333-8444-555555555555";

describe("parseReportPayload", () => {
  it("accepts minimal valid body", () => {
    const r = parseReportPayload(
      { reportedUserId: other, reason: "spam" },
      self,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.details).toBeNull();
      expect(r.value.reason).toBe("spam");
    }
  });

  it("trims details and drops empty to null", () => {
    const r = parseReportPayload(
      { reportedUserId: other, reason: "x", details: " \n  " },
      self,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.details).toBeNull();
  });

  it("rejects oversized details", () => {
    const r = parseReportPayload(
      { reportedUserId: other, reason: "x", details: "a".repeat(REPORT_DETAILS_MAX_LEN + 1) },
      self,
    );
    expect(r.ok).toBe(false);
  });

  it("rejects self-report", () => {
    const r = parseReportPayload({ reportedUserId: self, reason: "x" }, self);
    expect(r.ok).toBe(false);
  });

  it("rejects invalid reportedUserId", () => {
    const r = parseReportPayload({ reportedUserId: "not-a-uuid", reason: "x" }, self);
    expect(r.ok).toBe(false);
  });

  it("rejects non-string details", () => {
    const r = parseReportPayload(
      { reportedUserId: other, reason: "x", details: 1 },
      self,
    );
    expect(r.ok).toBe(false);
  });
});

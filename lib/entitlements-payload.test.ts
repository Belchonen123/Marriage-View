import { describe, expect, it } from "vitest";
import { parseAdminEntitlementBody } from "./entitlements-payload";

const uid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("parseAdminEntitlementBody", () => {
  it("parses free tier", () => {
    const r = parseAdminEntitlementBody({ userId: uid, tier: "free" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.tier).toBe("free");
      expect(r.value.effectiveUntil).toBeNull();
    }
  });

  it("parses plus with null until", () => {
    const r = parseAdminEntitlementBody({ userId: uid, tier: "plus", effectiveUntil: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.effectiveUntil).toBeNull();
  });

  it("rejects invalid uuid", () => {
    const r = parseAdminEntitlementBody({ userId: "bad", tier: "plus" });
    expect(r.ok).toBe(false);
  });

  it("rejects invalid tier", () => {
    const r = parseAdminEntitlementBody({ userId: uid, tier: "gold" });
    expect(r.ok).toBe(false);
  });

  it("rejects until too far in future", () => {
    const far = new Date();
    far.setUTCFullYear(far.getUTCFullYear() + 11);
    const r = parseAdminEntitlementBody({
      userId: uid,
      tier: "plus",
      effectiveUntil: far.toISOString(),
    });
    expect(r.ok).toBe(false);
  });
});

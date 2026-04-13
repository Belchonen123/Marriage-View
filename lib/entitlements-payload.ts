import { isUuid } from "@/lib/uuid";

const PLUS_MAX_EFFECTIVE_UNTIL_YEARS = 10;

export type ParsedEntitlementPayload = {
  userId: string;
  tier: "free" | "plus";
  effectiveUntil: string | null;
};

export type ParseEntitlementResult =
  | { ok: true; value: ParsedEntitlementPayload }
  | { ok: false; error: string; status: number };

function parseEffectiveUntil(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; error: string; status: number } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "effectiveUntil must be an ISO date string or null", status: 400 };
  }
  const s = raw.trim();
  if (!s) return { ok: true, value: null };
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: "effectiveUntil must be a valid ISO date", status: 400 };
  }
  const now = Date.now();
  const max = now + PLUS_MAX_EFFECTIVE_UNTIL_YEARS * 365.25 * 24 * 60 * 60 * 1000;
  if (d.getTime() > max) {
    return {
      ok: false,
      error: `effectiveUntil cannot be more than ${PLUS_MAX_EFFECTIVE_UNTIL_YEARS} years in the future`,
      status: 400,
    };
  }
  return { ok: true, value: d.toISOString() };
}

export function parseAdminEntitlementBody(body: unknown): ParseEntitlementResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid JSON body", status: 400 };
  }
  const o = body as Record<string, unknown>;
  const userId = o.userId;
  const tier = o.tier;

  if (typeof userId !== "string" || !isUuid(userId)) {
    return { ok: false, error: "userId must be a valid UUID", status: 400 };
  }
  if (tier !== "free" && tier !== "plus") {
    return { ok: false, error: "userId and tier (free|plus) required", status: 400 };
  }

  const untilParsed = parseEffectiveUntil(o.effectiveUntil);
  if (!untilParsed.ok) return untilParsed;

  const effectiveUntil: string | null = tier === "free" ? null : untilParsed.value;

  return { ok: true, value: { userId, tier, effectiveUntil } };
}

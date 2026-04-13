import { isUuid } from "@/lib/uuid";

export const REPORT_DETAILS_MAX_LEN = 8000;

export type ParsedReportPayload = {
  reportedUserId: string;
  reason: string;
  details: string | null;
};

export type ParseReportResult =
  | { ok: true; value: ParsedReportPayload }
  | { ok: false; error: string; status: number };

/**
 * Validates user report POST body. `selfId` is the authenticated user (blocks self-report).
 */
export function parseReportPayload(body: unknown, selfId: string): ParseReportResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid JSON body", status: 400 };
  }
  const o = body as Record<string, unknown>;
  const reportedUserId = o.reportedUserId;
  const reason = o.reason;
  const detailsRaw = o.details;

  if (typeof reportedUserId !== "string" || !isUuid(reportedUserId)) {
    return { ok: false, error: "reportedUserId must be a valid UUID", status: 400 };
  }
  if (reportedUserId === selfId) {
    return { ok: false, error: "Invalid report", status: 400 };
  }
  if (typeof reason !== "string" || !reason.trim()) {
    return { ok: false, error: "reportedUserId and reason required", status: 400 };
  }

  let details: string | null = null;
  if (detailsRaw != null) {
    if (typeof detailsRaw !== "string") {
      return { ok: false, error: "details must be a string", status: 400 };
    }
    const trimmed = detailsRaw.trim();
    if (trimmed.length > REPORT_DETAILS_MAX_LEN) {
      return {
        ok: false,
        error: `details must be at most ${REPORT_DETAILS_MAX_LEN} characters`,
        status: 400,
      };
    }
    details = trimmed.length ? trimmed : null;
  }

  return {
    ok: true,
    value: {
      reportedUserId,
      reason: reason.trim(),
      details,
    },
  };
}

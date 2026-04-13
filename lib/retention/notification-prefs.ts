export type RetentionNotificationPrefs = {
  retention_journal: boolean;
  retention_reengage: boolean;
  retention_weekly_hint: boolean;
};

const DEFAULTS: RetentionNotificationPrefs = {
  retention_journal: true,
  retention_reengage: true,
  retention_weekly_hint: true,
};

export function parseNotificationPrefs(raw: unknown): RetentionNotificationPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULTS };
  }
  const o = raw as Record<string, unknown>;
  return {
    retention_journal: o.retention_journal !== false,
    retention_reengage: o.retention_reengage !== false,
    retention_weekly_hint: o.retention_weekly_hint !== false,
  };
}

export function mergeNotificationPrefs(
  current: RetentionNotificationPrefs,
  patch: Partial<RetentionNotificationPrefs>,
): RetentionNotificationPrefs {
  return {
    ...DEFAULTS,
    ...current,
    ...patch,
  };
}

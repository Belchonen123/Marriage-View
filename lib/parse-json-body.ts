/**
 * Read and parse JSON body; returns null on empty/invalid JSON (not on non-objects unless caller checks).
 */
export async function readJsonBody(req: Request): Promise<unknown | null> {
  return req.json().catch(() => null);
}

/** Ensures value is a non-null plain object (not array). */
export function asRecord(body: unknown): Record<string, unknown> | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}

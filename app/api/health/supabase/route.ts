import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health/supabase
 * Checks whether this server can reach your Supabase Auth API (same env as the app).
 * Open in the browser when login shows "Failed to fetch".
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    return NextResponse.json(
      {
        ok: false,
        error: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, then restart next dev.",
      },
      { status: 500 },
    );
  }

  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return NextResponse.json(
      { ok: false, error: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL" },
      { status: 500 },
    );
  }

  const healthUrl = `${url.replace(/\/$/, "")}/auth/v1/health`;
  try {
    const res = await fetch(healthUrl, {
      method: "GET",
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const text = await res.text().catch(() => "");
    const ok = res.ok;
    return NextResponse.json({
      ok,
      host,
      status: res.status,
      message: ok
        ? "This machine can reach your Supabase project. If the browser still fails, try another browser, disable extensions, or clear site data for this origin."
        : text.slice(0, 300),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      ok: false,
      host,
      error: msg,
      hint:
        "The app cannot open a network connection to this host. In Supabase Dashboard → Settings → API, copy the current Project URL (or create a new project). The URL’s subdomain must match a live project. After updating .env.local, restart next dev.",
    });
  }
}

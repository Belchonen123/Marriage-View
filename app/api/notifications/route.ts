import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CALL_ID_PREFIX = "call:";
/** After this many ms, label the pending signal as "missed" in the list. */
const MISSED_CALL_MS = 90_000;

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10)));

  const [{ data: items, error: qErr }, { data: signals, error: sErr }, { count, error: cErr }] =
    await Promise.all([
      supabase
        .from("user_notifications")
        .select("id, kind, title, body, href, read_at, created_at, metadata")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("call_signals")
        .select("id, match_id, caller_id, created_at")
        .eq("callee_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("user_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null),
    ]);

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 400 });
  }
  if (sErr) {
    return NextResponse.json({ error: sErr.message }, { status: 400 });
  }
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 400 });
  }

  const callerIds = [...new Set((signals ?? []).map((r) => r.caller_id as string))];
  let names: Record<string, string> = {};
  if (callerIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", callerIds);
    names = Object.fromEntries(
      (profs ?? []).map((p) => [
        p.id as string,
        ((p.display_name as string) || "Your match").trim() || "Your match",
      ]),
    );
  }

  const now = Date.now();
  const callItems = (signals ?? []).map((sig) => {
    const callerId = sig.caller_id as string;
    const name = names[callerId] ?? "Your match";
    const created = new Date(sig.created_at as string).getTime();
    const missed = now - created > MISSED_CALL_MS;
    return {
      id: `${CALL_ID_PREFIX}${sig.id as string}`,
      kind: "video_call_pending",
      title: missed ? "Missed video date" : "Video call",
      body: missed
        ? `${name} tried to reach you for a video date. Tap to open the chat and call back.`
        : `${name} is inviting you to a video date. Tap to answer.`,
      href: `/chat/${sig.match_id as string}?video=1`,
      read_at: null as string | null,
      created_at: sig.created_at as string,
      isMissedCall: missed,
    };
  });

  const notifRows = (items ?? []).map((n) => ({ ...n, isMissedCall: false as boolean }));
  const merged = [...notifRows, ...callItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const sliced = merged.slice(0, limit);

  const unreadCount = (count ?? 0) + callItems.length;

  return NextResponse.json({ items: sliced, unreadCount });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  const markAll = Boolean(body?.all);

  const now = new Date().toISOString();

  if (markAll) {
    const { error } = await supabase
      .from("user_notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const { error: dErr } = await supabase.from("call_signals").delete().eq("callee_id", user.id);
    if (dErr) {
      return NextResponse.json({ error: dErr.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (!id) {
    return NextResponse.json({ error: "id or all required" }, { status: 400 });
  }

  if (id.startsWith(CALL_ID_PREFIX)) {
    const raw = id.slice(CALL_ID_PREFIX.length);
    if (!uuidRe.test(raw)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const { error: dErr } = await supabase
      .from("call_signals")
      .delete()
      .eq("id", raw)
      .eq("callee_id", user.id);
    if (dErr) {
      return NextResponse.json({ error: dErr.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("user_notifications")
    .update({ read_at: now })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

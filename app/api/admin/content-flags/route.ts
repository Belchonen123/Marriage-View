import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import {
  type ModerationFlag,
  previewWithHit,
  scanForModeration,
} from "@/lib/moderation/profanity";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type FlaggedProfile = {
  source: "profile";
  userId: string;
  displayName: string;
  field: "display_name" | "bio";
  flag: ModerationFlag;
  match: string;
  preview: string;
  adminSuspended: boolean;
  createdAt: string;
};

type FlaggedMessage = {
  source: "message";
  userId: string;
  displayName: string;
  matchId: string;
  messageId: string;
  flag: ModerationFlag;
  match: string;
  preview: string;
  adminSuspended: boolean;
  createdAt: string;
};

type Flagged = FlaggedProfile | FlaggedMessage;

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const messageLimit = Math.min(500, Math.max(50, Number(searchParams.get("limit") ?? "300")));
  const onlyFlag = (searchParams.get("flag") ?? "").toLowerCase();

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const [profilesRes, messagesRes] = await Promise.all([
    admin
      .from("profiles")
      .select("id, display_name, bio, admin_suspended, created_at")
      .order("created_at", { ascending: false })
      .limit(2000),
    admin
      .from("messages")
      .select("id, match_id, sender_id, body, created_at")
      .order("created_at", { ascending: false })
      .limit(messageLimit),
  ]);

  if (profilesRes.error) {
    return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  }
  if (messagesRes.error) {
    return NextResponse.json({ error: messagesRes.error.message }, { status: 500 });
  }

  const profileRows = profilesRes.data ?? [];
  const messageRows = messagesRes.data ?? [];

  const profileById = new Map(
    profileRows.map((p) => [
      p.id as string,
      {
        displayName: (p.display_name as string) ?? "",
        adminSuspended: (p.admin_suspended as boolean | null) ?? false,
      },
    ]),
  );

  // Pull display names for any senders not in the recent profile batch above.
  const missingSenderIds = Array.from(
    new Set(
      messageRows
        .map((m) => m.sender_id as string)
        .filter((id) => !profileById.has(id)),
    ),
  );
  if (missingSenderIds.length > 0) {
    const { data: extraProfiles } = await admin
      .from("profiles")
      .select("id, display_name, admin_suspended")
      .in("id", missingSenderIds);
    for (const p of extraProfiles ?? []) {
      profileById.set(p.id as string, {
        displayName: (p.display_name as string) ?? "",
        adminSuspended: (p.admin_suspended as boolean | null) ?? false,
      });
    }
  }

  const flagged: Flagged[] = [];

  for (const p of profileRows) {
    const userId = p.id as string;
    const displayName = (p.display_name as string) ?? "";
    const adminSuspended = (p.admin_suspended as boolean | null) ?? false;
    const createdAt = p.created_at as string;

    const nameHits = scanForModeration(displayName);
    for (const h of nameHits) {
      if (onlyFlag && h.flag !== onlyFlag) continue;
      flagged.push({
        source: "profile",
        userId,
        displayName,
        field: "display_name",
        flag: h.flag,
        match: h.match,
        preview: previewWithHit(displayName, h),
        adminSuspended,
        createdAt,
      });
    }

    const bio = (p.bio as string | null) ?? "";
    const bioHits = scanForModeration(bio);
    for (const h of bioHits) {
      if (onlyFlag && h.flag !== onlyFlag) continue;
      flagged.push({
        source: "profile",
        userId,
        displayName,
        field: "bio",
        flag: h.flag,
        match: h.match,
        preview: previewWithHit(bio, h),
        adminSuspended,
        createdAt,
      });
    }
  }

  for (const m of messageRows) {
    const senderId = m.sender_id as string;
    const body = (m.body as string) ?? "";
    const hits = scanForModeration(body);
    if (!hits.length) continue;
    const senderInfo = profileById.get(senderId) ?? { displayName: "", adminSuspended: false };
    for (const h of hits) {
      if (onlyFlag && h.flag !== onlyFlag) continue;
      flagged.push({
        source: "message",
        userId: senderId,
        displayName: senderInfo.displayName,
        matchId: m.match_id as string,
        messageId: m.id as string,
        flag: h.flag,
        match: h.match,
        preview: previewWithHit(body, h),
        adminSuspended: senderInfo.adminSuspended,
        createdAt: m.created_at as string,
      });
    }
  }

  flagged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return NextResponse.json({
    items: flagged,
    scanned: {
      profiles: profileRows.length,
      messages: messageRows.length,
    },
  });
}

"use client";

import { CoachChatCore } from "@/components/CoachChatCore";

export function CoachClient({
  initialMatchId,
  matchImportContext,
}: {
  initialMatchId: string | null;
  matchImportContext?: { matchId: string; otherName: string };
}) {
  const suffix = initialMatchId ? `page:match:${initialMatchId}` : "page";

  return (
    <CoachChatCore
      variant="page"
      initialMatchId={initialMatchId}
      matchImportContext={matchImportContext}
      storageScopeSuffix={suffix}
    />
  );
}

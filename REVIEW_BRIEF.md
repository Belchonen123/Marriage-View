# Marriage View — External Code Review Brief

**Repo:** https://github.com/Belchonen123/Marriage-View
**Live:** https://www.marriageview.app
**Bundle:** [code-review-bundle.txt](./code-review-bundle.txt) (252 files, ~1 MB, single text file)

This is a video-first dating product built for marriage-minded singles in
the Orthodox Jewish community. Built in days, not months, with heavy AI
assistance. The author is also using it as a portfolio piece for a
consulting practice — so honest, sharp feedback is welcome.

## TL;DR Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, RSC, force-dynamic on most server routes) |
| Database / Auth / Realtime / Storage | **Supabase** (Postgres + RLS + Realtime + Auth + Storage) |
| Video calls | **LiveKit Cloud** (WebRTC SFU) |
| Push notifications | **VAPID web-push** + service worker |
| SMS / WhatsApp fallback | **Twilio Verify + Messages** |
| LLM (coach) | **OpenAI** (GPT-4 class, structured prompt with user context) |
| Analytics | **PostHog** (no-ops when key absent) |
| Payments | **Stripe** (wired but not yet active) |
| Hosting | **Vercel Pro** |
| Domain | GoDaddy → Vercel DNS |

Frontend is React 19 + Tailwind v4 + Fraunces serif for the brand wordmark.

## What's Real vs Aspirational

**Working today on production:**
- Email/password auth, full onboarding flow (profile → quiz → photos → reveal)
- Discover stack with versioned questionnaire-based compatibility scoring
- Bidirectional likes → mutual matches → chat
- Real video dates via LiveKit (with primer modal, call signals, ringtones)
- Web push notifications (calls + messages) with service worker
- Twilio SMS + WhatsApp fallback for incoming-call rings
- Photo verification flow + per-user moderation (block, report)
- Full admin panel: users, matches, photo wall, content moderation,
  date reviews, questionnaire editor, reports, feature flags, audit log
- Heuristic content scanner (profanity / sexual / off-platform handles)
  with admin-editable custom word list + auto-suspend bulk action
- PWA installable on Android + iOS (with the install card)
- Brand identity applied throughout (burgundy/gold palette, custom mark)
- Sitemap + robots + Google Search Console submitted

**Stubbed / future work:**
- Stripe checkout exists in code but no active subscription flow
- Coach is NOT RAG — it's structured-context prompting (see
  `app/api/coach/chat/route.ts`). A vector layer would be a real upgrade.
- Some Tailwind utility classes still hardcode rose-700/rose-100 (42
  occurrences in 22 files) — they'd ideally migrate to `var(--accent)`.
- Two pre-existing ESLint warnings are still present (pre-existing,
  surfaced from older work):
  - `app/onboarding/profile/page.tsx:354` — useDeviceLocation hook called
    inside a callback (react-hooks/rules-of-hooks)
  - `components/ChatRoomClient.tsx:59` — unused `postCallReturnHint` state
- Per-user notification preferences UI exists; some toast messages from
  API errors still bubble server messages verbatim.

## Where I'd most want fresh eyes

1. **RLS policies.** Supabase migrations are in `supabase/migrations/`.
   `001_initial.sql` establishes the baseline. `004_premium_layer.sql`
   and beyond extend it. Worth a read for tightness — especially around
   `messages`, `interactions`, `match_journal`, `push_subscriptions`,
   and `call_signals`. Anything that could let user A read user B's
   private data is a serious bug.

2. **The matching algorithm.** `lib/matching/score.ts` +
   `app/api/discover/route.ts`. Recent change (commit 932893b) made
   dealbreaker mismatches filter out completely rather than just demote.
   Math is in `scorePair` + `scorePairExplain`. The caching layer
   (`discover_compatibility_cache`) is keyed by questionnaire version
   and a hash of the question bank — that hash invalidation logic is
   worth a second look.

3. **The realtime / push layer.** `components/GlobalRealtimeNotifications.tsx`
   was rewritten recently to attach the call_signals handler BEFORE
   subscribe (supabase-js drops handlers added after subscribe), and to
   use `registration.showNotification()` instead of `new Notification()`
   for Android Chrome compatibility. `lib/push-reconcile.ts` self-heals
   stale subscriptions on every page load. The flow has been iterated on
   several times — easy to introduce subtle ordering bugs here.

4. **Service worker** (`public/sw.js`). Handles four push types, two
   action buttons (Answer/Decline), navigation preload, three cache
   buckets, offline fallback. Worth sanity-checking the
   `notificationclick` handler and the cache eviction in `activate`.

5. **Twilio integration.** `lib/twilio.ts` + the phone-verification flow
   in `app/api/phone/`. The Verify flow is straightforward; the
   per-user channel preference (`sms` / `whatsapp` / `none`) governs
   the call-ring SMS. Sandboxed for now; production WhatsApp requires
   approved Content Templates.

6. **The admin moderation scanner.** `lib/moderation/profanity.ts` is
   intentionally a small word list (false positives kill review
   throughput). The admin can extend via `moderation_words` table.
   Auto-suspend in `app/api/admin/content-flags/auto-suspend/route.ts`
   refuses to suspend the calling admin. Worth a sanity check.

## Conventions Worth Knowing

- **`force-dynamic`** on every Server Component that touches Supabase
  (we can't statically render content that depends on auth state).
- **Service-role admin client** (`lib/supabase/admin.ts`) is used in
  server routes that need to bypass RLS, gated by `requireAdmin()` for
  any admin endpoint.
- **Versioned questionnaire** — adding/removing questions bumps a
  user-visible `questionnaire_version` int on `profiles`; all answers
  are keyed to a version.
- **CSS tokens in `app/globals.css`** drive the brand palette
  (`--accent`, `--gold`, `--rose-soft`, etc.). Most surfaces use them.
- **No barrel `index.ts`** in `lib/` — imports are explicit per file.
- **Tests** live next to the file they test (e.g. `lib/matching/score.test.ts`).
  Test runner: Vitest. Coverage is partial, not comprehensive.

## What's Not in the Bundle

- `.env.local` (obviously)
- `node_modules/`
- `.next/`
- `.git/`
- `package-lock.json`
- Database dumps, photo uploads

The bundle is generated by `scripts/export-codebase-for-review.mjs` and
covers app code + components + lib + migrations + tests + the few
config files that matter.

## How to Read the Bundle Efficiently

Each file starts with `===== relative/path/to/file =====` as a
delimiter. Search for that prefix to jump.

Recommended reading order if you only have an hour:

1. `README.md` (skim) — author's own framing
2. `supabase/migrations/001_initial.sql` — data model
3. `lib/matching/score.ts` + `app/api/discover/route.ts` — core IP
4. `app/api/livekit/token/route.ts` — call flow
5. `public/sw.js` + `lib/push-reconcile.ts` — push reliability
6. `components/Shell.tsx` + `components/GlobalRealtimeNotifications.tsx` — global UX glue
7. `app/admin/content/page.tsx` + `lib/moderation/profanity.ts` — moderation
8. Anything else that catches your eye

## Asks From The Reviewer

If you're up for it, the most valuable feedback would be:

1. **Security holes** — RLS gaps, unauth'd admin endpoints, exposed
   secrets in client bundles, XSS surfaces.
2. **Data integrity bugs** — places where cache invalidation, race
   conditions, or stale state would corrupt user-visible behavior.
3. **Code-smell concentrations** — areas where the AI-assisted
   velocity left technical debt that will compound.
4. **What you would have done differently** — high-level architecture
   takes, even if just one paragraph.

Thanks for taking the time. Send notes back as whatever format works
(GitHub issues, email, voice memo, whatever).

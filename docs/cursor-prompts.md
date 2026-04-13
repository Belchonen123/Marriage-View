# Operator-grade Cursor prompts (Marriage View)

Use these as **system-level** implementation briefs: they target scoring, ranking, retention, trust, chat depth, monetization hooks, and AI—not cosmetic tweaks.

The numbered roadmap in [README.md](../README.md) matches these tracks. Pick one prompt, implement end-to-end, then move to the next.

---

## Strategic gap (summary)

Marriage View today is strong **matching infrastructure** (onboarding, filters, scores, matches, chat, video). To become a **business**, it still needs: retention loops, trust depth, explainable match intelligence, a monetization spine, and optional behavioral / AI guidance.

---

## A. Compatibility engine 2.0

**Why:** Opaque scores erode trust. Explainability drives emotional buy-in.

**Prompt (copy into Cursor):**

```
Refactor the compatibility scoring system to a weighted, explainable model.

Requirements:
- Assign weights to question categories (values, lifestyle, religion, long-term goals)
- Normalize scores across different answer types (Likert, multi-select, etc.)
- Add a "dealbreaker override" system (hard filters that zero compatibility)
- Return:
  - total_score (0–100)
  - category breakdown
  - top 3 reasons for compatibility (human-readable)
- Store score snapshots to avoid recomputation

Expose results in /api/discover and show explanation in UI.
```

---

## B. Smart Discover feed

**Why:** Dead feeds kill perceived liquidity. Ranking should feel alive even with a small pool.

**Prompt:**

```
Enhance discover feed ranking algorithm.

Add:
- Recency boost (recently active users rank higher)
- Profile completeness score multiplier
- Engagement score (messages sent, replies, etc.)
- Diversity injection (avoid showing similar profiles consecutively)
- Fallback logic when candidate pool is low

Return ranked results with debug metadata for tuning.
```

---

## C. Retention engine

**Why:** No return loop, no business. Daily hooks and inactivity nudges matter more than another UI polish pass.

**Prompt:**

```
Implement a retention loop system.

Features:
- Daily batch job to:
  - Suggest 3 "high compatibility" profiles
  - Notify users (email or in-app)
- "You have new potential matches" notification logic
- Track user inactivity and trigger re-engagement nudges

Create table: user_engagement_events
Track:
  - last_active
  - session_count
  - matches_created
```

---

## D. Trust layer

**Why:** Dating without trust systems becomes a spam and harm vector.

**Prompt:**

```
Add trust and safety enhancements.

Features:
- Photo verification flag (manual or AI-ready placeholder)
- Report categories (harassment, spam, fake profile, etc.)
- Soft-ban system (shadow restrict users under review)
- Rate limiting on:
  - likes
  - messages
- Flag suspicious behavior patterns

Update admin panel for moderation workflows.
```

---

## E. Chat upgrade

**Why:** Matches are not the product; conversations are.

**Prompt:**

```
Enhance chat system UX.

Add:
- Typing indicators (Realtime)
- Read receipts per message
- Message status (sent/delivered/read)
- Simple reactions (e.g. thumbs up, heart)
- Auto-scroll + scroll position preservation

Optimize Supabase Realtime subscriptions for performance.
```

---

## F. Monetization layer

**Why:** Build entitlement switches before you integrate Stripe (or similar).

**Prompt:**

```
Introduce a feature flag system for premium features.

Add:
- unlimited_likes
- advanced_filters (height, religion, etc.)
- see_who_liked_you
- boost_profile

Create subscription table schema (no payment integration yet).
Gate features in UI + API.
```

---

## G. AI layer

**Why:** Server-side LLM usage can differentiate guidance and copy; keep PII and prompts on the server.

**Prompt:**

```
Integrate AI-assisted profile insights.

Features:
- Generate profile summaries from user inputs
- Suggest better bio phrasing
- Highlight compatibility insights between matched users
- Detect low-effort or empty profiles and suggest improvements

Use server-side API abstraction for LLM calls.
```

---

## If you only do three things (CEO order)

1. Upgrade compatibility scoring **with explanations** (A).
2. Add retention loops: daily suggestions + notifications (C).
3. Improve discover ranking so the app feels alive (B).

---

## Optional: external automation (Make.com-style)

Marriage View can stay the **system of record** while automation tools handle **scheduled digests**, **email sends**, and **CRM-style nudges** via:

- **Outbound:** Supabase **Database Webhooks** or **Edge Functions** firing on `matches`, `messages`, or engagement table changes.
- **Inbound:** Next.js **API routes** secured with a shared secret that receive calls from Make.com / Zapier (e.g. “send digest for user X”).
- **Scheduling:** Cron on your host, Vercel cron, or Supabase `pg_cron` to call those routes or enqueue jobs.

A full “autonomous matchmaker” design should specify: triggers, idempotency, rate limits, and PII boundaries before wiring no-code tools to production data.

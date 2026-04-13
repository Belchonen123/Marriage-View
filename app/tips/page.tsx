import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Marriage tips — Marriage View",
  description:
    "Marriage-minded dating tips for Marriage View: discover, light chat, video dates, values, and safety.",
};

const sections: { title: string; intro?: string; items: string[] }[] = [
  {
    title: "How Marriage View is meant to work",
    intro:
      "The platform is built for marriage-minded people who want real connection—not endless texting. Keep these ideas in mind as you use Discover, chat, and the Video Date Room.",
    items: [
      "Compatibility and values matter here; profiles and the questionnaire help you find people who align on what counts for the long term.",
      "Chat is for light coordination—agreeing on a time, a place to meet by video, and follow-up—not for carrying the whole relationship in DMs.",
      "Video Date Room is the main event: you see and hear each other, which fits how serious dating actually moves forward.",
    ],
  },
  {
    title: "Discover & first impressions",
    items: [
      "Read profiles fully; photos and prompts tell you more than a swipe habit.",
      "Be honest in your own profile—what you want in marriage, not just what sounds impressive.",
      "If someone isn’t a fit, a respectful pass keeps the pool healthy for both of you.",
    ],
  },
  {
    title: "Early messages & boundaries",
    items: [
      "Open with warmth and clarity: why you’re glad you matched, and that you’d like a short video call when they’re comfortable.",
      "Ask about values, routines, and goals at a pace that feels mutual—not an interrogation.",
      "Name your boundaries early (pace, topics, how you like to communicate). Marriage-minded dating respects limits.",
    ],
  },
  {
    title: "Video dates",
    items: [
      "Treat a video date like a real date: minimal distractions, decent lighting, and showing up on time.",
      "Have 2–3 open questions ready (family, faith or meaning, how they handle stress) and listen more than you pitch yourself.",
      "If it goes well, say so plainly and suggest a concrete next step (another call or an in-person plan when you’re both ready).",
    ],
  },
  {
    title: "Safety & respect",
    items: [
      "Don’t share financial details, passwords, or pressure anyone for photos or contact off-platform before trust is earned.",
      "Meet in public when you graduate to in-person, and tell someone you trust where you’re going.",
      "Use block and report if something feels off—you’re helping protect the whole community.",
    ],
  },
  {
    title: "When you’re serious about marriage",
    items: [
      "Alignment on major life decisions (faith, children, geography, money philosophy) deserves calm, repeated conversation—not one dramatic talk.",
      "Disagreement isn’t failure; contempt and stonewalling are. Notice how you both repair after tension.",
      "Involve wise people you trust (mentors, counselors, family where appropriate) before big commitments—not only your feelings in a vacuum.",
    ],
  },
];

export default async function TipsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Marriage-focused tips
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Practical guidance that matches how Marriage View works: thoughtful matching, short coordination chat, and{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">video dates</strong> as the path to something
          real—not endless messaging.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {sections.map((s) => (
          <section
            key={s.title}
            className="card-surface rounded-2xl border border-zinc-200/80 p-5 dark:border-zinc-700/80"
          >
            <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-50">{s.title}</h2>
            {s.intro ? (
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{s.intro}</p>
            ) : null}
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {s.items.map((item, i) => (
                <li key={`${s.title}-${i}`}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="rounded-2xl border border-rose-200/80 bg-rose-50/50 p-5 dark:border-rose-900/40 dark:bg-rose-950/30">
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">More on Marriage View</p>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <li>
            <Link href="/matches" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
              Matches &amp; chat
            </Link>
          </li>
          <li>
            <Link href="/coach" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
              Coach
            </Link>
          </li>
          <li>
            <Link href="/community" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
              Community guidelines
            </Link>
          </li>
          <li>
            <Link href="/settings" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
              Settings &amp; safety
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}

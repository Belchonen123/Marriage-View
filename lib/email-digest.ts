import "server-only";

type ResendEmail = { to: string; subject: string; html: string };

/**
 * Sends one email via Resend REST API. Returns false if not configured or request failed.
 */
export async function sendResendEmail({ to, subject, html }: ResendEmail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) return false;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  return res.ok;
}

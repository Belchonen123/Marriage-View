import "server-only";

import twilio from "twilio";

let cached: ReturnType<typeof twilio> | null = null;

function client() {
  if (cached) return cached;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  cached = twilio(sid, token);
  return cached;
}

export function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_VERIFY_SERVICE_SID,
  );
}

/** Normalize a user-typed number to strict E.164. Throws on obvious garbage. */
export function normalizePhone(input: string, defaultCountry: "US" = "US"): string {
  const digitsOnly = input.replace(/[^\d+]/g, "");
  if (digitsOnly.startsWith("+")) {
    if (!/^\+[1-9][0-9]{6,14}$/.test(digitsOnly)) {
      throw new Error("Phone number must be in E.164 format (e.g. +16465044236).");
    }
    return digitsOnly;
  }
  const just = digitsOnly.replace(/\D/g, "");
  if (defaultCountry === "US") {
    if (just.length === 10) return `+1${just}`;
    if (just.length === 11 && just.startsWith("1")) return `+${just}`;
  }
  throw new Error("Couldn't read that number. Try a 10-digit US number or +country format.");
}

/** Start a Twilio Verify SMS challenge. Returns the Verify SID for logging. */
export async function startVerify(phoneE164: string): Promise<{ sid: string } | { error: string }> {
  const c = client();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!c || !serviceSid) return { error: "Twilio is not configured on the server." };
  try {
    const v = await c.verify.v2
      .services(serviceSid)
      .verifications.create({ to: phoneE164, channel: "sms" });
    return { sid: v.sid };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not send verification code.";
    return { error: msg };
  }
}

/** Check a Twilio Verify code. Returns approved=true if the code matched. */
export async function checkVerify(
  phoneE164: string,
  code: string,
): Promise<{ approved: boolean } | { error: string }> {
  const c = client();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!c || !serviceSid) return { error: "Twilio is not configured on the server." };
  try {
    const check = await c.verify.v2
      .services(serviceSid)
      .verificationChecks.create({ to: phoneE164, code });
    return { approved: check.status === "approved" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not verify the code.";
    return { error: msg };
  }
}

/** Fire-and-forget SMS to a verified user. No-op when Twilio isn't configured. */
export async function sendSms(toE164: string, body: string): Promise<void> {
  const c = client();
  const from = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!c || !from) return;
  try {
    if (from.startsWith("MG")) {
      await c.messages.create({ to: toE164, messagingServiceSid: from, body });
    } else {
      await c.messages.create({ to: toE164, from, body });
    }
  } catch (e) {
    console.warn("[twilio] sendSms failed:", e instanceof Error ? e.message : e);
  }
}

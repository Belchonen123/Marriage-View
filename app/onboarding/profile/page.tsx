"use client";

import { createClient } from "@/lib/supabase/client";
import { CUSTOM_CITY_VALUE, METRO_OPTIONS } from "@/lib/location/metro-options";
import { reverseGeocodeLatLng } from "@/lib/location/reverse-geocode";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const GENDER_OPTIONS = ["woman", "man"] as const;

function normalizeGender(value: string | null | undefined): "" | "woman" | "man" {
  const v = value ?? "";
  if (v === "woman" || v === "man") return v;
  return "";
}

function seekingForGender(g: string): "man" | "woman" | null {
  if (g === "woman") return "man";
  if (g === "man") return "woman";
  return null;
}

export default function OnboardingProfilePage() {
  const supabase = useMemo(() => createClient(), []);
  const [displayName, setDisplayName] = useState("");
  const [birthYear, setBirthYear] = useState<number | "">("");
  const [city, setCity] = useState("");
  const [cityChoice, setCityChoice] = useState<string>("");
  const [bio, setBio] = useState("");
  const [gender, setGender] = useState<"" | "woman" | "man">("");
  const [ageMin, setAgeMin] = useState(22);
  const [ageMax, setAgeMax] = useState(45);
  const [maxKm, setMaxKm] = useState(200);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [locBusy, setLocBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (p) {
        setDisplayName(p.display_name ?? "");
        setBirthYear(p.birth_year ?? "");
        const c = (p.city ?? "").trim();
        setCity(c);
        const preset = METRO_OPTIONS.find((m) => m.label === c);
        if (preset) setCityChoice(preset.label);
        else if (c || (p.latitude != null && p.longitude != null)) setCityChoice(CUSTOM_CITY_VALUE);
        else setCityChoice("");
        setBio(p.bio ?? "");
        setGender(normalizeGender(p.gender));
        setAgeMin(p.age_min ?? 22);
        setAgeMax(p.age_max ?? 45);
        setMaxKm(p.max_distance_km ?? 200);
        setLat(p.latitude != null ? String(p.latitude) : "");
        setLng(p.longitude != null ? String(p.longitude) : "");
      }
      setLoading(false);
    })();
  }, [supabase]);

  function onMetroChange(value: string) {
    if (value === "" || value === CUSTOM_CITY_VALUE) {
      setCityChoice(value);
      if (value === "") {
        setCity("");
        setLat("");
        setLng("");
      }
      return;
    }
    const opt = METRO_OPTIONS.find((m) => m.label === value);
    if (!opt) return;
    setCityChoice(value);
    setCity(opt.label);
    setLat(String(opt.lat));
    setLng(String(opt.lng));
  }

  function clearPreciseLocation() {
    setLat("");
    setLng("");
  }

  async function useDeviceLocation() {
    setMsg(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMsg("Location is not available in this browser.");
      return;
    }
    setLocBusy(true);
    const ac = new AbortController();
    const t = window.setTimeout(() => ac.abort(), 18_000);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        window.clearTimeout(t);
        const la = pos.coords.latitude;
        const lo = pos.coords.longitude;
        setLat(la.toFixed(6));
        setLng(lo.toFixed(6));
        setCityChoice(CUSTOM_CITY_VALUE);
        try {
          const label = await reverseGeocodeLatLng(la, lo, ac.signal);
          if (label) setCity(label);
        } catch {
          /* keep existing city text */
        } finally {
          setLocBusy(false);
        }
      },
      () => {
        window.clearTimeout(t);
        setLocBusy(false);
        setMsg("Could not read your location. Check browser permissions or pick a metro from the list.");
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
    );
  }

  async function save() {
    setMsg(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMsg("Not signed in");
      return;
    }
    const latitude = lat === "" ? null : Number(lat);
    const longitude = lng === "" ? null : Number(lng);
    const birthYearVal = birthYear === "" ? null : Number(birthYear);
    if (birthYearVal !== null && !Number.isFinite(birthYearVal)) {
      setMsg("Birth year must be a valid number.");
      return;
    }

    if (gender !== "woman" && gender !== "man") {
      setMsg("Please select your gender.");
      return;
    }
    const seeking = gender === "woman" ? "man" : "woman";

    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          display_name: displayName.trim(),
          birth_year: birthYearVal,
          city: city.trim() || null,
          bio: bio.trim(),
          gender,
          seeking,
          age_min: ageMin,
          age_max: ageMax,
          max_distance_km: maxKm,
          latitude: Number.isFinite(latitude) ? latitude : null,
          longitude: Number.isFinite(longitude) ? longitude : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
      .select("id")
      .maybeSingle();

    if (error) {
      setMsg(error.message);
      return;
    }
    if (!data) {
      setMsg(
        "Could not save your profile. Often this means the database is missing permission to update your row (RLS). Check Supabase → profiles → Policies for insert/update on your own id, or sign out and back in.",
      );
      return;
    }
    setMsg("Saved.");
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  const hasCoords = lat !== "" && lng !== "";
  const customCity = cityChoice === CUSTOM_CITY_VALUE;
  const previewAge =
    birthYear === "" || typeof birthYear !== "number"
      ? null
      : (() => {
          const y = new Date().getFullYear() - birthYear;
          return y > 0 && y < 120 ? y : null;
        })();

  const saveButtonClass =
    "motion-tap w-full rounded-full bg-rose-700 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-rose-800 sm:w-auto sm:py-2";

  const derivedSeeking = seekingForGender(gender);

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-28 sm:pb-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Your profile
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Choose your gender below. Who you are seeking is set automatically to the opposite gender so matching stays
          aligned.
        </p>
      </div>

      <section
        id="onboarding-basics"
        className="card-surface motion-card space-y-4 border border-zinc-200/80 p-5 dark:border-zinc-800/80 scroll-mt-24"
      >
        <h2 className="font-display text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Basics
        </h2>
        <Field label="Display name">
          <input
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>
        <Field label="Birth year">
          <input
            type="number"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </Field>
        <Field label="Bio">
          <textarea
            className="min-h-[100px] w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </Field>
      </section>

      <section className="card-surface motion-card space-y-4 border border-zinc-200/80 p-5 dark:border-zinc-800/80">
        <h2 className="font-display text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Location
        </h2>
        <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/80 p-4 dark:border-zinc-700/80 dark:bg-zinc-900/40">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Where you are</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
            Choose a nearby metro (we use it for distance matching), use your device location for a precise pin, or type your city if it is not listed.
          </p>
          <div className="mt-3 space-y-3">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Metro area
              <select
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                value={cityChoice === CUSTOM_CITY_VALUE ? CUSTOM_CITY_VALUE : cityChoice}
                onChange={(e) => onMetroChange(e.target.value)}
              >
                <option value="">Select a metro…</option>
                {METRO_OPTIONS.map((m) => (
                  <option key={m.label} value={m.label}>
                    {m.label}
                  </option>
                ))}
                <option value={CUSTOM_CITY_VALUE}>My city is not listed — I will type it</option>
              </select>
            </label>
            {customCity ? (
              <Field label="City (as it should appear on your profile)">
                <input
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Springfield, MA"
                />
              </Field>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={locBusy}
                onClick={() => void useDeviceLocation()}
                className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)] disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-[var(--accent)]/50"
              >
                {locBusy ? "Getting location…" : "Use my current location"}
              </button>
              {hasCoords ? (
                <button
                  type="button"
                  onClick={clearPreciseLocation}
                  className="rounded-full border border-transparent px-4 py-2 text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  Clear precise pin
                </button>
              ) : null}
            </div>
            {hasCoords ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                Precise location saved for matching. Your profile still shows the city name above — not raw coordinates.
              </p>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                Without a precise pin, distance filters only apply when both people have coordinates saved.
              </p>
            )}
          </div>
        </div>
      </section>

      <section
        id="onboarding-partner-prefs"
        className="card-surface motion-card space-y-4 border border-zinc-200/80 p-5 dark:border-zinc-800/80 scroll-mt-24"
      >
        <h2 className="font-display text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Partner preferences
        </h2>
        <Field label="Your gender">
          <select
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={gender}
            onChange={(e) => setGender(e.target.value as "" | "woman" | "man")}
          >
            <option value="">Choose your gender…</option>
            {GENDER_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
        <div className="rounded-lg border border-zinc-200/80 bg-zinc-50/80 px-3 py-2.5 text-sm dark:border-zinc-700/80 dark:bg-zinc-900/40">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Seeking (their gender)</p>
          {derivedSeeking ? (
            <p className="mt-1 text-zinc-800 dark:text-zinc-200">
              You’re seeking: <span className="font-semibold capitalize">{derivedSeeking}</span>
            </p>
          ) : (
            <p className="mt-1 text-zinc-500 dark:text-zinc-500">Choose your gender to set who you’re seeking.</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Age min (preference)">
            <input
              type="number"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={ageMin}
              onChange={(e) => setAgeMin(Number(e.target.value))}
            />
          </Field>
          <Field label="Age max (preference)">
            <input
              type="number"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={ageMax}
              onChange={(e) => setAgeMax(Number(e.target.value))}
            />
          </Field>
        </div>
        <Field
          label="Max distance (km)"
          hint="Used when you have a precise location and the other person does too; otherwise discovery does not filter by distance."
        >
          <input
            type="number"
            min={1}
            max={20000}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={maxKm}
            onChange={(e) => setMaxKm(Number(e.target.value))}
          />
        </Field>
        <div className="hidden sm:block">
          <button type="button" onClick={() => void save()} className={saveButtonClass}>
            Save profile
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-zinc-50/90 to-white p-5 dark:border-zinc-700/80 dark:from-zinc-900/50 dark:to-zinc-950/80">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Discover preview
        </p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
          Roughly what others see on your card (photos are managed elsewhere).
        </p>
        <div className="motion-card mt-4 rounded-xl border border-zinc-200/80 bg-[var(--surface-elevated)] p-4 shadow-sm dark:border-zinc-700/80">
          <p className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {displayName.trim() || "Your name"}
            {previewAge != null ? (
              <span className="text-base font-normal text-zinc-600 dark:text-zinc-400"> · {previewAge}</span>
            ) : null}
          </p>
          {city.trim() ? (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{city.trim()}</p>
          ) : (
            <p className="mt-1 text-sm italic text-zinc-400">City not set yet</p>
          )}
          <p className="mt-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {bio.trim() || "No bio yet — say hello in a sentence or two."}
          </p>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
            Seeking:{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{derivedSeeking ?? "—"}</span>
          </p>
        </div>
      </section>

      {msg ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
          {msg}
        </p>
      ) : null}

      <div className="flex justify-between text-sm">
        <Link href="/login" className="text-rose-800 hover:underline dark:text-rose-200">
          ← Account
        </Link>
        <Link href="/onboarding/quiz" className="font-medium text-rose-800 hover:underline dark:text-rose-200">
          Questionnaire →
        </Link>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200/90 bg-[var(--surface-elevated)]/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-zinc-800/90 dark:shadow-black/20 sm:hidden">
        <div className="pointer-events-auto mx-auto max-w-lg">
          <button type="button" onClick={() => void save()} className={saveButtonClass}>
            Save profile
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
      {label}
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-[11px] font-normal leading-relaxed text-zinc-500 dark:text-zinc-500">{hint}</p> : null}
    </label>
  );
}

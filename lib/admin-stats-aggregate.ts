/** Pure aggregation helpers for admin dashboard (used by /api/admin/stats). */

export type ProfileStatsRow = {
  gender: string | null;
  seeking: string | null;
  birth_year: number | null;
  onboarding_complete: boolean;
  city: string | null;
  questionnaire_version: number;
  max_distance_km: number | null;
  age_min: number | null;
  age_max: number | null;
  photo_urls: string[] | null;
  bio: string | null;
  created_at: string;
  last_active_at: string | null;
};

const AGE_BUCKETS = [
  { label: "Under 18", test: (a: number) => a < 18 },
  { label: "18–24", test: (a: number) => a >= 18 && a <= 24 },
  { label: "25–29", test: (a: number) => a >= 25 && a <= 29 },
  { label: "30–34", test: (a: number) => a >= 30 && a <= 34 },
  { label: "35–39", test: (a: number) => a >= 35 && a <= 39 },
  { label: "40–44", test: (a: number) => a >= 40 && a <= 44 },
  { label: "45–54", test: (a: number) => a >= 45 && a <= 54 },
  { label: "55–64", test: (a: number) => a >= 55 && a <= 64 },
  { label: "65+", test: (a: number) => a >= 65 },
] as const;

const DIST_BUCKETS = [
  { label: "≤ 25 km", test: (d: number) => d <= 25 },
  { label: "26–50 km", test: (d: number) => d > 25 && d <= 50 },
  { label: "51–100 km", test: (d: number) => d > 50 && d <= 100 },
  { label: "101–250 km", test: (d: number) => d > 100 && d <= 250 },
  { label: "251–500 km", test: (d: number) => d > 250 && d <= 500 },
  { label: "> 500 km", test: (d: number) => d > 500 },
] as const;

const SPAN_BUCKETS = [
  { label: "≤ 5 yr span", test: (s: number) => s <= 5 },
  { label: "6–10 yr", test: (s: number) => s > 5 && s <= 10 },
  { label: "11–20 yr", test: (s: number) => s > 10 && s <= 20 },
  { label: "21–40 yr", test: (s: number) => s > 20 && s <= 40 },
  { label: "> 40 yr span", test: (s: number) => s > 40 },
] as const;

function labelOrUnspecified(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return s.length ? s : "Unspecified";
}

function increment(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

export function aggregateProfileStats(rows: ProfileStatsRow[], now: Date) {
  const year = now.getUTCFullYear();
  const monthKey = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  const ms7 = 7 * 24 * 60 * 60 * 1000;
  const ms30 = 30 * 24 * 60 * 60 * 1000;
  const cutoff7 = new Date(now.getTime() - ms7).toISOString();
  const cutoff30 = new Date(now.getTime() - ms30).toISOString();

  const ageBucketCounts = new Map<string, number>(AGE_BUCKETS.map((b) => [b.label, 0]));
  ageBucketCounts.set("Unknown age", 0);

  const genderMap = new Map<string, number>();
  const seekingMap = new Map<string, number>();
  const crossMap = new Map<string, number>();
  const quizVer = new Map<number, number>();
  const distMap = new Map<string, number>(DIST_BUCKETS.map((b) => [b.label, 0]));
  distMap.set("Unknown / unset", 0);
  const spanMap = new Map<string, number>(SPAN_BUCKETS.map((b) => [b.label, 0]));
  spanMap.set("Unknown prefs", 0);

  const signupsByMonth = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    signupsByMonth.set(monthKey(d), 0);
  }

  const cityNorm = new Map<string, { display: string; count: number }>();
  let unknownCity = 0;

  let birthYearMissing = 0;
  let onboarded = 0;
  let withBio = 0;
  let active7 = 0;
  let active30 = 0;

  const photoHist = new Map<string, number>([
    ["0 photos", 0],
    ["1 photo", 0],
    ["2 photos", 0],
    ["3 photos", 0],
    ["4+ photos", 0],
  ]);

  const ages: number[] = [];

  for (const r of rows) {
    if (r.onboarding_complete) onboarded++;

    const by = r.birth_year;
    if (by == null || by < 1900 || by > year + 1) {
      birthYearMissing++;
      ageBucketCounts.set("Unknown age", (ageBucketCounts.get("Unknown age") ?? 0) + 1);
    } else {
      const age = year - by;
      ages.push(age);
      let placed = false;
      for (const b of AGE_BUCKETS) {
        if (b.test(age)) {
          ageBucketCounts.set(b.label, (ageBucketCounts.get(b.label) ?? 0) + 1);
          placed = true;
          break;
        }
      }
      if (!placed) ageBucketCounts.set("Unknown age", (ageBucketCounts.get("Unknown age") ?? 0) + 1);
    }

    increment(genderMap, labelOrUnspecified(r.gender));
    increment(seekingMap, labelOrUnspecified(r.seeking));
    const g = labelOrUnspecified(r.gender);
    const sk = labelOrUnspecified(r.seeking);
    increment(crossMap, `${g} → ${sk}`);

    const v = r.questionnaire_version ?? 1;
    quizVer.set(v, (quizVer.get(v) ?? 0) + 1);

    const md = r.max_distance_km;
    if (md == null || Number.isNaN(md)) {
      distMap.set("Unknown / unset", (distMap.get("Unknown / unset") ?? 0) + 1);
    } else {
      let dplaced = false;
      for (const b of DIST_BUCKETS) {
        if (b.test(md)) {
          distMap.set(b.label, (distMap.get(b.label) ?? 0) + 1);
          dplaced = true;
          break;
        }
      }
      if (!dplaced) distMap.set("> 500 km", (distMap.get("> 500 km") ?? 0) + 1);
    }

    const amin = r.age_min;
    const amax = r.age_max;
    if (amin == null || amax == null) {
      spanMap.set("Unknown prefs", (spanMap.get("Unknown prefs") ?? 0) + 1);
    } else {
      const span = Math.max(0, amax - amin);
      let splaced = false;
      for (const b of SPAN_BUCKETS) {
        if (b.test(span)) {
          spanMap.set(b.label, (spanMap.get(b.label) ?? 0) + 1);
          splaced = true;
          break;
        }
      }
      if (!splaced) spanMap.set("> 40 yr span", (spanMap.get("> 40 yr span") ?? 0) + 1);
    }

    const created = new Date(r.created_at);
    const mk = monthKey(created);
    if (signupsByMonth.has(mk)) {
      signupsByMonth.set(mk, (signupsByMonth.get(mk) ?? 0) + 1);
    }

    const cityRaw = (r.city ?? "").trim();
    if (!cityRaw) {
      unknownCity++;
    } else {
      const key = cityRaw.toLowerCase();
      const cur = cityNorm.get(key);
      if (cur) cur.count++;
      else cityNorm.set(key, { display: cityRaw, count: 1 });
    }

    const urls = r.photo_urls ?? [];
    const n = urls.length;
    if (n === 0) photoHist.set("0 photos", (photoHist.get("0 photos") ?? 0) + 1);
    else if (n === 1) photoHist.set("1 photo", (photoHist.get("1 photo") ?? 0) + 1);
    else if (n === 2) photoHist.set("2 photos", (photoHist.get("2 photos") ?? 0) + 1);
    else if (n === 3) photoHist.set("3 photos", (photoHist.get("3 photos") ?? 0) + 1);
    else photoHist.set("4+ photos", (photoHist.get("4+ photos") ?? 0) + 1);

    const bio = (r.bio ?? "").trim();
    if (bio.length > 0) withBio++;

    const la = r.last_active_at;
    if (la) {
      if (la >= cutoff7) active7++;
      if (la >= cutoff30) active30++;
    }
  }

  ages.sort((a, b) => a - b);
  const medianAge =
    ages.length === 0 ? null : ages.length % 2 === 1 ? ages[(ages.length - 1) / 2]! : (ages[ages.length / 2 - 1]! + ages[ages.length / 2]!) / 2;

  const topCities = [...cityNorm.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 25)
    .map((c) => ({ city: c.display, count: c.count }));

  const mapToSorted = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

  const genderSeekingCross = [...crossMap.entries()]
    .map(([key, count]) => {
      const [gender, rest] = key.split(" → ");
      return { gender: gender ?? key, seeking: rest ?? "", count };
    })
    .sort((a, b) => b.count - a.count);

  const quizVersionList = [...quizVer.entries()]
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => a.version - b.version);

  const signupsList = [...signupsByMonth.entries()].map(([month, count]) => ({ month, count }));

  return {
    byAgeBucket: mapToSorted(ageBucketCounts),
    byGender: mapToSorted(genderMap),
    bySeeking: mapToSorted(seekingMap),
    genderSeekingCross,
    birthYearMissing,
    medianAge,
    quizVersion: quizVersionList,
    maxDistanceKm: mapToSorted(distMap),
    ageRangeSpan: mapToSorted(spanMap),
    photoCountHistogram: [...photoHist.entries()].map(([bucket, count]) => ({ bucket, count })),
    withBio,
    emptyBio: rows.length - withBio,
    onboardedComplete: onboarded,
    onboardedIncomplete: rows.length - onboarded,
    topCities,
    unknownCity,
    signupsByMonth: signupsList,
    activeLast7d: active7,
    activeLast30d: active30,
  };
}

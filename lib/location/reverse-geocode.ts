type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  county?: string;
  state?: string;
  country?: string;
};

type NominatimReverse = { address?: NominatimAddress; display_name?: string };

/** Best-effort place label from Nominatim reverse response (browser or server). */
export function placeLabelFromNominatim(data: NominatimReverse): string | null {
  const a = data.address;
  if (!a) return data.display_name?.split(",").slice(0, 2).join(",").trim() ?? null;
  const locality =
    a.city ?? a.town ?? a.village ?? a.hamlet ?? a.county ?? null;
  if (!locality) return data.display_name?.split(",").slice(0, 2).join(",").trim() ?? null;
  const region = a.state ?? a.country ?? "";
  const trimmed = region ? `${locality}, ${region}` : locality;
  return trimmed;
}

export async function reverseGeocodeLatLng(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "json");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "10");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url.toString(), {
    signal,
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as NominatimReverse;
  return placeLabelFromNominatim(data);
}

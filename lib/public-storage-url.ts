/** Public object URL for `profile-photos` bucket (no auth). */
export function profilePhotoPublicUrl(objectPath: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const enc = objectPath
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
  return `${base}/storage/v1/object/public/profile-photos/${enc}`;
}

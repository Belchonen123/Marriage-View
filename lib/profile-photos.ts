export const MAX_PROFILE_PHOTOS = 6;

export function normalizePhotoUrls(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
      }
    } catch {
      /* ignore */
    }
  }
  return [];
}

/** Known image extensions — used when the browser lies or omits MIME (common on Windows / some mobile WebViews). */
const IMAGE_FILENAME_EXT =
  /\.(jpe?g|jfif|png|gif|webp|bmp|heic|heif|avif|tiff?|svg|raw|cr2|nef|dng)$/i;

export function isProfileImageFile(f: File): boolean {
  const mime = (f.type || "").trim().toLowerCase();
  if (mime.startsWith("image/")) return true;
  // Many pickers send application/octet-stream (or empty type) but keep a real extension
  return IMAGE_FILENAME_EXT.test(f.name);
}

function matchesImageMagic(buf: Uint8Array): boolean {
  const n = buf.length;
  if (n < 3) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (n >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (n >= 4 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  if (
    n >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return true;
  }
  if (n >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) return true;
  if (n >= 4 && buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) return true;
  if (n >= 4 && buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a) return true;
  for (let i = 0; i <= Math.min(n - 12, 28); i++) {
    if (buf[i] === 0x66 && buf[i + 1] === 0x74 && buf[i + 2] === 0x79 && buf[i + 3] === 0x70) {
      const brand = String.fromCharCode(buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7]).toLowerCase();
      if (/^(heic|heix|hevc|heim|heis|mif1|msf1|avic|avif)/i.test(brand)) return true;
    }
  }
  return false;
}

/**
 * Accept photos when MIME/extension lie (common on Windows / iOS / WebViews).
 * Uses file header sniffing as a fallback.
 */
export async function fileLooksLikeImage(f: File): Promise<boolean> {
  if (isProfileImageFile(f)) return true;
  if (f.size === 0) return false;
  const sliceLen = Math.min(32, f.size);
  const buf = new Uint8Array(await f.slice(0, sliceLen).arrayBuffer());
  if (matchesImageMagic(buf)) return true;
  if (buf.length > 0 && buf[0] === 0x3c) {
    const text = await f.slice(0, Math.min(400, f.size)).text();
    if (/^\s*<\?xml/i.test(text) || /^\s*<svg/i.test(text)) return true;
  }
  return false;
}

export function storagePathFromProfilePhotoUrl(publicUrl: string): string | null {
  try {
    const u = new URL(publicUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    const bucketIdx = parts.indexOf("profile-photos");
    if (bucketIdx === -1 || bucketIdx === parts.length - 1) return null;
    return parts.slice(bucketIdx + 1).join("/");
  } catch {
    return null;
  }
}

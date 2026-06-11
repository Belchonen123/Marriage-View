import Link from "next/link";

type Size = "sm" | "md" | "lg" | "xl";

type BrandLockupProps = {
  size?: Size;
  showTagline?: boolean;
  asLink?: boolean;
  className?: string;
};

const SIZES: Record<Size, { word: string; mark: string; gap: string; tag: string }> = {
  sm: { word: "text-lg", mark: "h-7 w-7", gap: "gap-2", tag: "text-[10px]" },
  md: { word: "text-2xl", mark: "h-9 w-9", gap: "gap-2.5", tag: "text-xs" },
  lg: { word: "text-4xl", mark: "h-12 w-12", gap: "gap-3", tag: "text-sm" },
  xl: { word: "text-5xl lg:text-6xl", mark: "h-16 w-16", gap: "gap-4", tag: "text-sm" },
};

/**
 * The Marriage View brand lockup — heart+ring+camera mark + serif wordmark.
 * Burgundy "Marriage" + gold "View", per the brand sheet.
 *
 * Renders the wordmark with the loaded Fraunces font (CSS variable
 * --font-display) so it inherits the page's typography — fonts inside SVG
 * <img> don't reliably load on iOS Safari.
 */
export function BrandLockup({
  size = "md",
  showTagline = false,
  asLink = false,
  className,
}: BrandLockupProps) {
  const s = SIZES[size];

  const inner = (
    <span className={`inline-flex items-center ${s.gap} ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icon.svg"
        alt=""
        aria-hidden
        className={`${s.mark} shrink-0`}
      />
      <span className="inline-flex flex-col leading-none">
        <span className={`font-display ${s.word} font-semibold tracking-tight`}>
          <span className="text-[var(--accent)]">Marriage</span>{" "}
          <span style={{ color: "var(--gold, #D4AF37)" }}>View</span>
        </span>
        {showTagline ? (
          <span
            className={`mt-2 font-display ${s.tag} font-medium uppercase tracking-[0.28em]`}
            style={{ color: "var(--accent, #7A0F2E)" }}
          >
            <span style={{ color: "var(--gold, #D4AF37)" }}>—&nbsp;</span>
            Video dating for marriage-minded singles
            <span style={{ color: "var(--gold, #D4AF37)" }}>&nbsp;—</span>
          </span>
        ) : null}
      </span>
    </span>
  );

  if (asLink) {
    return (
      <Link
        href="/"
        aria-label="Marriage View — Home"
        className="input-focus inline-flex rounded-md transition-opacity hover:opacity-90"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

export default BrandLockup;

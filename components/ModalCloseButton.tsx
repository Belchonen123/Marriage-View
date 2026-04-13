"use client";

import type { ButtonHTMLAttributes } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children"> & {
  "aria-label"?: string;
};

/** Shared X control for dialogs and overlays — matches CoachModal / MemberProfileModal styling. */
export function ModalCloseButton({
  className = "",
  disabled,
  "aria-label": ariaLabel = "Close",
  ...rest
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      className={`input-focus rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 disabled:opacity-50 ${className}`}
      {...rest}
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Variant = "info" | "success" | "error";

export type ToastAction = {
  label: string;
  onClick: () => void;
  /** Default: primary (accent). Use secondary/outline or ghost for extra actions on multi-button tips. */
  variant?: "primary" | "secondary" | "ghost";
};

type ToastItem = {
  id: number;
  message: string;
  variant: Variant;
  actions?: ToastAction[];
  durationMs: number;
};

type ToastContextValue = {
  show: (message: string, variant?: Variant, options?: { actions?: ToastAction[]; durationMs?: number }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx ?? { show: () => {} };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const t = timersRef.current.get(id);
    if (t) clearTimeout(t);
    timersRef.current.delete(id);
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (
      message: string,
      variant: Variant = "info",
      options?: { actions?: ToastAction[]; durationMs?: number },
    ) => {
      const id = ++idRef.current;
      const durationMs = options?.durationMs ?? (options?.actions?.length ? 12_000 : 4200);
      const item: ToastItem = {
        id,
        message,
        variant,
        actions: options?.actions,
        durationMs,
      };
      setToasts((t) => [...t, item]);
      const timer = setTimeout(() => dismiss(id), durationMs);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))]"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-md animate-card-in rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-md ${
              t.variant === "error"
                ? "border-red-200/90 bg-red-50/95 text-red-950 dark:border-red-900/50 dark:bg-red-950/80 dark:text-red-100"
                : t.variant === "success"
                  ? "border-emerald-200/90 bg-emerald-50/95 text-emerald-950 dark:border-emerald-800/50 dark:bg-emerald-950/70 dark:text-emerald-100"
                  : "border-zinc-200/90 bg-[var(--surface-elevated)]/95 text-zinc-900 shadow-[var(--shadow-card)] dark:border-zinc-700/90 dark:bg-zinc-900/95 dark:text-zinc-50"
            }`}
            role="status"
          >
            <p>{t.message}</p>
            {t.actions?.length ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                {t.actions.map((a, i) => {
                  const v = a.variant ?? "primary";
                  const cls =
                    v === "ghost"
                      ? "rounded-full px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      : v === "secondary"
                        ? "rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                        : "cta-video-primary px-3 py-1.5 text-xs";
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        a.onClick();
                        dismiss(t.id);
                      }}
                      className={`min-h-9 w-full sm:w-auto ${cls}`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

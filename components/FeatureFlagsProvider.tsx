"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Flags = Record<string, boolean>;

const FeatureFlagsContext = createContext<Flags>({});

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<Flags>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/feature-flags");
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      setFlags((data.flags ?? {}) as Flags);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <FeatureFlagsContext.Provider value={flags}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags(): Flags {
  return useContext(FeatureFlagsContext);
}

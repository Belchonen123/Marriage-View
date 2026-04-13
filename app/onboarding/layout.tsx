import { OnboardingChrome } from "@/components/onboarding/OnboardingChrome";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 pb-28 sm:px-6 sm:pb-16">
      <OnboardingChrome />
      {children}
    </div>
  );
}

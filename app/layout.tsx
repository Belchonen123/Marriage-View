import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { FeatureFlagsProvider } from "@/components/FeatureFlagsProvider";
import { GlobalRealtimeNotifications } from "@/components/GlobalRealtimeNotifications";
import { PwaInstall } from "@/components/PwaInstall";
import { Shell } from "@/components/Shell";
import { ThemeSync } from "@/components/ThemeSync";
import { ToastProvider } from "@/components/ToastProvider";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: "Marriage View — The Video Dating Platform",
  description:
    "Marriage View is the video dating platform for marriage-focused people: thoughtful matching, light chat to coordinate, and real video dates.",
  applicationName: "Marriage View",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Marriage View",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#be123c" },
    { media: "(prefers-color-scheme: dark)", color: "#881337" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeBootstrap = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var s=localStorage.getItem(k);var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col text-[var(--foreground)]">
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <ToastProvider>
          <ThemeSync />
          <GlobalRealtimeNotifications />
          <FeatureFlagsProvider>
            <Shell>{children}</Shell>
            <PwaInstall />
          </FeatureFlagsProvider>
        </ToastProvider>
      </body>
    </html>
  );
}

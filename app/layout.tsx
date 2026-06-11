import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
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
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon-32.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#7A0F2E" },
    { media: "(prefers-color-scheme: dark)", color: "#5C0822" },
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
          <AnalyticsProvider />
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

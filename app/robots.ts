import type { MetadataRoute } from "next";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://www.marriageview.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/terms", "/privacy"],
        disallow: [
          "/admin",
          "/api",
          "/auth",
          "/chat",
          "/coach",
          "/community",
          "/discover",
          "/likes",
          "/matches",
          "/messages",
          "/onboarding",
          "/profile",
          "/settings",
          "/share",
          "/tips",
          "/offline",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}

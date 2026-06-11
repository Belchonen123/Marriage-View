/* global self, caches, fetch, URL, Response */
const VERSION = "mv-v5-reconcile";
const STATIC_CACHE = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;
const IMAGE_CACHE = `images-${VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/badge-96.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch {
            /* ignore individual precache failures */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(k))
          .map((k) => caches.delete(k)),
      );
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          /* ignore */
        }
      }
      await self.clients.claim();
    })(),
  );
});

const isHTML = (request) =>
  request.mode === "navigate" ||
  (request.method === "GET" &&
    request.headers.get("accept")?.includes("text/html"));

const isStaticAsset = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  /\.(?:js|css|woff2?|ttf|otf|eot|svg|ico)$/i.test(url.pathname);

const isImage = (request, url) =>
  request.destination === "image" || /\.(?:png|jpe?g|webp|gif|avif)$/i.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Skip Next.js data/RSC and API endpoints — always network.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data/") ||
    url.pathname.startsWith("/_next/image") ||
    url.searchParams.has("_rsc")
  ) {
    return;
  }

  if (isHTML(request)) {
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse;
          if (preload) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, preload.clone()).catch(() => {});
            return preload;
          }
          const network = await fetch(request);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, network.clone()).catch(() => {});
          return network;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          return (
            offline ||
            new Response("<h1>You're offline</h1>", {
              status: 503,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            })
          );
        }
      })(),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const network = await fetch(request);
          if (network.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, network.clone()).catch(() => {});
          }
          return network;
        } catch {
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  if (isImage(request, url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const network = await fetch(request);
          if (network.ok) {
            const cache = await caches.open(IMAGE_CACHE);
            cache.put(request, network.clone()).catch(() => {});
          }
          return network;
        } catch {
          return cached || Response.error();
        }
      })(),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function matchIdFromTag(tag) {
  if (typeof tag !== "string") return null;
  const m = tag.match(/^call-(.+)$/);
  return m ? m[1] : null;
}

self.addEventListener("push", (event) => {
  let data = { title: "Marriage View", body: "", url: "/matches", type: null, tag: null };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    /* ignore */
  }

  const isCall = data.type === "call";
  const url = data.url || "/matches";
  const tag = data.tag || (isCall ? "call" : undefined);
  const matchId = matchIdFromTag(tag);

  const options = isCall
    ? {
        body: data.body,
        icon: "/icon-192.png",
        badge: "/badge-96.png",
        tag,
        renotify: true,
        requireInteraction: true,
        vibrate: [300, 100, 300, 100, 300],
        actions: [
          { action: "answer", title: "Answer" },
          { action: "decline", title: "Decline" },
        ],
        data: { url, matchId, type: "call" },
      }
    : {
        body: data.body,
        icon: "/icon-192.png",
        badge: "/badge-96.png",
        tag,
        data: { url, type: data.type ?? null },
      };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

async function focusOrOpen(url) {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of all) {
    if (c.url.startsWith(self.location.origin) && "focus" in c) {
      await c.focus();
      if ("navigate" in c && typeof c.navigate === "function") {
        await c.navigate(url);
      }
      return;
    }
  }
  if (self.clients.openWindow) await self.clients.openWindow(url);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const action = event.action;
  const raw = d.url || "/matches";
  const url = new URL(raw, self.location.origin).href;

  if (action === "decline" && d.type === "call" && d.matchId) {
    event.waitUntil(
      fetch("/api/call-signal/dismiss", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: d.matchId }),
      }).catch(() => {
        /* ignore */
      }),
    );
    return;
  }

  // "answer" or plain body click → open or focus and navigate to url
  event.waitUntil(focusOrOpen(url));
});

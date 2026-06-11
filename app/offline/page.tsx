export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-5xl">📡</div>
      <h1 className="text-2xl font-semibold">You're offline</h1>
      <p className="text-sm opacity-75">
        Marriage View needs a connection to load new matches and messages.
        Reconnect and try again — your last viewed pages are still available.
      </p>
      <a
        href="/discover"
        className="rounded-full bg-rose-700 px-5 py-2 text-sm font-medium text-white"
      >
        Try again
      </a>
    </main>
  );
}

/** Admin panel client fetches must send cookies (session) to Route Handlers. */
export function adminApiFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, credentials: "include" });
}

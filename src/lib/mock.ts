// Dev-only mock mode. Run `npm run dev:mock` (sets VITE_MOCK=1) or append ?mock to the URL
// during `npm run dev`. When on, the Turnkey network layer is short-circuited with
// deterministic fake data so the whole keys → wallet → export → reveal flow can be clicked
// through WITHOUT a real, live-verifiable Recovery Kit.
//
// It is gated on import.meta.env.DEV, so it is DEAD in any production build (`vite build`):
// even ?mock on the live site is ignored and every call hits api.turnkey.com as before.

const mockRequested =
  import.meta.env.VITE_MOCK === '1' ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('mock'))

export const IS_MOCK = import.meta.env.DEV && mockRequested

/** Stable short id derived from a string (djb2) — distinct input → distinct id. */
export function mockId(seed: string): string {
  let h = 5381
  for (let i = 0; i < seed.length; i += 1) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/** Small artificial latency so loading/verifying states are actually visible in mock mode. */
export function mockDelay(ms = 450): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

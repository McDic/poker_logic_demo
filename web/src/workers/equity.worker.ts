// Web Worker that computes exact equity off the main thread.
// Communicates via JSON messages — no SharedArrayBuffer needed.

import init, { computeEquity } from "../wasm/black_dealing";
import type { Card, Hand } from "../lib/cards";

declare const self: DedicatedWorkerGlobalScope;

export interface EquityRequest {
  id: number;
  hands: Hand[];
  community: Card[];
}

export type EquityResponse =
  | { id: number; ok: true; values: number[]; boardCount: number }
  | { id: number; ok: false; error: string };

let initPromise: Promise<unknown> | null = null;

function ensureInit(): Promise<unknown> {
  if (!initPromise) initPromise = init();
  return initPromise;
}

self.addEventListener("message", async (event: MessageEvent<EquityRequest>) => {
  const { id, hands, community } = event.data;
  try {
    await ensureInit();
    // The wasm-bindgen type for computeEquity is `Array<any>` because
    // the underlying signature is `js_sys::Array`. Casting to the
    // expected runtime shape is safe here.
    const eq = computeEquity(
      hands.map((h) => [h[0], h[1]]),
      [...community],
    );
    try {
      const response: EquityResponse = {
        id,
        ok: true,
        values: Array.from(eq.values),
        boardCount: eq.boardCount,
      };
      self.postMessage(response);
    } finally {
      eq.free();
    }
  } catch (err) {
    const response: EquityResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
});

// Web Worker that owns a DealingTable and handles two message types:
//   - "build":  build a new table from hands + community. Replies with
//               equities + boardCount.
//   - "sample": sample one biased runout from the current table.
// The table lives in WASM memory inside the worker between messages,
// so flipping weight sliders only re-samples; it doesn't rebuild.

import init, { DealingTable, Trial } from "../wasm/black_dealing";
import type { Card, Hand } from "../lib/cards";

declare const self: DedicatedWorkerGlobalScope;

export interface BuildRequest {
  type: "build";
  id: number;
  hands: Hand[];
  community: Card[];
}
export interface SampleRequest {
  type: "sample";
  id: number;
  weights: number[];
}
export type DealerRequest = BuildRequest | SampleRequest;

export type BuildResponse =
  | { type: "built"; id: number; ok: true; equities: number[]; boardCount: number }
  | { type: "built"; id: number; ok: false; error: string };
export type SampleResponse =
  | {
      type: "trial";
      id: number;
      ok: true;
      winnerIndex: number;
      board: string[];
      chopped: boolean;
    }
  | { type: "trial"; id: number; ok: false; error: string };
export type DealerResponse = BuildResponse | SampleResponse;

let initPromise: Promise<unknown> | null = null;
let table: DealingTable | null = null;

function ensureInit(): Promise<unknown> {
  if (!initPromise) initPromise = init();
  return initPromise;
}

function disposeTable() {
  if (table) {
    table.free();
    table = null;
  }
}

self.addEventListener("message", async (event: MessageEvent<DealerRequest>) => {
  const req = event.data;
  try {
    await ensureInit();
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const failType: "built" | "trial" = req.type === "build" ? "built" : "trial";
    self.postMessage({ type: failType, id: req.id, ok: false, error });
    return;
  }

  if (req.type === "build") {
    disposeTable();
    try {
      const next = new DealingTable(
        req.hands.map((h) => [h[0], h[1]]),
        [...req.community],
      );
      table = next;
      const response: BuildResponse = {
        type: "built",
        id: req.id,
        ok: true,
        equities: Array.from(next.equities),
        boardCount: next.boardCount,
      };
      self.postMessage(response);
    } catch (err) {
      const response: BuildResponse = {
        type: "built",
        id: req.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
      self.postMessage(response);
    }
    return;
  }

  // sample
  if (!table) {
    const response: SampleResponse = {
      type: "trial",
      id: req.id,
      ok: false,
      error: "No dealing table built yet",
    };
    self.postMessage(response);
    return;
  }
  let trial: Trial | null = null;
  try {
    trial = table.sampleTrial(new Float64Array(req.weights));
    const response: SampleResponse = {
      type: "trial",
      id: req.id,
      ok: true,
      winnerIndex: trial.winnerIndex,
      board: trial.board,
      chopped: trial.chopped,
    };
    self.postMessage(response);
  } catch (err) {
    const response: SampleResponse = {
      type: "trial",
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  } finally {
    trial?.free();
  }
});

// Web Worker that owns a DealingTable and handles four message types:
//   - "build":  build a new table from hands + community → equities + boardCount.
//   - "sample": one biased runout from the current table.
//   - "stream": run N trials in cooperative batches, posting progress events.
//   - "stop":   request the active stream to halt at the next batch boundary.
//
// The table lives in WASM memory inside the worker between messages.
// The stream loop yields to the event loop with setTimeout(0) between
// batches so stop messages get processed reentrantly.

import init, { BatchResult, DealingTable, Trial } from "../wasm/black_dealing";
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
export interface StreamRequest {
  type: "stream";
  id: number;
  weights: number[];
  totalTrials: number;
  batchSize: number;
}
export interface StopRequest {
  type: "stop";
  id: number;
}
export type DealerRequest =
  | BuildRequest
  | SampleRequest
  | StreamRequest
  | StopRequest;

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
export type StreamProgressResponse = {
  type: "stream-progress";
  id: number;
  trials: number;
  counts: number[];
  chops: number;
};
export type StreamFinishResponse =
  | {
      type: "stream-finish";
      id: number;
      ok: true;
      stopped: boolean;
      trials: number;
      counts: number[];
      chops: number;
    }
  | { type: "stream-finish"; id: number; ok: false; error: string };
export type DealerResponse =
  | BuildResponse
  | SampleResponse
  | StreamProgressResponse
  | StreamFinishResponse;

let initPromise: Promise<unknown> | null = null;
let table: DealingTable | null = null;
let currentStream: { id: number; stopRequested: boolean } | null = null;

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

function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

self.addEventListener("message", async (event: MessageEvent<DealerRequest>) => {
  const req = event.data;

  if (req.type === "stop") {
    if (currentStream && currentStream.id === req.id) {
      currentStream.stopRequested = true;
    }
    return;
  }

  try {
    await ensureInit();
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    if (req.type === "build") {
      self.postMessage({ type: "built", id: req.id, ok: false, error });
    } else if (req.type === "sample") {
      self.postMessage({ type: "trial", id: req.id, ok: false, error });
    } else {
      self.postMessage({ type: "stream-finish", id: req.id, ok: false, error });
    }
    return;
  }

  if (req.type === "build") {
    handleBuild(req);
    return;
  }
  if (req.type === "sample") {
    handleSample(req);
    return;
  }
  if (req.type === "stream") {
    await handleStream(req);
    return;
  }
});

function handleBuild(req: BuildRequest): void {
  // A new build invalidates any active stream and the previous table.
  if (currentStream) currentStream.stopRequested = true;
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
}

function handleSample(req: SampleRequest): void {
  if (!table) {
    self.postMessage({
      type: "trial",
      id: req.id,
      ok: false,
      error: "No dealing table built yet",
    });
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
    self.postMessage({
      type: "trial",
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    trial?.free();
  }
}

async function handleStream(req: StreamRequest): Promise<void> {
  if (!table) {
    self.postMessage({
      type: "stream-finish",
      id: req.id,
      ok: false,
      error: "No dealing table built yet",
    });
    return;
  }
  const stream = { id: req.id, stopRequested: false };
  currentStream = stream;
  const n = req.weights.length;
  const counts = new Array<number>(n).fill(0);
  let chops = 0;
  let trials = 0;
  const total = Math.max(0, Math.floor(req.totalTrials));
  const batchSize = Math.max(1, Math.floor(req.batchSize));
  const weights = new Float64Array(req.weights);

  try {
    while (trials < total && !stream.stopRequested) {
      if (!table) {
        throw new Error("dealing table was disposed mid-stream");
      }
      const remaining = total - trials;
      const thisBatch = Math.min(batchSize, remaining);
      const batch: BatchResult = table.sampleBatch(weights, thisBatch);
      try {
        const c = batch.counts;
        for (let i = 0; i < n; i++) counts[i] += c[i];
        chops += batch.chops;
      } finally {
        batch.free();
      }
      trials += thisBatch;
      const progress: StreamProgressResponse = {
        type: "stream-progress",
        id: req.id,
        trials,
        counts: counts.slice(),
        chops,
      };
      self.postMessage(progress);
      // Yield to allow stop / build messages to be processed.
      await yieldToEventLoop();
    }
    const finish: StreamFinishResponse = {
      type: "stream-finish",
      id: req.id,
      ok: true,
      stopped: stream.stopRequested,
      trials,
      counts,
      chops,
    };
    self.postMessage(finish);
  } catch (err) {
    self.postMessage({
      type: "stream-finish",
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    if (currentStream === stream) currentStream = null;
  }
}

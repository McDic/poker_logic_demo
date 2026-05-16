import type { Card, Hand } from "./cards";
import type { EquityReport } from "./equity";
import type {
  BuildResponse,
  DealerRequest,
  DealerResponse,
  SampleResponse,
} from "../workers/dealer.worker";

export interface TrialResult {
  winnerIndex: number;
  board: string[];
  chopped: boolean;
}

export interface DealerHandlers {
  onBuilt: (report: EquityReport) => void;
  onBuildError: (message: string) => void;
  onSampled: (trial: TrialResult) => void;
  onSampleError: (message: string) => void;
}

/**
 * Manages a long-lived worker that owns a DealingTable.
 *
 * - `build()` always replaces the in-flight build (terminating the worker
 *   if it's busy) and invalidates the previous table.
 * - `sample()` posts to the existing worker. It is only safe to call after
 *   the most recent `build()` has resolved (caller's responsibility);
 *   responses for stale ids are dropped.
 */
export class DealerRunner {
  private worker: Worker | null = null;
  private latestBuildId = 0;
  private latestSampleId = 0;
  private buildInFlight = false;
  private disposed = false;

  constructor(private handlers: DealerHandlers) {}

  build(hands: Hand[], community: Card[]): void {
    if (this.disposed) return;
    // A new build cancels everything older — terminate any running worker so
    // a stale 7s preflop build doesn't keep burning CPU.
    this.terminate();
    this.ensureWorker();
    this.latestBuildId += 1;
    this.buildInFlight = true;
    const msg: DealerRequest = {
      type: "build",
      id: this.latestBuildId,
      hands,
      community,
    };
    this.worker!.postMessage(msg);
  }

  sample(weights: number[]): void {
    if (this.disposed) return;
    if (!this.worker || this.buildInFlight) return;
    this.latestSampleId += 1;
    const msg: DealerRequest = {
      type: "sample",
      id: this.latestSampleId,
      weights,
    };
    this.worker.postMessage(msg);
  }

  cancel(): void {
    this.terminate();
  }

  dispose(): void {
    this.disposed = true;
    this.terminate();
  }

  private terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.buildInFlight = false;
  }

  private ensureWorker(): void {
    if (this.worker) return;
    this.worker = new Worker(
      new URL("../workers/dealer.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = (event: MessageEvent<DealerResponse>) => {
      const msg = event.data;
      if (msg.type === "built") this.handleBuilt(msg);
      else if (msg.type === "trial") this.handleSample(msg);
    };
    this.worker.onerror = (event) => {
      this.buildInFlight = false;
      this.handlers.onBuildError(
        `Dealer worker crashed: ${event.message || "unknown error"}`,
      );
    };
  }

  private handleBuilt(msg: BuildResponse): void {
    if (msg.id !== this.latestBuildId) return;
    this.buildInFlight = false;
    if (msg.ok) {
      this.handlers.onBuilt({
        values: msg.equities,
        boardCount: msg.boardCount,
      });
    } else {
      this.handlers.onBuildError(msg.error);
    }
  }

  private handleSample(msg: SampleResponse): void {
    if (msg.id !== this.latestSampleId) return;
    if (msg.ok) {
      this.handlers.onSampled({
        winnerIndex: msg.winnerIndex,
        board: msg.board,
        chopped: msg.chopped,
      });
    } else {
      this.handlers.onSampleError(msg.error);
    }
  }
}

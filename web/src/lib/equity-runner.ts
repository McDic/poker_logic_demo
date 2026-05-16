import type { Card, Hand } from "./cards";
import type { EquityReport } from "./equity";
import type {
  EquityRequest,
  EquityResponse,
} from "../workers/equity.worker";

export interface RunnerHandlers {
  onResult: (report: EquityReport) => void;
  onError: (message: string) => void;
}

/**
 * Manages a single equity-calculation Web Worker.
 *
 * Each `request()` increments a monotonic id. Responses whose id is not
 * the latest are ignored (stale). If a new request arrives while one is
 * already in flight, the worker is terminated and replaced — the active
 * computation is cancelled and a fresh one starts immediately. When the
 * worker is idle, posting a new request reuses the existing worker so we
 * don't pay re-init cost on every cheap (flop/turn) request.
 */
export class EquityRunner {
  private worker: Worker | null = null;
  private currentId: number | null = null;
  private latestId = 0;
  private disposed = false;

  constructor(private handlers: RunnerHandlers) {}

  request(hands: Hand[], community: Card[]): void {
    if (this.disposed) return;
    this.latestId += 1;
    const id = this.latestId;
    if (this.currentId !== null) {
      // Worker is busy with stale work — kill and replace.
      this.terminate();
    }
    this.ensureWorker();
    this.currentId = id;
    const msg: EquityRequest = { id, hands, community };
    this.worker!.postMessage(msg);
  }

  cancel(): void {
    if (this.currentId !== null) this.terminate();
  }

  dispose(): void {
    this.disposed = true;
    this.terminate();
  }

  private terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.currentId = null;
  }

  private ensureWorker(): void {
    if (this.worker) return;
    this.worker = new Worker(
      new URL("../workers/equity.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = (event: MessageEvent<EquityResponse>) => {
      const msg = event.data;
      if (msg.id !== this.latestId) return; // ignore stale
      this.currentId = null;
      if (msg.ok) {
        this.handlers.onResult({
          values: msg.values,
          boardCount: msg.boardCount,
        });
      } else {
        this.handlers.onError(msg.error);
      }
    };
    this.worker.onerror = (event) => {
      this.currentId = null;
      this.handlers.onError(
        `Equity worker crashed: ${event.message || "unknown error"}`,
      );
    };
  }
}

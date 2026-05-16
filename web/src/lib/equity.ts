import { computeEquity } from "../wasm/black_dealing";
import type { Card, Hand } from "./cards";

export interface EquityReport {
  /** Per-player equity in [0, 1], same order as input. */
  values: number[];
  /** Total number of future runouts enumerated. */
  boardCount: number;
}

/**
 * Compute exact equity for every player across all future runouts.
 * Requires `ensureWasm()` to have resolved before being called.
 *
 * Throws if the WASM layer rejects the input (invalid card, duplicate,
 * fewer than 2 players, community of 1/2/>5 cards).
 */
export function exactEquity(
  players: ReadonlyArray<Hand>,
  community: ReadonlyArray<Card>,
): EquityReport {
  const playersArr: Card[][] = players.map((h) => [h[0], h[1]]);
  const eq = computeEquity(playersArr, [...community]);
  try {
    return {
      values: Array.from(eq.values),
      boardCount: eq.boardCount,
    };
  } finally {
    eq.free();
  }
}

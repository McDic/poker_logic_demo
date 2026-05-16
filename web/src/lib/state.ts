// Pure state model + reducer for the card input UI.
// No React imports — kept framework-agnostic so the underlying logic
// survives any later UI swap.

import type { Card, Hand } from "./cards";
import type { EquityReport } from "./equity";
import type { TrialResult } from "./dealer-runner";

export type Slot = Card | null;
export type HandSlots = [Slot, Slot];
export type CommunitySlots = [Slot, Slot, Slot, Slot];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const DEFAULT_WEIGHT = 50;

export type PickerTarget =
  | { kind: "hand"; player: number; index: 0 | 1 }
  | { kind: "community"; index: 0 | 1 | 2 | 3 };

export type EquityState =
  | { kind: "idle" }
  | { kind: "computing" }
  | { kind: "ready"; report: EquityReport }
  | { kind: "error"; message: string };

export type TrialState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "ready"; trial: TrialResult }
  | { kind: "error"; message: string };

export interface StreamRun {
  /** Weights as configured at the moment Start was clicked (frozen). */
  weights: number[];
  total: number;
  trials: number;
  counts: number[];
  chops: number;
}

export type StreamState =
  | { kind: "idle" }
  | { kind: "running"; run: StreamRun }
  | { kind: "stopped"; run: StreamRun }
  | { kind: "done"; run: StreamRun }
  | { kind: "error"; message: string };

export interface State {
  hands: HandSlots[];
  community: CommunitySlots;
  picker: PickerTarget | null;
  /** Raw per-player weights (relative; need not sum to 1). */
  weights: number[];
  /** Target total trials for the next stream run. */
  streamTotal: number;
  equity: EquityState;
  trial: TrialState;
  stream: StreamState;
}

export type Action =
  | { type: "open-picker"; target: PickerTarget }
  | { type: "close-picker" }
  | { type: "set-card"; target: PickerTarget; card: Card | null }
  | { type: "add-player" }
  | { type: "remove-player"; index: number }
  | { type: "set-weight"; index: number; value: number }
  | { type: "calibrate-weights" }
  | { type: "equity-start" }
  | { type: "equity-success"; report: EquityReport }
  | { type: "equity-error"; message: string }
  | { type: "trial-start" }
  | { type: "trial-success"; trial: TrialResult }
  | { type: "trial-error"; message: string }
  | { type: "stream-total"; value: number }
  | { type: "stream-start"; weights: number[]; total: number }
  | {
      type: "stream-progress";
      trials: number;
      counts: number[];
      chops: number;
    }
  | {
      type: "stream-finish";
      stopped: boolean;
      trials: number;
      counts: number[];
      chops: number;
    }
  | { type: "stream-error"; message: string }
  | { type: "stream-reset" };

export const DEFAULT_STREAM_TOTAL = 50_000;
export const MIN_STREAM_TOTAL = 1_000;
export const MAX_STREAM_TOTAL = 1_000_000;

export function initialState(): State {
  // Pre-fill with the README example (AA vs KK preflop) so the demo
  // starts with a meaningful matchup.
  return {
    hands: [
      ["As", "Ad"],
      ["Ks", "Kd"],
    ],
    community: [null, null, null, null],
    picker: null,
    weights: [DEFAULT_WEIGHT, DEFAULT_WEIGHT],
    streamTotal: DEFAULT_STREAM_TOTAL,
    equity: { kind: "idle" },
    trial: { kind: "idle" },
    stream: { kind: "idle" },
  };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "open-picker":
      return { ...state, picker: action.target };

    case "close-picker":
      return { ...state, picker: null };

    case "set-card": {
      const next = applyCard(state, action.target, action.card);
      return {
        ...next,
        picker: null,
        equity: { kind: "idle" },
        trial: { kind: "idle" },
        stream: { kind: "idle" },
      };
    }

    case "add-player": {
      if (state.hands.length >= MAX_PLAYERS) return state;
      return {
        ...state,
        hands: [...state.hands, [null, null] as HandSlots],
        weights: [...state.weights, DEFAULT_WEIGHT],
        equity: { kind: "idle" },
        trial: { kind: "idle" },
        stream: { kind: "idle" },
      };
    }

    case "remove-player": {
      if (state.hands.length <= MIN_PLAYERS) return state;
      return {
        ...state,
        hands: state.hands.filter((_, i) => i !== action.index),
        weights: state.weights.filter((_, i) => i !== action.index),
        equity: { kind: "idle" },
        trial: { kind: "idle" },
        stream: { kind: "idle" },
      };
    }

    case "set-weight": {
      const weights = state.weights.slice();
      if (action.index >= 0 && action.index < weights.length) {
        weights[action.index] = Math.max(0, action.value);
      }
      // Editing weights doesn't invalidate the dealing table — it only
      // affects future samples. We don't reset trial state here so the
      // user can keep seeing the last dealt hand while adjusting M.
      return { ...state, weights };
    }

    case "calibrate-weights": {
      // Rescale so the sliders sum to 100 — the visible position then
      // matches the normalized percentage. Sampling is unaffected
      // because only the ratios matter.
      const normalized = normalizeWeights(state.weights);
      if (!normalized) return state;
      return {
        ...state,
        weights: normalized.map((w) => w * 100),
      };
    }

    case "equity-start":
      return { ...state, equity: { kind: "computing" } };

    case "equity-success":
      return { ...state, equity: { kind: "ready", report: action.report } };

    case "equity-error":
      return { ...state, equity: { kind: "error", message: action.message } };

    case "trial-start":
      return { ...state, trial: { kind: "pending" } };

    case "trial-success":
      return { ...state, trial: { kind: "ready", trial: action.trial } };

    case "trial-error":
      return { ...state, trial: { kind: "error", message: action.message } };

    case "stream-total":
      return {
        ...state,
        streamTotal: Math.min(
          MAX_STREAM_TOTAL,
          Math.max(MIN_STREAM_TOTAL, Math.floor(action.value)),
        ),
      };

    case "stream-start": {
      const run: StreamRun = {
        weights: action.weights.slice(),
        total: action.total,
        trials: 0,
        counts: new Array(action.weights.length).fill(0),
        chops: 0,
      };
      return { ...state, stream: { kind: "running", run } };
    }

    case "stream-progress": {
      if (state.stream.kind !== "running") return state;
      return {
        ...state,
        stream: {
          kind: "running",
          run: {
            ...state.stream.run,
            trials: action.trials,
            counts: action.counts,
            chops: action.chops,
          },
        },
      };
    }

    case "stream-finish": {
      if (state.stream.kind !== "running") return state;
      const run: StreamRun = {
        ...state.stream.run,
        trials: action.trials,
        counts: action.counts,
        chops: action.chops,
      };
      return {
        ...state,
        stream: {
          kind: action.stopped ? "stopped" : "done",
          run,
        },
      };
    }

    case "stream-error":
      return { ...state, stream: { kind: "error", message: action.message } };

    case "stream-reset":
      return { ...state, stream: { kind: "idle" } };
  }
}

function applyCard(state: State, target: PickerTarget, card: Card | null): State {
  if (target.kind === "hand") {
    const hands = state.hands.map((h, i) => {
      if (i !== target.player) return h;
      const next: HandSlots = [h[0], h[1]];
      next[target.index] = card;
      return next;
    });
    return { ...state, hands };
  } else {
    const community: CommunitySlots = [
      state.community[0],
      state.community[1],
      state.community[2],
      state.community[3],
    ];
    community[target.index] = card;
    return { ...state, community };
  }
}

export function currentCardAt(state: State, target: PickerTarget): Slot {
  if (target.kind === "hand") {
    return state.hands[target.player]?.[target.index] ?? null;
  }
  return state.community[target.index];
}

export function collectUsedCards(state: State): Set<Card> {
  const out = new Set<Card>();
  for (const h of state.hands) {
    if (h[0]) out.add(h[0]);
    if (h[1]) out.add(h[1]);
  }
  for (const c of state.community) {
    if (c) out.add(c);
  }
  return out;
}

export type Street = "preflop" | "flop" | "turn" | "invalid";

export function detectStreet(community: CommunitySlots): Street {
  // Cards must be contiguous from the start: no gaps, no turn-without-flop.
  let seenNull = false;
  let count = 0;
  for (const c of community) {
    if (c === null) {
      seenNull = true;
    } else {
      if (seenNull) return "invalid";
      count += 1;
    }
  }
  if (count === 0) return "preflop";
  if (count === 3) return "flop";
  if (count === 4) return "turn";
  return "invalid";
}

/** Returns the player hands as fully-typed [Card, Card] pairs, or null if any slot is empty. */
export function readyHands(state: State): Hand[] | null {
  const out: Hand[] = [];
  for (const h of state.hands) {
    if (h[0] === null || h[1] === null) return null;
    out.push([h[0], h[1]]);
  }
  return out;
}

/** Returns the community as a (Card[]) of length 0/3/4, or null if the partial flop is invalid. */
export function readyCommunity(state: State): Card[] | null {
  const street = detectStreet(state.community);
  if (street === "invalid") return null;
  return state.community.filter((c): c is Card => c !== null);
}

export function canComputeEquity(state: State): boolean {
  return readyHands(state) !== null && readyCommunity(state) !== null;
}

/** Returns normalized weights summing to 1 (or null if all are zero). */
export function normalizeWeights(weights: ReadonlyArray<number>): number[] | null {
  const clamped = weights.map((w) => Math.max(0, w));
  const total = clamped.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  return clamped.map((w) => w / total);
}

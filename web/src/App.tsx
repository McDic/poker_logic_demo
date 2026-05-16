import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { ensureWasm } from "./lib/wasm";
import { EquityRunner } from "./lib/equity-runner";
import type { Card } from "./lib/cards";
import {
  MAX_PLAYERS,
  collectUsedCards,
  currentCardAt,
  detectStreet,
  initialState,
  readyCommunity,
  readyHands,
  reducer,
  type PickerTarget,
} from "./lib/state";
import { BoardRow } from "./components/BoardRow";
import { PlayerRow } from "./components/PlayerRow";
import { CardPickerPopover } from "./components/CardPickerPopover";
import { EquityTable } from "./components/EquityTable";

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // Warm up WASM on mount so the worker's first init doesn't add latency
  // (the main-thread copy of the module is independent, but warming it
  // costs nothing and helps if we later want to call WASM directly here).
  useEffect(() => {
    ensureWasm().catch(() => {
      /* surfaces on first compute */
    });
  }, []);

  // Long-lived equity worker — created once, disposed on unmount.
  const runnerRef = useRef<EquityRunner | null>(null);
  useEffect(() => {
    const runner = new EquityRunner({
      onResult: (report) => dispatch({ type: "equity-success", report }),
      onError: (message) => dispatch({ type: "equity-error", message }),
    });
    runnerRef.current = runner;
    return () => {
      runner.dispose();
      runnerRef.current = null;
    };
  }, []);

  // Stable keys for the cards so the recompute effect doesn't re-run on
  // unrelated state changes (picker open, equity transitions, etc).
  const handsKey = state.hands.map((h) => `${h[0] ?? "_"}:${h[1] ?? "_"}`).join("|");
  const communityKey = state.community.map((c) => c ?? "_").join(":");

  // Auto-recompute whenever the matchup changes. If invalid, cancel any
  // in-flight computation.
  useEffect(() => {
    const runner = runnerRef.current;
    if (!runner) return;
    const hands = readyHands(state);
    const community = readyCommunity(state);
    if (hands && community) {
      dispatch({ type: "equity-start" });
      runner.request(hands, community);
    } else {
      runner.cancel();
    }
    // The reducer's set-card action already resets equity to idle on edit,
    // so we don't dispatch anything in the invalid branch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handsKey, communityKey]);

  const usedCards = useMemo(() => collectUsedCards(state), [state]);
  const street = useMemo(() => detectStreet(state.community), [state.community]);

  const handleOpen = useCallback((target: PickerTarget) => {
    dispatch({ type: "open-picker", target });
  }, []);

  const handleClear = useCallback((target: PickerTarget) => {
    dispatch({ type: "set-card", target, card: null });
  }, []);

  const handlePick = useCallback(
    (card: Card) => {
      if (!state.picker) return;
      dispatch({ type: "set-card", target: state.picker, card });
    },
    [state.picker],
  );

  const pickerUsed = useMemo(() => {
    if (!state.picker) return usedCards;
    const cur = currentCardAt(state, state.picker);
    if (cur === null) return usedCards;
    const out = new Set(usedCards);
    out.delete(cur);
    return out;
  }, [usedCards, state]);

  return (
    <main className="app">
      <h1>Black Dealing Demonstration</h1>
      <p className="tagline">
        Demonstrates how a poker dealer can bias runout selection to fit any
        target win-probability. Set hands and (optionally) a partial board;
        equity recomputes automatically.
      </p>

      <section className="panel">
        <h2>Community board</h2>
        <BoardRow
          community={state.community}
          onOpen={handleOpen}
          onClear={handleClear}
        />
        <div className="panel__hint">
          Street: <strong>{street === "invalid" ? "incomplete" : street}</strong>{" "}
          {street === "invalid" && (
            <span className="hint--warn">
              (community must have 0, 3, or 4 cards filled from the left)
            </span>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Players</h2>
        <div className="players">
          {state.hands.map((hand, i) => (
            <PlayerRow
              key={i}
              index={i}
              hand={hand}
              canRemove={state.hands.length > 2}
              onOpen={handleOpen}
              onClear={handleClear}
              onRemove={() => dispatch({ type: "remove-player", index: i })}
            />
          ))}
        </div>
        <button
          type="button"
          className="add-player"
          onClick={() => dispatch({ type: "add-player" })}
          disabled={state.hands.length >= MAX_PLAYERS}
        >
          + Add player {state.hands.length >= MAX_PLAYERS && `(max ${MAX_PLAYERS})`}
        </button>
      </section>

      <section className="panel">
        <h2>Exact equity</h2>
        <EquityPanel state={state} />
      </section>

      {state.picker && (
        <CardPickerPopover
          used={pickerUsed}
          current={currentCardAt(state, state.picker)}
          onPick={handlePick}
          onClose={() => dispatch({ type: "close-picker" })}
        />
      )}
    </main>
  );
}

function EquityPanel({ state }: { state: ReturnType<typeof initialState> }) {
  const hands = readyHands(state);
  const community = readyCommunity(state);

  if (state.equity.kind === "error") {
    return <p className="error">Error: {state.equity.message}</p>;
  }
  if (state.equity.kind === "computing") {
    return (
      <p className="status">
        <span className="spinner" aria-hidden="true" /> Computing equity…
      </p>
    );
  }
  if (state.equity.kind === "ready" && hands && community) {
    return <EquityTable hands={hands} community={community} report={state.equity.report} />;
  }
  return (
    <p className="status status--idle">
      Fill all hands and a valid board (preflop / flop / turn) to see equity.
    </p>
  );
}

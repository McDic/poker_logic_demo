import { useCallback, useEffect, useMemo, useReducer } from "react";
import { ensureWasm } from "./lib/wasm";
import { exactEquity } from "./lib/equity";
import type { Card } from "./lib/cards";
import {
  MAX_PLAYERS,
  canComputeEquity,
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

  // Warm up WASM on mount so the first Compute click doesn't pay init cost.
  useEffect(() => {
    ensureWasm().catch(() => {
      /* errors surface on first compute */
    });
  }, []);

  const usedCards = useMemo(() => collectUsedCards(state), [state]);
  const street = useMemo(() => detectStreet(state.community), [state.community]);
  const canCompute = canComputeEquity(state);

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

  const handleCompute = useCallback(async () => {
    const hands = readyHands(state);
    const community = readyCommunity(state);
    if (!hands || !community) return;
    dispatch({ type: "equity-start" });
    try {
      await ensureWasm();
      // Yield once so the browser paints the "computing" indicator
      // before we block the main thread on the WASM call.
      await new Promise<void>((r) => setTimeout(r, 0));
      const report = exactEquity(hands, community);
      dispatch({ type: "equity-success", report });
    } catch (err) {
      dispatch({
        type: "equity-error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [state]);

  // When the picker is open we exclude the slot's current card from the "used"
  // set so the user can re-pick the same card without showing it disabled.
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
        target win-probability. Set hands and (optionally) a partial board,
        then compute the true equity.
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
        <div className="compute-row">
          <button
            type="button"
            className="compute"
            disabled={!canCompute || state.equity.kind === "computing"}
            onClick={handleCompute}
          >
            {state.equity.kind === "computing" ? "Computing…" : "Compute equity"}
          </button>
          <div className="compute-row__note">
            Preflop heads-up enumerates ~1.7M runouts and freezes the page for
            several seconds — this becomes async in the next stage.
          </div>
        </div>

        {state.equity.kind === "error" && (
          <p className="error">Error: {state.equity.message}</p>
        )}

        {state.equity.kind === "ready" && (
          <EquityTable
            hands={readyHands(state) ?? []}
            community={readyCommunity(state) ?? []}
            report={state.equity.report}
          />
        )}
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

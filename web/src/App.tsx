import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { ensureWasm } from "./lib/wasm";
import { DealerRunner } from "./lib/dealer-runner";
import type { Card } from "./lib/cards";
import {
  MAX_PLAYERS,
  collectUsedCards,
  currentCardAt,
  detectStreet,
  initialState,
  normalizeWeights,
  readyCommunity,
  readyHands,
  reducer,
  type PickerTarget,
  type State,
} from "./lib/state";
import { BoardRow } from "./components/BoardRow";
import { PlayerRow } from "./components/PlayerRow";
import { CardPickerPopover } from "./components/CardPickerPopover";
import { EquityTable } from "./components/EquityTable";
import { WeightSliders } from "./components/WeightSliders";
import { TrialResultPanel } from "./components/TrialResult";
import { SimulationPanel } from "./components/SimulationPanel";

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  useEffect(() => {
    ensureWasm().catch(() => {
      /* surfaces on first build */
    });
  }, []);

  const runnerRef = useRef<DealerRunner | null>(null);
  useEffect(() => {
    const runner = new DealerRunner({
      onBuilt: (report) => dispatch({ type: "equity-success", report }),
      onBuildError: (message) => dispatch({ type: "equity-error", message }),
      onSampled: (trial) => dispatch({ type: "trial-success", trial }),
      onSampleError: (message) => dispatch({ type: "trial-error", message }),
      onStreamProgress: (p) =>
        dispatch({
          type: "stream-progress",
          trials: p.trials,
          counts: p.counts,
          chops: p.chops,
        }),
      onStreamFinish: (f) =>
        dispatch({
          type: "stream-finish",
          stopped: f.stopped,
          trials: f.trials,
          counts: f.counts,
          chops: f.chops,
        }),
      onStreamError: (message) => dispatch({ type: "stream-error", message }),
    });
    runnerRef.current = runner;
    return () => {
      runner.dispose();
      runnerRef.current = null;
    };
  }, []);

  const handsKey = state.hands.map((h) => `${h[0] ?? "_"}:${h[1] ?? "_"}`).join("|");
  const communityKey = state.community.map((c) => c ?? "_").join(":");

  useEffect(() => {
    const runner = runnerRef.current;
    if (!runner) return;
    const hands = readyHands(state);
    const community = readyCommunity(state);
    if (hands && community) {
      dispatch({ type: "equity-start" });
      runner.build(hands, community);
    } else {
      runner.cancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handsKey, communityKey]);

  const usedCards = useMemo(() => collectUsedCards(state), [state]);
  const street = useMemo(() => detectStreet(state.community), [state.community]);
  const presetCount = useMemo(
    () => state.community.filter((c) => c !== null).length,
    [state.community],
  );

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

  const handleWeight = useCallback((index: number, value: number) => {
    dispatch({ type: "set-weight", index, value });
  }, []);

  const handleDeal = useCallback(() => {
    const runner = runnerRef.current;
    if (!runner) return;
    if (state.equity.kind !== "ready") return;
    if (normalizeWeights(state.weights) === null) return;
    dispatch({ type: "trial-start" });
    runner.sample(state.weights);
  }, [state.equity.kind, state.weights]);

  const handleStreamStart = useCallback(() => {
    const runner = runnerRef.current;
    if (!runner) return;
    if (state.equity.kind !== "ready") return;
    if (normalizeWeights(state.weights) === null) return;
    dispatch({
      type: "stream-start",
      weights: state.weights,
      total: state.streamTotal,
    });
    runner.startStream(state.weights, state.streamTotal);
  }, [state.equity.kind, state.weights, state.streamTotal]);

  const handleStreamStop = useCallback(() => {
    runnerRef.current?.stopStream();
  }, []);

  const handleStreamReset = useCallback(() => {
    dispatch({ type: "stream-reset" });
  }, []);

  const pickerUsed = useMemo(() => {
    if (!state.picker) return usedCards;
    const cur = currentCardAt(state, state.picker);
    if (cur === null) return usedCards;
    const out = new Set(usedCards);
    out.delete(cur);
    return out;
  }, [usedCards, state]);

  const canDeal =
    state.equity.kind === "ready" &&
    normalizeWeights(state.weights) !== null &&
    state.trial.kind !== "pending";

  const highlightWinner =
    state.trial.kind === "ready" ? state.trial.trial.winnerIndex : undefined;

  return (
    <main className="app">
      <h1>Black Dealing Demonstration</h1>
      <p className="tagline">
        Demonstrates how a poker dealer can bias runout selection to fit any
        target win-probability. Set hands and (optionally) a partial board;
        equity recomputes automatically. Pick target weights M and click Deal
        to draw a runout under those weights.
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

      <section className="panel">
        <h2>Target weights (M)</h2>
        <p className="panel__hint">
          Drag sliders to set each player's target win probability. Values are
          relative — they don't need to sum to anything.
        </p>
        <WeightSliders
          weights={state.weights}
          highlightIndex={highlightWinner}
          onChange={handleWeight}
        />
        <div className="deal-row">
          <button
            type="button"
            className="deal"
            onClick={handleDeal}
            disabled={!canDeal}
          >
            {state.trial.kind === "pending" ? "Dealing…" : "Deal one hand"}
          </button>
          <button
            type="button"
            className="calibrate"
            onClick={() => dispatch({ type: "calibrate-weights" })}
            disabled={normalizeWeights(state.weights) === null}
            title="Rescale sliders so they sum to 100; the position matches the normalized %"
          >
            Calibrate
          </button>
          {state.equity.kind !== "ready" && (
            <span className="deal-row__note">
              Waiting for equity computation to finish…
            </span>
          )}
        </div>
        {state.trial.kind === "error" && (
          <p className="error">Sampling error: {state.trial.message}</p>
        )}
        {state.trial.kind === "ready" && (
          <TrialResultPanel trial={state.trial.trial} presetCount={presetCount} />
        )}
      </section>

      <section className="panel">
        <h2>Streaming simulation</h2>
        <p className="panel__hint">
          Run thousands of biased deals and watch the empirical win rate
          converge to your target M. Convergence is the proof: regardless of
          true equity, the dealer can hit any target.
        </p>
        <SimulationPanel
          stream={state.stream}
          total={state.streamTotal}
          liveWeights={state.weights}
          playerCount={state.hands.length}
          canStart={
            state.equity.kind === "ready" &&
            normalizeWeights(state.weights) !== null
          }
          onTotalChange={(value) => dispatch({ type: "stream-total", value })}
          onStart={handleStreamStart}
          onStop={handleStreamStop}
          onReset={handleStreamReset}
        />
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

function EquityPanel({ state }: { state: State }) {
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

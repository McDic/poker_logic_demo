import type { StreamState } from "../lib/state";
import {
  MAX_STREAM_TOTAL,
  MIN_STREAM_TOTAL,
  normalizeWeights,
} from "../lib/state";

interface Props {
  stream: StreamState;
  total: number;
  /** Live raw weights — used as the target only when no run is in flight or showing. */
  liveWeights: number[];
  /** Number of player hands, for empty-state rendering. */
  playerCount: number;
  canStart: boolean;
  onTotalChange: (value: number) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}

const STEP = 1_000;

export function SimulationPanel(props: Props) {
  const { stream, total, liveWeights, playerCount } = props;

  // When showing a result, the target is the weights frozen at start.
  // When idle, show live weights so the user can preview the bar.
  const targetSource =
    stream.kind === "running" ||
    stream.kind === "stopped" ||
    stream.kind === "done"
      ? stream.run.weights
      : liveWeights;
  const target = normalizeWeights(targetSource) ?? new Array(playerCount).fill(0);

  const trials =
    stream.kind === "running" ||
    stream.kind === "stopped" ||
    stream.kind === "done"
      ? stream.run.trials
      : 0;
  const counts =
    stream.kind === "running" ||
    stream.kind === "stopped" ||
    stream.kind === "done"
      ? stream.run.counts
      : new Array(playerCount).fill(0);
  const empirical = trials > 0 ? counts.map((c) => c / trials) : new Array(playerCount).fill(0);
  const chops =
    stream.kind === "running" ||
    stream.kind === "stopped" ||
    stream.kind === "done"
      ? stream.run.chops
      : 0;

  const rmse = trials > 0 ? computeRmse(target, empirical) : null;

  const isRunning = stream.kind === "running";
  const isFinished = stream.kind === "stopped" || stream.kind === "done";

  return (
    <div className="sim">
      <div className="sim__controls">
        <label className="sim__field">
          <span className="sim__label">Trials</span>
          <input
            type="number"
            min={MIN_STREAM_TOTAL}
            max={MAX_STREAM_TOTAL}
            step={STEP}
            value={total}
            disabled={isRunning}
            onChange={(e) => props.onTotalChange(Number(e.target.value))}
            className="sim__input mono"
          />
        </label>
        {!isRunning ? (
          <button
            type="button"
            className="deal"
            onClick={props.onStart}
            disabled={!props.canStart}
          >
            {isFinished ? "Run again" : "Start simulation"}
          </button>
        ) : (
          <button type="button" className="stop" onClick={props.onStop}>
            Stop
          </button>
        )}
        {(isFinished || stream.kind === "error") && (
          <button
            type="button"
            className="calibrate"
            onClick={props.onReset}
            title="Clear simulation results"
          >
            Clear
          </button>
        )}
      </div>

      {stream.kind === "error" && (
        <p className="error">Simulation error: {stream.message}</p>
      )}

      <div className="sim__stats">
        <Stat
          label="Trials"
          value={`${trials.toLocaleString()} / ${total.toLocaleString()}`}
        />
        <Stat
          label="RMSE"
          value={rmse === null ? "—" : (rmse * 100).toFixed(3) + " pp"}
          hint="root-mean-square of (empirical − target), in percentage points"
        />
        <Stat label="Chops" value={chops.toLocaleString()} />
      </div>

      <table className="sim__table">
        <thead>
          <tr>
            <th>Player</th>
            <th className="num">Target M</th>
            <th className="num">Empirical</th>
            <th className="num">Δ</th>
            <th className="bar"></th>
          </tr>
        </thead>
        <tbody>
          {target.map((t, i) => {
            const e = empirical[i] ?? 0;
            const delta = e - t;
            return (
              <tr key={i}>
                <td>P{i + 1}</td>
                <td className="num mono">{(t * 100).toFixed(2)}%</td>
                <td className="num mono">
                  {trials > 0 ? (e * 100).toFixed(2) + "%" : "—"}
                </td>
                <td
                  className={`num mono ${
                    trials > 0
                      ? delta > 0
                        ? "delta--pos"
                        : delta < 0
                          ? "delta--neg"
                          : ""
                      : ""
                  }`}
                >
                  {trials > 0 ? formatDelta(delta) : "—"}
                </td>
                <td className="bar">
                  <ConvergenceBar target={t} empirical={trials > 0 ? e : 0} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="sim__stat" title={hint}>
      <span className="sim__stat-label">{label}</span>
      <span className="sim__stat-value mono">{value}</span>
    </div>
  );
}

function ConvergenceBar({
  target,
  empirical,
}: {
  target: number;
  empirical: number;
}) {
  return (
    <div className="conv">
      <div className="conv__fill" style={{ width: `${empirical * 100}%` }} />
      <div
        className="conv__target"
        style={{ left: `${target * 100}%` }}
        title={`target ${(target * 100).toFixed(2)}%`}
      />
    </div>
  );
}

function computeRmse(target: number[], empirical: number[]): number {
  if (target.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < target.length; i++) {
    const d = empirical[i] - target[i];
    s += d * d;
  }
  return Math.sqrt(s / target.length);
}

function formatDelta(d: number): string {
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  return `${sign}${Math.abs(d * 100).toFixed(2)}%`;
}

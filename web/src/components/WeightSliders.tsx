import { normalizeWeights } from "../lib/state";

interface Props {
  weights: number[];
  /** Optional: highlights the picked player visually. Undefined to disable. */
  highlightIndex?: number;
  onChange: (index: number, value: number) => void;
}

export function WeightSliders({ weights, highlightIndex, onChange }: Props) {
  const normalized = normalizeWeights(weights);
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  const allZero = total <= 0;

  return (
    <div className="weights">
      {weights.map((w, i) => {
        const norm = normalized ? normalized[i] : 0;
        const isHi = highlightIndex === i;
        return (
          <div key={i} className={`weight ${isHi ? "weight--hi" : ""}`}>
            <label className="weight__label" htmlFor={`weight-${i}`}>
              P{i + 1}
            </label>
            <input
              id={`weight-${i}`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={w}
              onChange={(e) => onChange(i, Number(e.target.value))}
              className="weight__slider"
              aria-label={`Player ${i + 1} target win probability`}
            />
            <div className="weight__readout mono">
              {allZero ? "—" : `${(norm * 100).toFixed(1)}%`}
            </div>
          </div>
        );
      })}
      {allZero && (
        <p className="hint--warn">
          All weights are zero — drag at least one slider above zero to deal.
        </p>
      )}
    </div>
  );
}

import type { Card } from "../lib/cards";
import { isCard } from "../lib/cards";
import type { TrialResult } from "../lib/dealer-runner";
import { CardLabel } from "./CardLabel";

interface Props {
  trial: TrialResult;
  /** Number of community cards that were pre-set (highlights dealt cards). */
  presetCount: number;
}

export function TrialResultPanel({ trial, presetCount }: Props) {
  return (
    <div className="trial">
      <div className="trial__board">
        <span className="trial__label">Runout</span>
        <div className="trial__cards">
          {trial.board.map((c, i) => {
            const card = isCard(c) ? (c as Card) : null;
            const dealt = i >= presetCount;
            return (
              <span
                key={i}
                className={`trial__card ${dealt ? "trial__card--dealt" : "trial__card--preset"}`}
                title={dealt ? "dealt by sampler" : "pre-set"}
              >
                {card ? <CardLabel card={card} /> : c}
              </span>
            );
          })}
        </div>
      </div>
      <div className="trial__winner">
        <span className="trial__label">Winner</span>
        <span className="trial__winner-name">
          P{trial.winnerIndex + 1}
          {trial.chopped && <em className="trial__chop"> (chop)</em>}
        </span>
      </div>
    </div>
  );
}

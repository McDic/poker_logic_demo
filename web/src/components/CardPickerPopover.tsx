import { useEffect } from "react";
import { RANKS, SUITS, type Card, type Suit } from "../lib/cards";
import { CardLabel } from "./CardLabel";

interface Props {
  /** Cards already used elsewhere (excluding the slot being edited). */
  used: ReadonlySet<Card>;
  /** Cards currently in the slot we're editing (shown as selected). */
  current: Card | null;
  onPick: (card: Card) => void;
  onClose: () => void;
}

const SUIT_LABEL: Record<Suit, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

export function CardPickerPopover({ used, current, onPick, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="picker"
        role="dialog"
        aria-modal="true"
        aria-label="Select a card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="picker__header">
          <span className="picker__title">Select a card</span>
          <button
            type="button"
            className="picker__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <table className="picker__grid">
          <thead>
            <tr>
              <th></th>
              {SUITS.map((s) => {
                const red = s === "h" || s === "d";
                return (
                  <th key={s} className={red ? "card--red" : "card--black"}>
                    {SUIT_LABEL[s]}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {RANKS.map((r) => (
              <tr key={r}>
                <th>{r}</th>
                {SUITS.map((s) => {
                  const card = `${r}${s}` as Card;
                  const isUsed = used.has(card);
                  const isCurrent = card === current;
                  const cls = [
                    "picker__cell",
                    isUsed ? "picker__cell--used" : "",
                    isCurrent ? "picker__cell--current" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <td key={s}>
                      <button
                        type="button"
                        className={cls}
                        disabled={isUsed && !isCurrent}
                        onClick={() => onPick(card)}
                        aria-label={`Pick ${card}${isUsed ? " (in use)" : ""}`}
                      >
                        <CardLabel card={card} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

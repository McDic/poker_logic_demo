import type { Card, Suit } from "../lib/cards";

const SUIT_SYMBOL: Record<Suit, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

export function CardLabel({ card }: { card: Card }) {
  const rank = card[0];
  const suit = card[1] as Suit;
  const red = suit === "h" || suit === "d";
  return (
    <span className={`card ${red ? "card--red" : "card--black"}`}>
      <span className="card__rank">{rank}</span>
      <span className="card__suit">{SUIT_SYMBOL[suit]}</span>
    </span>
  );
}

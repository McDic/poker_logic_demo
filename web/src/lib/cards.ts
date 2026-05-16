// Card and hand types live here so the rest of the app shares one vocabulary.
// A card is a two-character string in pokercraft-core format: rank then suit.
// Rank: 2 3 4 5 6 7 8 9 T J Q K A (uppercase, T = 10)
// Suit: s h d c (lowercase)

export type Suit = "s" | "h" | "d" | "c";
export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "T"
  | "J"
  | "Q"
  | "K"
  | "A";

export type Card = `${Rank}${Suit}`;
export type Hand = [Card, Card];

export const RANKS: Rank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "T",
  "J",
  "Q",
  "K",
  "A",
];
export const SUITS: Suit[] = ["s", "h", "d", "c"];

const CARD_RE = /^[23456789TJQKA][shdc]$/;

export function isCard(value: unknown): value is Card {
  return typeof value === "string" && CARD_RE.test(value);
}

export function allCards(): Card[] {
  const out: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) out.push(`${r}${s}` as Card);
  return out;
}

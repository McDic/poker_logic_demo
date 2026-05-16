//! WASM bindings for the black-card-dealing demonstration.
//!
//! Two public surfaces:
//!   - `computeEquity(hands, community)` — one-shot equity calculation
//!     that delegates to pokercraft-core.
//!   - `DealingTable` — pre-enumerates every future runout and classifies
//!     each by its tied-winner set. Supports `equities` for display and
//!     `sampleTrial(weights)` to pull a biased runout (the "black deal").

use itertools::Itertools;
use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

use pokercraft_core::card::{Card, Hand, HandRank};
use pokercraft_core::equity::EquityResult;

#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "panic-hook")]
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// ---------------------------------------------------------------------------
// computeEquity (Stage 2)
// ---------------------------------------------------------------------------

/// Result of an exact equity calculation across all future runouts.
#[wasm_bindgen]
pub struct Equities {
    values: Vec<f64>,
    board_count: u32,
}

#[wasm_bindgen]
impl Equities {
    #[wasm_bindgen(getter)]
    pub fn values(&self) -> Vec<f64> {
        self.values.clone()
    }

    #[wasm_bindgen(getter, js_name = boardCount)]
    pub fn board_count(&self) -> u32 {
        self.board_count
    }

    #[wasm_bindgen(getter, js_name = playerCount)]
    pub fn player_count(&self) -> u32 {
        self.values.len() as u32
    }
}

#[wasm_bindgen(js_name = computeEquity)]
pub fn compute_equity(
    hands: js_sys::Array,
    community: js_sys::Array,
) -> Result<Equities, JsValue> {
    let n_players = hands.length() as usize;
    let community_len = community.length() as usize;

    if n_players < 2 {
        return Err(JsValue::from_str("need at least 2 players"));
    }
    match community_len {
        0 | 3 | 4 | 5 => {}
        other => {
            return Err(JsValue::from_str(&format!(
                "community must have 0, 3, 4, or 5 cards (got {})",
                other
            )));
        }
    }

    let inner = EquityResult::new_wasm(hands, community)?;
    let mut values = Vec::with_capacity(n_players);
    for i in 0..n_players {
        values.push(inner.get_equity_wasm(i)?);
    }

    let board_count = remaining_board_count(n_players, community_len);
    Ok(Equities {
        values,
        board_count,
    })
}

// ---------------------------------------------------------------------------
// DealingTable (Stage 5)
// ---------------------------------------------------------------------------

/// One sampled "black deal": a winner index plus the 5-card runout.
#[wasm_bindgen]
pub struct Trial {
    winner_index: u32,
    chopped: bool,
    board: Vec<String>,
}

#[wasm_bindgen]
impl Trial {
    #[wasm_bindgen(getter, js_name = winnerIndex)]
    pub fn winner_index(&self) -> u32 {
        self.winner_index
    }

    /// True if the underlying runout was a chop and the displayed winner
    /// was sampled (per the option-b weighting) from the tied set.
    #[wasm_bindgen(getter)]
    pub fn chopped(&self) -> bool {
        self.chopped
    }

    #[wasm_bindgen(getter)]
    pub fn board(&self) -> Vec<String> {
        self.board.clone()
    }
}

/// Pre-computed classification of every future runout, sufficient to
/// (a) report exact per-player equity and (b) sample biased runouts.
#[wasm_bindgen]
pub struct DealingTable {
    /// All future 5-card runouts.
    boards: Vec<[Card; 5]>,
    /// For each board, bitmask of tied winners. Bit `i` set iff player `i`
    /// holds the best hand on that board.
    tied: Vec<u8>,
    /// `group_sizes[i] = sum_b (1[i in T_b] / |T_b|)`. Divided by board
    /// count this is the player's exact equity (with chop-split, option b).
    group_sizes: Vec<f64>,
    rng: SmallRng,
}

#[wasm_bindgen]
impl DealingTable {
    /// Build the table by enumerating every future runout.
    ///
    /// - `hands_js`: array of 2-card arrays (e.g. `[["As","Ad"],["Ks","Kd"]]`).
    /// - `community_js`: 0, 3, or 4 community cards (preflop / flop / turn).
    ///
    /// Returns an error for invalid input (bad card, duplicate, wrong
    /// community length, fewer than 2 or more than 4 players).
    #[wasm_bindgen(constructor)]
    pub fn new(
        hands_js: js_sys::Array,
        community_js: js_sys::Array,
    ) -> Result<DealingTable, JsValue> {
        let hands = parse_hands(&hands_js)?;
        let community = parse_community(&community_js)?;
        let n_players = hands.len();

        if !(2..=4).contains(&n_players) {
            return Err(JsValue::from_str(
                "dealing table requires 2 to 4 players",
            ));
        }
        match community.len() {
            0 | 3 | 4 => {}
            other => {
                return Err(JsValue::from_str(&format!(
                    "community must have 0, 3, or 4 cards for dealing (got {})",
                    other
                )));
            }
        }

        // Cards still in the deck
        let remaining: Vec<Card> = Card::all()
            .into_iter()
            .filter(|c| {
                !hands.iter().any(|(c1, c2)| c == c1 || c == c2)
                    && !community.iter().any(|cc| c == cc)
            })
            .collect();

        let k_needed = 5 - community.len();
        let expected_boards = remaining_board_count(n_players, community.len()) as usize;
        let mut boards: Vec<[Card; 5]> = Vec::with_capacity(expected_boards);
        let mut tied_masks: Vec<u8> = Vec::with_capacity(expected_boards);
        let mut group_sizes: Vec<f64> = vec![0.0; n_players];
        let mut card7: [Card; 7] = [Card::default(); 7];

        for combo in remaining.iter().copied().combinations(k_needed) {
            let mut board: [Card; 5] = [Card::default(); 5];
            for (i, c) in community.iter().chain(combo.iter()).enumerate() {
                board[i] = *c;
            }
            for i in 0..5 {
                card7[i] = board[i];
            }

            // Evaluate each player's 7-card hand and track the tied winners.
            let mut best_rank_opt: Option<HandRank> = None;
            let mut mask: u8 = 0;
            let mut tied_count: u32 = 0;

            for (idx, &(c1, c2)) in hands.iter().enumerate() {
                card7[5] = c1;
                card7[6] = c2;
                let (_, rank) = HandRank::find_best5(&card7)
                    .map_err(|e| JsValue::from_str(&e.to_string()))?;
                match &best_rank_opt {
                    None => {
                        best_rank_opt = Some(rank);
                        mask = 1u8 << idx;
                        tied_count = 1;
                    }
                    Some(best) => {
                        if &rank > best {
                            best_rank_opt = Some(rank);
                            mask = 1u8 << idx;
                            tied_count = 1;
                        } else if &rank == best {
                            mask |= 1u8 << idx;
                            tied_count += 1;
                        }
                    }
                }
            }

            let inv = 1.0 / tied_count as f64;
            for idx in 0..n_players {
                if (mask >> idx) & 1 == 1 {
                    group_sizes[idx] += inv;
                }
            }

            boards.push(board);
            tied_masks.push(mask);
        }

        Ok(DealingTable {
            boards,
            tied: tied_masks,
            group_sizes,
            rng: SmallRng::from_entropy(),
        })
    }

    #[wasm_bindgen(getter, js_name = boardCount)]
    pub fn board_count(&self) -> u32 {
        self.boards.len() as u32
    }

    #[wasm_bindgen(getter, js_name = playerCount)]
    pub fn player_count(&self) -> u32 {
        self.group_sizes.len() as u32
    }

    /// Per-player exact equity (chop-split, option b).
    #[wasm_bindgen(getter)]
    pub fn equities(&self) -> Vec<f64> {
        let bc = self.boards.len() as f64;
        if bc == 0.0 {
            return vec![0.0; self.group_sizes.len()];
        }
        self.group_sizes.iter().map(|g| g / bc).collect()
    }

    /// Sample one biased runout.
    ///
    /// `weights` are relative (need not sum to 1); negative values are
    /// clamped to 0. Returns an error if all weights are zero, or if the
    /// sampled winner has nonzero weight but no winning runout exists.
    #[wasm_bindgen(js_name = sampleTrial)]
    pub fn sample_trial(&mut self, weights: Vec<f64>) -> Result<Trial, JsValue> {
        let n = self.group_sizes.len();
        if weights.len() != n {
            return Err(JsValue::from_str(&format!(
                "expected {} weights, got {}",
                n,
                weights.len()
            )));
        }
        let weights: Vec<f64> = weights.iter().map(|w| w.max(0.0)).collect();
        let total: f64 = weights.iter().sum();
        if total <= 0.0 {
            return Err(JsValue::from_str("all player weights are zero"));
        }

        // Pick the trial's winner from the relative weights.
        let mut u = self.rng.gen::<f64>() * total;
        let mut winner = n - 1;
        for (i, &w) in weights.iter().enumerate() {
            u -= w;
            if u <= 0.0 {
                winner = i;
                break;
            }
        }

        if self.group_sizes[winner] <= 0.0 {
            return Err(JsValue::from_str(&format!(
                "player {} has nonzero weight but cannot win any runout",
                winner + 1
            )));
        }

        // Rejection-sample a board where the winner is among tied winners.
        // Accept probability for a candidate b is `1 / |T_b|`, which gives
        // P(board=b | winner=i) ∝ 1/|T_b| over `b in {b : i in T_b}`.
        let n_boards = self.boards.len();
        loop {
            let b = self.rng.gen_range(0..n_boards);
            let mask = self.tied[b];
            if (mask >> winner) & 1 == 1 {
                let tied_count = mask.count_ones() as f64;
                if self.rng.gen::<f64>() * tied_count < 1.0 {
                    let board = &self.boards[b];
                    let board_strs: Vec<String> = board.iter().map(|c| c.to_string()).collect();
                    return Ok(Trial {
                        winner_index: winner as u32,
                        chopped: tied_count > 1.0,
                        board: board_strs,
                    });
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn parse_hands(arr: &js_sys::Array) -> Result<Vec<Hand>, JsValue> {
    let mut out = Vec::with_capacity(arr.length() as usize);
    for v in arr.iter() {
        let inner: js_sys::Array = v
            .dyn_into()
            .map_err(|_| JsValue::from_str("each hand must be a 2-element array"))?;
        if inner.length() != 2 {
            return Err(JsValue::from_str("each hand must have exactly 2 cards"));
        }
        let c1 = parse_card(&inner.get(0))?;
        let c2 = parse_card(&inner.get(1))?;
        out.push((c1, c2));
    }
    // Duplicate detection across all hand cards
    let mut seen: Vec<Card> = Vec::with_capacity(out.len() * 2);
    for (c1, c2) in &out {
        if seen.contains(c1) || seen.contains(c2) || c1 == c2 {
            return Err(JsValue::from_str("duplicate card in player hands"));
        }
        seen.push(*c1);
        seen.push(*c2);
    }
    Ok(out)
}

fn parse_community(arr: &js_sys::Array) -> Result<Vec<Card>, JsValue> {
    let mut out: Vec<Card> = Vec::with_capacity(arr.length() as usize);
    for v in arr.iter() {
        let c = parse_card(&v)?;
        if out.contains(&c) {
            return Err(JsValue::from_str("duplicate card in community"));
        }
        out.push(c);
    }
    Ok(out)
}

fn parse_card(v: &JsValue) -> Result<Card, JsValue> {
    let s = v
        .as_string()
        .ok_or_else(|| JsValue::from_str("card must be a string"))?;
    Card::try_from(s.as_str()).map_err(|e| JsValue::from_str(&e.to_string()))
}

fn remaining_board_count(n_players: usize, community_len: usize) -> u32 {
    let remaining = 52usize.saturating_sub(2 * n_players + community_len);
    let needed = 5usize.saturating_sub(community_len);
    binomial(remaining, needed) as u32
}

fn binomial(n: usize, k: usize) -> u64 {
    if k > n {
        return 0;
    }
    let k = k.min(n - k);
    let mut acc: u64 = 1;
    for i in 0..k {
        acc = acc * (n - i) as u64 / (i + 1) as u64;
    }
    acc
}

#[cfg(test)]
mod tests {
    use super::binomial;

    #[test]
    fn binomial_basics() {
        assert_eq!(binomial(5, 0), 1);
        assert_eq!(binomial(5, 5), 1);
        assert_eq!(binomial(5, 2), 10);
        assert_eq!(binomial(48, 5), 1_712_304);
        assert_eq!(binomial(45, 2), 990);
        assert_eq!(binomial(44, 1), 44);
        assert_eq!(binomial(3, 4), 0);
    }
}

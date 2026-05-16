//! WASM bindings for the black-card-dealing demonstration.
//!
//! Stage 2 adds `computeEquity` on top of the Stage 1 scaffolding.
//! Equity calculation itself is delegated to `pokercraft-core`;
//! we just translate the inputs and bundle the results.

use pokercraft_core::equity::EquityResult;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "panic-hook")]
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Result of an exact equity calculation across all future runouts.
#[wasm_bindgen]
pub struct Equities {
    values: Vec<f64>,
    board_count: u32,
}

#[wasm_bindgen]
impl Equities {
    /// Per-player equity in [0, 1], same order as the `hands` input.
    #[wasm_bindgen(getter)]
    pub fn values(&self) -> Vec<f64> {
        self.values.clone()
    }

    /// Number of distinct future runouts that were enumerated.
    #[wasm_bindgen(getter, js_name = boardCount)]
    pub fn board_count(&self) -> u32 {
        self.board_count
    }

    /// Number of players.
    #[wasm_bindgen(getter, js_name = playerCount)]
    pub fn player_count(&self) -> u32 {
        self.values.len() as u32
    }
}

/// Compute exact equity for every player across all future runouts.
///
/// - `hands`: array of 2-card arrays, e.g. `[["As","Ad"],["Ks","Kd"]]`.
/// - `community`: array of 0/3/4/5 community card strings.
///
/// Errors if any card string is invalid, any card is duplicated, there are
/// fewer than 2 players, or the community has 1, 2, or >5 cards.
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

    // pokercraft-core's wasm-bindgen constructor parses cards and validates
    // for us (including duplicate detection).
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

/// Number of distinct 5-card runouts given fixed players and partial board.
fn remaining_board_count(n_players: usize, community_len: usize) -> u32 {
    let remaining = 52usize.saturating_sub(2 * n_players + community_len);
    let needed = 5usize.saturating_sub(community_len);
    binomial(remaining, needed) as u32
}

/// Integer binomial coefficient. Returns 0 if `k > n`.
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

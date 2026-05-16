//! WASM bindings for the black-card-dealing demonstration.
//!
//! Stage 1 exposes only `init` and `version`. Later stages add
//! `compute_equity` and the `DealingTable` simulator.

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

#[wasm_bindgen(js_name = pokercraftVersion)]
pub fn pokercraft_version() -> String {
    pokercraft_core::card::CardNumber::Ace.to_string()
}

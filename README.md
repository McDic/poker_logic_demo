# Black Dealing Demonstration

A live, in-browser demonstration of how a poker dealer can bias post-all-in
runouts to match any target win-probability vector. The point isn't the
math — it's trivial — but to show that "fair shuffle" online poker rooms
can run arbitrarily rigged outcomes with zero forensic trace beyond
per-hand RNG analysis. Detection from the player side is hopeless without
aggregate statistics across many hands, and the bias can be tuned to evade
that too.

🃏 **Live demo:** <https://mcdic.github.io/poker_logic_demo/>

## What the site does

When multiple players are all-in, the dealer reveals the rest of the
community board ("runout"). A fair dealer samples uniformly from the
remaining 5-card runouts. A *black* dealer picks a target win-probability
vector `M` and samples a runout consistent with it.

The UI lets you:

1. Set 2–4 player hands and (optionally) a partial board (preflop / flop / turn).
2. View exact true equity computed by enumerating every future runout.
3. Set target weights `M_i` for each player with sliders.
4. Sample one biased runout (Deal one hand) — or run a Monte Carlo of up to
   1,000,000 trials and watch the empirical win rate converge to `M`,
   regardless of true equity.

The convergence is the demonstration: bias of 90/10 produces empirical
90/10 even when true equity is 8.6/91.4.

## The algorithm

Given player hands and a partial board, enumerate every future 5-card
runout `b`. Let `T_b ⊆ {1..n}` be the set of tied winners on board `b`
(usually a singleton; sometimes a chop). Given target weights `M`:

1. Sample winner `i ~ Multinomial(M)`.
2. Reject-sample a runout: draw `b` uniformly, accept iff `i ∈ T_b` with
   probability `1/|T_b|`.

The resulting joint distribution satisfies `P(winner = i) = M_i / Σ M_j`
exactly. Chop boards contribute fractionally — option (b) in the
design discussion: a chop board's mass is split equally among its tied
players' groups. This is also how `true equity` is reported throughout
the UI, so the "Reset to equity" button gives a fair-dealer baseline that
the simulation converges back to.

## Architecture

- **`crates/black-dealing`** — Rust crate, exposed to JS via `wasm-bindgen`.
  Owns `DealingTable`: enumerates runouts using `pokercraft-core::HandRank::find_best5`,
  stores tied-winner bitmasks (1 byte per board), exposes `equities`,
  `sampleTrial`, `sampleBatch`. ~22M samples/sec measured for the inner loop.
- **`pokercraft-local`** — git submodule pinned to commit `dbb0bd8`. Used
  read-only via path dependency into `crates/core`. The submodule has
  its own workspace; we `exclude = ["pokercraft-local"]` from ours.
- **`web/`** — Vite + React + TypeScript. A single Web Worker
  (`workers/dealer.worker.ts`) owns the in-memory `DealingTable`. The
  UI never blocks on the ~7s preflop enumeration, and flipping weight
  sliders re-samples without rebuilding the table.
- **Pure-TS layer** lives in `web/src/lib/` (no React imports). State is
  managed by a single reducer so swapping the UI later requires no logic
  changes.
- **Deploy** — GitHub Actions builds the WASM crate + Vite bundle and
  publishes to GitHub Pages on every push to `main`.

## Local development

Prerequisites: Rust toolchain, [`wasm-pack`](https://rustwasm.github.io/wasm-pack/),
Node 20+.

```bash
git clone --recurse-submodules https://github.com/McDic/poker_logic_demo.git
cd poker_logic_demo

# Build WASM bindings → web/src/wasm/  (release; ~10s after first cargo cache)
./scripts/build-wasm.sh
# Faster iteration during Rust changes:
# ./scripts/build-wasm.sh dev

# Web app
cd web
npm install
npm run dev
# → http://localhost:5173/poker_logic_demo/
```

Other commands:

```bash
npm run typecheck   # strict TS check
npm run build       # production build, writes web/dist/
cargo test -p black-dealing
```

## Repo layout

```
.
├── crates/black-dealing/       # Our Rust+WASM crate (DealingTable, sampleBatch, ...)
├── pokercraft-local/           # Submodule: equity + hand evaluator (pinned)
├── scripts/build-wasm.sh       # wasm-pack → web/src/wasm/
├── web/
│   ├── src/
│   │   ├── lib/                # Pure TS: cards, state, equity, dealer-runner
│   │   ├── workers/            # Dealer worker (build / sample / stream)
│   │   ├── components/         # React UI (replaceable layer)
│   │   ├── wasm/               # Generated wasm-pack output (gitignored)
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── .github/workflows/deploy.yml
├── Cargo.toml                  # Workspace (excludes pokercraft-local/)
└── LICENSE                     # MIT
```

## Deploying your own copy

1. Fork or clone this repo to your own GitHub account.
2. In repo settings → **Pages**, set **Source** to *GitHub Actions*.
3. Push to `main`. The `Deploy to GitHub Pages` workflow builds Rust
   → WASM → Vite bundle and publishes to `<user>.github.io/<repo>/`.
4. If your repo name differs from `poker_logic_demo`, update the
   `VITE_BASE_PATH` env or the default in `web/vite.config.ts`.

## License

[MIT](./LICENSE).

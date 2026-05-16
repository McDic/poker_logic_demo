import { useEffect, useState } from "react";
import { ensureWasm } from "./lib/wasm";
import { exactEquity, type EquityReport } from "./lib/equity";
import type { Card, Hand } from "./lib/cards";

// Stage 2 demo: hardcoded AA vs KK, no community cards.
// Expected: P1 ~82%, P2 ~18%, boardCount = C(48, 5) = 1,712,304.
const DEMO_PLAYERS: Hand[] = [
  ["As", "Ad"],
  ["Ks", "Kd"],
];
const DEMO_COMMUNITY: Card[] = [];

type State =
  | { kind: "loading" }
  | { kind: "ready"; report: EquityReport }
  | { kind: "error"; message: string };

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureWasm();
        if (cancelled) return;
        const report = exactEquity(DEMO_PLAYERS, DEMO_COMMUNITY);
        if (!cancelled) setState({ kind: "ready", report });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="app">
      <h1>Black Dealing Demonstration</h1>
      <p className="tagline">
        Stage 2 — exact equity via WASM. Hardcoded matchup; UI for choosing
        hands comes next.
      </p>

      {state.kind === "loading" && <p>Computing…</p>}
      {state.kind === "error" && <p className="error">Error: {state.message}</p>}
      {state.kind === "ready" && (
        <EquityTable players={DEMO_PLAYERS} community={DEMO_COMMUNITY} report={state.report} />
      )}
    </main>
  );
}

function EquityTable(props: {
  players: ReadonlyArray<Hand>;
  community: ReadonlyArray<Card>;
  report: EquityReport;
}) {
  const { players, community, report } = props;
  const boardLabel = community.length === 0 ? "(preflop)" : community.join(" ");
  return (
    <section className="equity">
      <div className="equity__meta">
        <div>
          <span className="label">Board</span>
          <span className="value mono">{boardLabel}</span>
        </div>
        <div>
          <span className="label">Runouts</span>
          <span className="value mono">{report.boardCount.toLocaleString()}</span>
        </div>
      </div>

      <table className="equity__table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Hand</th>
            <th>Equity</th>
          </tr>
        </thead>
        <tbody>
          {players.map((hand, i) => (
            <tr key={i}>
              <td>P{i + 1}</td>
              <td className="mono">{hand.join(" ")}</td>
              <td className="mono">{(report.values[i] * 100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

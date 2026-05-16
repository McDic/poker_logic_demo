import { useEffect, useState } from "react";
import init, { version, pokercraftVersion } from "./wasm/black_dealing";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; version: string; aceCheck: string }
  | { kind: "error"; message: string };

export function App() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    init()
      .then(() => {
        if (cancelled) return;
        setState({
          kind: "ready",
          version: version(),
          aceCheck: pokercraftVersion(),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="app">
      <h1>Black Dealing Demonstration</h1>
      <p className="tagline">
        Stage 1 scaffolding — verifying WASM build chain.
      </p>
      {state.kind === "loading" && <p>Loading WASM…</p>}
      {state.kind === "error" && <p className="error">Error: {state.message}</p>}
      {state.kind === "ready" && (
        <dl className="kv">
          <dt>black-dealing version</dt>
          <dd>{state.version}</dd>
          <dt>pokercraft-core sanity (Ace.to_string())</dt>
          <dd>{state.aceCheck}</dd>
        </dl>
      )}
    </main>
  );
}

import init from "../wasm/black_dealing";

let promise: Promise<unknown> | null = null;

/** Lazily initialize the WASM module. Safe to call multiple times. */
export function ensureWasm(): Promise<unknown> {
  if (!promise) promise = init();
  return promise;
}

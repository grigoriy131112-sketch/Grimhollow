// The browser has no `process`. index.js reads process.argv at module top
// level (to decide whether to start an HTTP listener) and the db/llm modules
// read process.env for defaults. A tiny inert object keeps every one of those
// reads harmless.
if (!globalThis.process) {
  globalThis.process = {
    argv: [],
    env: {},
    platform: 'browser',
    versions: {},
    nextTick: (fn, ...args) => setTimeout(() => fn(...args), 0),
  };
}

export default globalThis.process;

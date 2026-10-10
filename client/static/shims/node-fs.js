// Minimal `node:fs` for the browser. The server reads exactly two things from
// disk: schema.sql (via db/index.js) and an optional local LLM weights file
// (via llm.js). The entry registers schema.sql's text under a basename key, so
// readFileSync finds it without any real filesystem; everything else is treated
// as absent, which makes llm.js fall back to its deterministic template.
const registry = (globalThis.__GRIMHOLLOW_FS__ = globalThis.__GRIMHOLLOW_FS__ || {});

function baseName(p) {
  const s = String(p);
  return s.slice(s.lastIndexOf('/') + 1);
}

export function readFileSync(file, encoding) {
  const key = baseName(file);
  if (Object.prototype.hasOwnProperty.call(registry, key)) return registry[key];
  const err = new Error(`ENOENT: no such file or directory, open '${file}'`);
  err.code = 'ENOENT';
  throw err;
}

export function existsSync(file) {
  return Object.prototype.hasOwnProperty.call(registry, baseName(file));
}

export function mkdirSync() {
  return undefined;
}

export function registerFile(name, contents) {
  registry[name] = contents;
}

export default { readFileSync, existsSync, mkdirSync, registerFile };

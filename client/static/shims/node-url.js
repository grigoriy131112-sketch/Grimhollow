// `node:url` for the browser. fileURLToPath only needs to yield a stable
// string whose dirname/basename behave; the returned value is used to build
// inert paths (schema.sql lookup uses the basename registry in node-fs.js).
export function fileURLToPath(url) {
  const s = String(url);
  try {
    return new URL(s).pathname;
  } catch {
    return s.replace(/^file:\/\//, '');
  }
}

export function pathToFileURL(p) {
  return new URL(`file://${p}`);
}

export default { fileURLToPath, pathToFileURL };

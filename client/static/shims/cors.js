// `cors` is a no-op in the browser build: same-origin by definition.
export default function cors() {
  return (_req, _res, next) => (next ? next() : undefined);
}

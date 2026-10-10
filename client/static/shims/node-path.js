// Minimal POSIX `node:path` for the browser. Only the handful of calls the
// Grimhollow server makes (join/resolve/dirname/basename) are implemented; the
// path strings themselves are inert because the Vite shim plugin rewrites the
// server's schema.sql import, so nothing real is opened at runtime.
function normalizeParts(parts) {
  const joined = parts.filter((p) => p !== '').join('/');
  const absolute = joined.startsWith('/');
  const out = [];
  for (const seg of joined.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { out.pop(); continue; }
    out.push(seg);
  }
  return (absolute ? '/' : '') + out.join('/');
}

export function join(...parts) {
  return normalizeParts(parts);
}

export function resolve(...parts) {
  return normalizeParts(['/', ...parts]);
}

export function dirname(p) {
  const s = String(p);
  const i = s.lastIndexOf('/');
  if (i < 0) return '.';
  if (i === 0) return '/';
  return s.slice(0, i);
}

export function basename(p, ext) {
  const s = String(p);
  const base = s.slice(s.lastIndexOf('/') + 1);
  if (ext && base.endsWith(ext)) return base.slice(0, -ext.length);
  return base;
}

export default { join, resolve, dirname, basename, sep: '/' };

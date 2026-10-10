// Minimal Express-compatible shim for the browser. It implements just the
// router surface the Grimhollow server uses: Router(), use(prefixOrRouter, mw),
// get/post/delete, plus async handlers. `request()` is the only exported entry
// point the app calls: it turns a { method, url, body } into a JSON response by
// matching the mounted routers exactly like Express would.

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all'];

function compilePath(path) {
  // '/:id' and '/slot/:id' -> regex with named groups; ':id' matches one segment.
  const keys = [];
  const pattern = String(path)
    .replace(/\/+$/, '')
    .replace(/\/:([A-Za-z0-9_]+)/g, (_, name) => {
      keys.push(name);
      return '/([^/]+)';
    });
  return { regex: new RegExp(`^${pattern}/?$`), keys };
}

class Layer {
  constructor(method, path, handler) {
    this.method = method;
    this.path = path;
    this.handler = handler;
    const compiled = compilePath(path);
    this.regex = compiled.regex;
    this.keys = compiled.keys;
  }

  match(method, pathname) {
    if (this.method !== 'all' && this.method !== method) return null;
    const m = this.regex.exec(pathname);
    if (!m) return null;
    const params = {};
    this.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    return params;
  }
}

class RouterImpl {
  constructor() {
    this.layers = [];
    this._mounts = [];
    this.__isRouter = true;
  }

  _register(method, path, handler) {
    this.layers.push(new Layer(method, path, handler));
    return this;
  }

  use(a, b) {
    // Express's two-argument form mounts a sub-router at a prefix.
    if (typeof a === 'string' && b && b.__isRouter) {
      this._mounts.push({ prefix: a.replace(/\/+$/, ''), router: b });
      return this;
    }
    // Middleware form (express.json() / cors()) is a no-op here: the app always
    // receives an already-parsed JSON body.
    return this;
  }

  get(p, h) { return this._register('get', p, h); }
  post(p, h) { return this._register('post', p, h); }
  put(p, h) { return this._register('put', p, h); }
  patch(p, h) { return this._register('patch', p, h); }
  delete(p, h) { return this._register('delete', p, h); }
  all(p, h) { return this._register('all', p, h); }
}

// Express's Router is a factory function (`const router = Router()`), not a
// class, so callers must be able to call it without `new`.
export function Router() {
  return new RouterImpl();
}

class Request {
  constructor(method, pathname, params, body, query) {
    this.method = method.toUpperCase();
    this.path = pathname;
    this.params = params || {};
    this.body = body;
    this.query = query || {};
  }
  get(name) {
    const key = String(name).toLowerCase();
    if (key === 'host') return location.host;
    return undefined;
  }
}

class Response {
  constructor(resolve) {
    this._resolve = resolve;
    this._status = 200;
    this._body = undefined;
    this._finished = false;
  }

  status(code) {
    this._status = code;
    return this;
  }

  json(data) {
    this._finish(data === undefined ? null : data);
    return this;
  }

  send(data) {
    this._finish(data === undefined ? '' : data);
    return this;
  }

  end(data) {
    this._finished = true;
    this._resolve(new Response_(this._status, data === undefined ? null : data));
    return this;
  }

  _finish(data) {
    this._finished = true;
    this._resolve(new Response_(this._status, data));
  }
}

class Response_ {
  constructor(status, body) {
    this.status = status;
    this.body = body;
    this.ok = status >= 200 && status < 300;
  }
  async json() { return this.body; }
  async text() {
    return typeof this.body === 'string' ? this.body : JSON.stringify(this.body);
  }
}

function errorResponse(err) {
  const message = err && err.message ? err.message : 'Internal server error';
  // Routes throw plain Errors for bad input and expect 400; anything else is 500.
  const status = /не найден|некоррект|invalid|required|должн|должен|missing/i.test(message) ? 400 : 500;
  return new Response_(status, { error: message });
}

// Resolve one request against a router, honouring mounted sub-routers. Returns
// a Response_ or null when nothing matched. Thrown errors bubble to the caller.
export async function dispatch(router, method, pathname, body) {
  const query = {};
  const qi = pathname.indexOf('?');
  let path = pathname;
  if (qi >= 0) {
    path = pathname.slice(0, qi);
    for (const [k, v] of new URLSearchParams(pathname.slice(qi + 1))) query[k] = v;
  }
  const m = method.toLowerCase();

  // Sub-routers first (Express strips the mount prefix before matching).
  for (const { prefix, router: sub } of router._mounts) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      const rest = path.slice(prefix.length) || '/';
      const handled = await dispatch(sub, m, rest, body);
      if (handled !== null) return handled;
    }
  }

  for (const layer of router.layers) {
    const params = layer.match(m, path);
    if (!params) continue;
    const req = new Request(m, path, params, body, query);
    const result = await new Promise((resolve) => {
      const res = new Response(resolve);
      let returned;
      try {
        returned = layer.handler(req, res);
      } catch (err) {
        resolve(errorResponse(err));
        return;
      }
      if (returned && typeof returned.then === 'function') {
        returned.catch((err) => resolve(errorResponse(err)));
      }
    });
    return result;
  }
  return null;
}

export function json() {
  return (_req, _res, next) => (next ? next() : undefined);
}

export function staticMiddleware() {
  return (_req, _res, next) => (next ? next() : undefined);
}

// The server does `import express from 'express'` and then calls express() to
// build the app, express.json() for the body parser, and express.static() for
// the SPA. Mirror that default export exactly.
function express() {
  return new RouterImpl();
}
express.Router = Router;
express.json = json;
express.static = staticMiddleware;
express.application = {};

export default express;


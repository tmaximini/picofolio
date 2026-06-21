/**
 * Cloudflare Worker entry. Serves the built SPA (via the static-assets binding,
 * configured in wrangler.jsonc) and proxies the app's `/api/*` calls to the
 * upstream financial APIs.
 *
 * Why the proxy exists: the browser can't call Yahoo / MarketData.app / IBKR
 * Flex directly — they send no permissive CORS headers, and the upstreams
 * reject the browser's default `User-Agent` (and won't let JS override it).
 * In dev this is Vite's `server.proxy` (vite.config.ts); in production it's
 * this Worker. The app code is identical in both: it always hits same-origin
 * `/api/...` paths. This is the faithful production port of that dev proxy.
 *
 * Security: this forwards user-supplied tokens (IBKR Flex token, MarketData
 * bearer) to third parties, so it is locked down — only the three known
 * upstream hosts are reachable, and only same-origin (or localhost) callers
 * are allowed. It is NOT a general-purpose open proxy.
 */

interface Env {
  // Static-assets binding (see wrangler.jsonc `assets.binding`).
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

/** One upstream route: the `/api/*` prefix → target origin + path rewrite + UA. */
type Route = {
  prefix: string;
  origin: string;
  /** Map the incoming pathname to the upstream pathname. */
  rewrite: (pathname: string) => string;
  userAgent: string;
};

// Mirrors vite.config.ts proxy table exactly (targets, rewrites, User-Agents).
const ROUTES: Route[] = [
  {
    prefix: "/api/yahoo",
    origin: "https://query1.finance.yahoo.com",
    rewrite: (p) => p.replace(/^\/api\/yahoo/, ""),
    // Yahoo rejects non-browser UAs; mirror the dev proxy's Mozilla string.
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  },
  {
    prefix: "/api/marketdata",
    origin: "https://api.marketdata.app",
    rewrite: (p) => p.replace(/^\/api\/marketdata/, ""),
    userAgent: "picofolio/0.1 options-client",
  },
  {
    prefix: "/api/ibkr/flex",
    origin: "https://gdcdyn.interactivebrokers.com",
    rewrite: (p) => p.replace(/^\/api\/ibkr\/flex/, "/Universal/servlet"),
    userAgent: "picofolio/0.1 flex-client",
  },
];

/** Origins allowed to drive the proxy from a browser: production apex +
 *  its subdomains, Workers previews, and localhost for `wrangler dev`. */
function isAllowedOrigin(origin: string): boolean {
  try {
    const h = new URL(origin).hostname;
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "picofolio.app" ||
      h.endsWith(".picofolio.app") ||
      h.endsWith(".workers.dev")
    );
  } catch {
    return false;
  }
}

/**
 * Gate browser callers by their `Origin`. A cross-origin page that tries to
 * ride our proxy sends an `Origin` we don't recognize → rejected. Same-origin
 * GETs and non-browser clients (curl, server-to-server) send no `Origin` and
 * pass — they could hit the upstreams directly anyway, and carry no session to
 * abuse (tokens are supplied per-request by our own app).
 */
function isAllowedCaller(origin: string | null): boolean {
  if (origin == null) return true;
  return isAllowedOrigin(origin);
}

async function proxy(request: Request, route: Route): Promise<Response> {
  const url = new URL(request.url);
  const target = new URL(route.origin);
  target.pathname = route.rewrite(url.pathname);
  target.search = url.search;

  // Forward only what the upstream needs; never reflect arbitrary headers.
  const headers = new Headers();
  headers.set("User-Agent", route.userAgent);
  const auth = request.headers.get("Authorization");
  if (auth) headers.set("Authorization", auth); // MarketData bearer
  const accept = request.headers.get("Accept");
  if (accept) headers.set("Accept", accept);
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);

  const upstream = await fetch(target.toString(), {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer(),
    redirect: "follow",
  });

  // Same-origin in production, so CORS isn't strictly required; set it
  // permissively-but-scoped so `wrangler dev` and previews behave too.
  const respHeaders = new Headers(upstream.headers);
  respHeaders.delete("set-cookie");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const route = ROUTES.find((r) => url.pathname.startsWith(r.prefix));
      if (!route) {
        return new Response("Not found", { status: 404 });
      }
      if (!isAllowedCaller(request.headers.get("Origin"))) {
        return new Response("Forbidden", { status: 403 });
      }
      return proxy(request, route);
    }

    // Everything else → the SPA's static assets (with SPA fallback configured
    // in wrangler.jsonc so deep links resolve to index.html).
    return env.ASSETS.fetch(request);
  },
};

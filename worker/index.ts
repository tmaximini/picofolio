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
 * bearer) to third parties, so it is locked down:
 *  - only allow-listed paths on the three known upstream hosts are reachable;
 *  - only our own pages may call it (Origin / Sec-Fetch-Site), GET/HEAD only;
 *  - the Flex token arrives in a header and is moved into IBKR's `t=` param
 *    here, so current clients never put it in a request URL (and thus never
 *    in logs, caches or HAR files);
 *  - only a handful of response headers pass back, redirects aren't followed
 *    (a bearer must not ride a redirect), and nothing is cacheable.
 * It is NOT a general-purpose open proxy.
 */

interface Env {
  // Static-assets binding (see wrangler.jsonc `assets.binding`).
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  /** Set to "1" (in .dev.vars) to allow localhost callers under `wrangler dev`. */
  ALLOW_LOCALHOST?: string;
}

/** One upstream route: the `/api/*` prefix → target origin + path rewrite + UA. */
type Route = {
  prefix: string;
  origin: string;
  /** Upstream paths this route may reach (after rewrite). */
  allow: RegExp;
  /** Map the incoming pathname to the upstream pathname. */
  rewrite: (pathname: string) => string;
  userAgent: string;
  /** Header carrying a token to move into the upstream query string. */
  tokenHeader?: { name: string; param: string };
};

// Mirrors vite.config.ts proxy table (targets, rewrites, User-Agents).
const ROUTES: Route[] = [
  {
    prefix: "/api/yahoo",
    origin: "https://query1.finance.yahoo.com",
    allow: /^\/v\d+\/finance\/(chart|quote|search)(\/[A-Za-z0-9.^=%\-_]+)?$/,
    rewrite: (p) => p.replace(/^\/api\/yahoo/, ""),
    // Yahoo rejects non-browser UAs; mirror the dev proxy's Mozilla string.
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  },
  {
    prefix: "/api/marketdata",
    origin: "https://api.marketdata.app",
    allow: /^\/v1\/options\/[a-z]+\/[A-Za-z0-9.%\-_]+\/?$/,
    rewrite: (p) => p.replace(/^\/api\/marketdata/, ""),
    userAgent: "picofolio/0.1 options-client",
  },
  {
    prefix: "/api/ibkr/flex",
    origin: "https://gdcdyn.interactivebrokers.com",
    allow: /^\/Universal\/servlet\/FlexStatementService\.(SendRequest|GetStatement)$/,
    rewrite: (p) => p.replace(/^\/api\/ibkr\/flex/, "/Universal/servlet"),
    userAgent: "picofolio/0.1 flex-client",
    tokenHeader: { name: "X-Flex-Token", param: "t" },
  },
];

/** Response headers worth passing back; everything else is dropped. */
const PASS_HEADERS = ["content-type", "content-length", "content-encoding", "retry-after"];

function isAllowedOrigin(origin: string, env: Env): boolean {
  try {
    const u = new URL(origin);
    const h = u.hostname;
    if (h === "localhost" || h === "127.0.0.1") return env.ALLOW_LOCALHOST === "1";
    return (
      u.protocol === "https:" &&
      (h === "picofolio.app" || h.endsWith(".picofolio.app") || h.endsWith(".picofolio.workers.dev"))
    );
  } catch {
    return false;
  }
}

/**
 * Only our own pages may drive the proxy. Browsers always send
 * Sec-Fetch-Site on fetch(); same-origin GETs may omit Origin, so accept
 * either a same-origin fetch-metadata header or an allow-listed Origin.
 * Requests with neither (curl, servers) are refused — no free relay.
 */
function isAllowedCaller(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  if (origin != null) return isAllowedOrigin(origin, env);
  return request.headers.get("Sec-Fetch-Site") === "same-origin";
}

/** A browser navigation to a client-side route other than the landing page. */
function isAppNavigation(request: Request, url: URL): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (url.pathname === "/" || /\.[a-z0-9]+$/i.test(url.pathname)) return false;
  return (request.headers.get("Accept") ?? "").includes("text/html");
}

function deny(status: number, text: string): Response {
  return new Response(text, { status, headers: { "Cache-Control": "no-store" } });
}

async function proxy(request: Request, route: Route): Promise<Response> {
  const url = new URL(request.url);
  const target = new URL(route.origin);
  target.pathname = route.rewrite(url.pathname);
  // The URL setter normalizes dot-segments — check the result, not the input.
  if (target.origin !== route.origin || !route.allow.test(target.pathname)) {
    return deny(404, "Not found");
  }
  target.search = url.search;

  if (route.tokenHeader) {
    const { name, param } = route.tokenHeader;
    // Current clients send the token in the header. A `t=` in the URL comes
    // from a tab still running a pre-header build: rejecting it can't un-send
    // the token, and the old bundle can't show a useful error — so honour it
    // (invocation logs are off) and let the reload migrate the tab.
    const token = request.headers.get(name) ?? url.searchParams.get(param);
    target.searchParams.delete(param);
    if (token) target.searchParams.set(param, token);
  }

  // Forward only what the upstream needs; never reflect arbitrary headers.
  const headers = new Headers();
  headers.set("User-Agent", route.userAgent);
  const auth = request.headers.get("Authorization");
  if (auth) headers.set("Authorization", auth); // MarketData bearer
  const accept = request.headers.get("Accept");
  if (accept) headers.set("Accept", accept);

  const upstream = await fetch(target.toString(), {
    method: request.method,
    headers,
    redirect: "manual",
  });

  const respHeaders = new Headers();
  for (const h of PASS_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) respHeaders.set(h, v);
  }
  respHeaders.set("Cache-Control", "no-store");
  respHeaders.set("X-Content-Type-Options", "nosniff");
  // Upstream redirects surface as a gateway error rather than being followed.
  const status = upstream.status >= 300 && upstream.status < 400 ? 502 : upstream.status;
  return new Response(upstream.body, { status, headers: respHeaders });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const route = ROUTES.find(
        (r) => url.pathname === r.prefix || url.pathname.startsWith(r.prefix + "/"),
      );
      if (!route) return deny(404, "Not found");
      if (request.method !== "GET" && request.method !== "HEAD") {
        return deny(405, "Method not allowed");
      }
      if (!isAllowedCaller(request, env)) return deny(403, "Forbidden");
      return proxy(request, route);
    }

    // App routes (/overview, /holdings, …) get the plain SPA shell; "/" keeps
    // index.html, which carries the prerendered landing page. Otherwise a
    // set-up user deep-linking into the app would see landing markup flash
    // before the bundle takes over. (html_handling serves app.html at /app.)
    if (isAppNavigation(request, url)) {
      return env.ASSETS.fetch(new Request(new URL("/app", url), request));
    }
    return env.ASSETS.fetch(request);
  },
};

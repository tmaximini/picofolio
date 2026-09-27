// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";

const env = { ASSETS: { fetch: async () => new Response("asset") } };
const SAME = { "Sec-Fetch-Site": "same-origin" };

function call(path: string, headers: Record<string, string> = SAME, method = "GET") {
  return worker.fetch(new Request(`https://picofolio.app${path}`, { method, headers }), env);
}

function mockUpstream(res = new Response("<ok/>", { headers: { "content-type": "text/xml", "set-cookie": "a=b", server: "x" } })) {
  const f = vi.fn(async (..._args: unknown[]) => res);
  vi.stubGlobal("fetch", f);
  return f;
}

afterEach(() => vi.unstubAllGlobals());

describe("worker proxy", () => {
  it("moves the Flex token from header to IBKR's t= param", async () => {
    const f = mockUpstream();
    const res = await call("/api/ibkr/flex/FlexStatementService.SendRequest?q=123&v=3", {
      ...SAME,
      "X-Flex-Token": "secret",
    });
    expect(res.status).toBe(200);
    const target = new URL(String(f.mock.calls[0]![0]));
    expect(target.host).toBe("gdcdyn.interactivebrokers.com");
    expect(target.searchParams.get("t")).toBe("secret");
    expect(target.searchParams.get("q")).toBe("123");
  });

  it("refuses a Flex token in the URL", async () => {
    mockUpstream();
    const res = await call("/api/ibkr/flex/FlexStatementService.SendRequest?t=secret&q=1");
    expect(res.status).toBe(400);
  });

  it("only reaches allow-listed upstream paths", async () => {
    const f = mockUpstream();
    for (const p of [
      "/api/ibkr/flex/../../../etc",
      "/api/ibkr/flex/%2e%2e/%2e%2e/admin",
      "/api/ibkr/flexfoo/FlexStatementService.SendRequest",
      "/api/yahoo//evil.com/x",
      "/api/marketdata/v1/user",
    ]) {
      // Either refused, or normalized out of /api/ into the static assets.
      const res = await call(p);
      expect(await res.text()).not.toBe("<ok/>");
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("allows the app's real endpoints", async () => {
    const f = mockUpstream();
    for (const p of [
      "/api/yahoo/v8/finance/chart/0700.HK?range=1y",
      "/api/yahoo/v8/finance/chart/%5EGSPC",
      "/api/yahoo/v8/finance/chart/EURUSD%3DX",
      "/api/yahoo/v1/finance/search?q=nv",
      "/api/marketdata/v1/options/quotes/AAPL250117C00150000/",
    ]) {
      expect((await call(p)).status).toBe(200);
    }
    expect(f).toHaveBeenCalledTimes(5);
  });

  it("gates callers: no fetch metadata, foreign or workers.dev origins are refused", async () => {
    mockUpstream();
    const p = "/api/yahoo/v1/finance/search?q=x";
    expect((await call(p, {})).status).toBe(403);
    expect((await call(p, { Origin: "https://evil.com" })).status).toBe(403);
    expect((await call(p, { Origin: "https://attacker.workers.dev" })).status).toBe(403);
    expect((await call(p, { Origin: "http://localhost:8787" })).status).toBe(403);
    expect((await call(p, { Origin: "https://picofolio.app" })).status).toBe(200);
  });

  it("rejects non-GET, strips upstream headers, marks no-store, blocks redirects", async () => {
    mockUpstream();
    expect((await call("/api/yahoo/v1/finance/search", SAME, "POST")).status).toBe(405);
    const res = await call("/api/yahoo/v1/finance/search?q=x");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("server")).toBeNull();
    expect(res.headers.get("content-type")).toBe("text/xml");
    expect(res.headers.get("cache-control")).toBe("no-store");
    mockUpstream(new Response(null, { status: 302, headers: { location: "https://evil.com" } }));
    expect((await call("/api/yahoo/v1/finance/search?q=x")).status).toBe(502);
  });
});

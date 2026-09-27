/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // happy-dom for DOMParser — the Flex XML parser tests need it.
    environment: "happy-dom",
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Yahoo Finance daily-close endpoint. Strip browser-y headers
      // that trip the upstream and set a Mozilla UA so it responds.
      "/api/yahoo": {
        target: "https://query1.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("origin");
            proxyReq.removeHeader("referer");
            proxyReq.setHeader(
              "User-Agent",
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            );
          });
        },
      },
      // MarketData.app options-quotes endpoint. Bearer token is set by the
      // fetch and forwarded; strip browser-y headers like the others.
      "/api/marketdata": {
        target: "https://api.marketdata.app",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/marketdata/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("origin");
            proxyReq.removeHeader("referer");
            proxyReq.setHeader("User-Agent", "picofolio/0.1 (dev) options-client");
          });
        },
      },
      // IBKR Flex Web Service. Two endpoints: SendRequest + GetStatement.
      // Maps /api/ibkr/flex/FlexStatementService.* → IBKR's current Flex Web
      // Service host (ndcdyn …/AccountManagement/FlexWebService/*). The
      // production Worker also falls back to the legacy gdcdyn host.
      "/api/ibkr/flex": {
        target: "https://ndcdyn.interactivebrokers.com",
        changeOrigin: true,
        secure: true,
        // The client sends the token in X-Flex-Token (never the URL); it is
        // moved into IBKR's required `t=` param below. A legacy `t=` from a
        // stale tab passes through untouched. Mirrors worker/index.ts.
        rewrite: (path) =>
          path.replace(/^\/api\/ibkr\/flex\/FlexStatementService\./, "/AccountManagement/FlexWebService/"),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const token = req.headers["x-flex-token"];
            if (typeof token === "string" && token) {
              const u = new URL(proxyReq.path, "http://x");
              u.searchParams.set("t", token);
              proxyReq.path = u.pathname + u.search;
            }
            proxyReq.removeHeader("x-flex-token");
            proxyReq.removeHeader("origin");
            proxyReq.removeHeader("referer");
            proxyReq.setHeader(
              "User-Agent",
              "picofolio/0.1 (dev) flex-client",
            );
          });
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

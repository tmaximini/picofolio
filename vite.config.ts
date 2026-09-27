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
      // Maps /api/ibkr/flex/FlexStatementService.* → gdcdyn.interactivebrokers.com/Universal/servlet/*
      "/api/ibkr/flex": {
        target: "https://gdcdyn.interactivebrokers.com",
        changeOrigin: true,
        secure: true,
        // The client sends the token in X-Flex-Token (never the URL); move
        // it into IBKR's required `t=` param here. Any `t=` the caller put
        // in the URL is dropped. Mirrors worker/index.ts.
        rewrite: (path) => {
          const u = new URL(path, "http://x");
          u.searchParams.delete("t");
          return u.pathname.replace(/^\/api\/ibkr\/flex/, "/Universal/servlet") + u.search;
        },
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const token = req.headers["x-flex-token"];
            if (typeof token === "string" && token) {
              const sep = proxyReq.path.includes("?") ? "&" : "?";
              proxyReq.path += `${sep}t=${encodeURIComponent(token)}`;
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

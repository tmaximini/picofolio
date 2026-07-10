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
        rewrite: (path) =>
          path.replace(/^\/api\/ibkr\/flex/, "/Universal/servlet"),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
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

/**
 * Build-time prerender of the landing page ("/"), so crawlers and link
 * unfurlers get real HTML instead of an empty #root, and first paint doesn't
 * wait on the bundle. Rendered through the same AppInner tree the client
 * uses (store in its fresh first-run state), so main.tsx can hydrate it.
 * Built by `vite build --ssr`; consumed by scripts/prerender.mjs.
 */
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { AppInner } from "./App";

export function render(): string {
  return renderToString(
    <StrictMode>
      <StaticRouter location="/">
        <AppInner />
      </StaticRouter>
    </StrictMode>,
  );
}

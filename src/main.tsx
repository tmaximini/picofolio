import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App";
import { useStore } from "./store";
import "./styles/tokens.css";
import "./styles/primitives.css";
import "./styles/app.css";
import "./styles/journal.css";
import "./styles/capture.css";
import "./styles/share.css";
import "./styles/settings.css";
import "./styles/cmdk.css";
import "./styles/toast.css";
import "./styles/switcher.css";
import "./styles/mobile.css";
import "./styles/landing.css";
import "./styles/watchlist.css";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// "/" ships with the landing page prerendered (scripts/prerender.mjs). A
// first-run visitor there renders the exact same tree, so hydrate it in place.
// Anyone else — a set-up user being forwarded to /overview, or the dev server
// (no prerender) — gets a clean client render.
if (root.firstElementChild && location.pathname === "/" && !useStore.getState().onboarded) {
  hydrateRoot(root, app);
} else {
  root.textContent = "";
  createRoot(root).render(app);
}

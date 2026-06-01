import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/primitives.css";
import "./styles/app.css";
import "./styles/journal.css";
import "./styles/settings.css";
import "./styles/cmdk.css";
import "./styles/toast.css";
import "./styles/switcher.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { applyTokens } from "./theme/applyTokens";
import { applyDisplayPrefs } from "./lib/prefs";
import "./theme/global.css";

applyTokens();
applyDisplayPrefs();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

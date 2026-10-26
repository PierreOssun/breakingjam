import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./i18n";
import { reloadOnNewBuild } from "./lib/reloadOnNewBuild";
import { applyTheme } from "./lib/theme";
import "./styles/index.css";

applyTheme();
reloadOnNewBuild();

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

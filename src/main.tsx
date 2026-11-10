import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { HomeProvider } from "./hooks/useHome";
import { createDemoAdapter } from "./data/demo";
import "./styles.css";
import { mountStandalone } from "./standalone";

if (import.meta.env.MODE === "standalone") {
  mountStandalone(document.getElementById("root")!);
} else {
const adapter = createDemoAdapter();
if (import.meta.hot) import.meta.hot.dispose(() => adapter.dispose());

const deployedVersion = document
  .querySelector<HTMLMetaElement>('meta[name="kiosk-deploy"]')
  ?.getAttribute("content");
if (deployedVersion) {
  window.setInterval(async () => {
    try {
      const response = await fetch("/index.html", { cache: "no-store" });
      if (!response.ok) return;
      const page = new DOMParser().parseFromString(await response.text(), "text/html");
      const nextVersion = page.querySelector('meta[name="kiosk-deploy"]')?.getAttribute("content");
      if (nextVersion && nextVersion !== deployedVersion) window.location.reload();
    } catch {
      // Keep showing the current dashboard while the local server is unavailable.
    }
  }, 15000);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HomeProvider adapter={adapter}>
      <App />
    </HomeProvider>
  </StrictMode>,
);
}

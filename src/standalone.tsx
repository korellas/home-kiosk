import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { HomeProvider } from "./hooks/useHome";
import { createHassAdapter } from "./data/hass";
import type { HomeAssistant, PanelConfig } from "./data/hass";
import { ConnectionSettings } from "./components/ConnectionSettings";

const endpoint = (path: string) => new URL(path, document.baseURI).href;

function StandaloneApp({ adapter }: { adapter: ReturnType<typeof createHassAdapter> }) {
  const [config, setConfig] = useState<PanelConfig>({});
  const configRef = useRef(config);
  const [canConfigure, setCanConfigure] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    let disposed = false;
    let wasConnected = false;
    const source = new EventSource(endpoint("api/events"));
    source.onmessage = (event) => {
      const state = JSON.parse(event.data) as HomeAssistant & { config: PanelConfig };
      configRef.current = state.config;
      setConfig(state.config);
      adapter.update(state, state.config);
      if (!state.connected) setCanConfigure(false);
      if (state.connected && !wasConnected) {
        void fetch(endpoint("api/session"), { cache: "no-store" }).then(async (response) => {
          if (!response.ok) return;
          const session = await response.json() as { can_configure: boolean };
          if (!disposed) setCanConfigure(session.can_configure);
        }).catch(() => { /* Keep the dashboard usable while HA reconnects. */ });
      }
      wasConnected = state.connected;
    };
    source.onerror = () => {
      wasConnected = false;
      setCanConfigure(false);
      adapter.update({ connected: false, states: {} }, configRef.current);
    };
    return () => { disposed = true; source.close(); };
  }, [adapter]);
  return <App
    configure={canConfigure ? () => setSettingsOpen(true) : undefined}
    configuration={settingsOpen && <ConnectionSettings
      config={config}
      endpoint={endpoint}
      close={() => setSettingsOpen(false)}
    />}
  />;
}

export function mountStandalone(container: HTMLElement) {
  const adapter = createHassAdapter(endpoint("api/camera"));
  createRoot(container).render(<HomeProvider adapter={adapter}><StandaloneApp adapter={adapter} /></HomeProvider>);
  if (import.meta.hot) import.meta.hot.dispose(() => adapter.dispose());
}

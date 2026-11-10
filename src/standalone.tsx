import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { HomeProvider } from "./hooks/useHome";
import { createHassAdapter } from "./data/hass";
import type { HomeAssistant, PanelConfig } from "./data/hass";
import { ConnectionSettings } from "./components/ConnectionSettings";

import { playChime } from "./data/chime";

const endpoint = (path: string) => new URL(path, document.baseURI).href;

function StandaloneApp({ adapter }: { adapter: ReturnType<typeof createHassAdapter> }) {
  const [config, setConfig] = useState<PanelConfig>({});
  const configRef = useRef(config);
  const [localDisplay, setLocalDisplay] = useState(false);
  const chime = useCallback(() => playChime(config.local_volume ?? 60), [config.local_volume]);
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
          const session = await response.json() as { can_configure: boolean; local_display: boolean };
          if (!disposed) { setCanConfigure(session.can_configure); setLocalDisplay(session.local_display); }
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
    chime={localDisplay && config.local_sound ? chime : undefined}
    configure={canConfigure ? () => setSettingsOpen(true) : undefined}
    configuration={settingsOpen && <ConnectionSettings
      config={config}
      endpoint={endpoint}
      close={() => setSettingsOpen(false)}
    />}
  />;
}

export function mountStandalone(container: HTMLElement) {
  const adapter = createHassAdapter(endpoint("api/camera"), async command => {
    const response = await fetch(endpoint("api/command"), { method: "POST", headers: { "Content-Type": "application/json", "X-Home-Kiosk": "settings" }, body: JSON.stringify(command) });
    if (!response.ok) { const error = await response.json() as { message?: string }; throw new Error(error.message || "기기를 제어하지 못했어요."); }
  });
  createRoot(container).render(<HomeProvider adapter={adapter}><StandaloneApp adapter={adapter} /></HomeProvider>);
  if (import.meta.hot) import.meta.hot.dispose(() => adapter.dispose());
}

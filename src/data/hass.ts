import type { HomeAdapter, HomeSnapshot } from "./types.ts";

export interface HassEntity {
  state: string;
  attributes: Record<string, unknown>;
}
export interface HomeAssistant {
  connected: boolean;
  states: Record<string, HassEntity>;
}
export interface PanelConfig {
  doorbell_entity?: string;
  camera_entity?: string;
}

function emptySnapshot(): HomeSnapshot {
  return {
    connection: "offline",
    rooms: {
      living: { lights: [], scene: null },
      kitchen: { lights: [], scene: null },
      dining: { lights: [], scene: null },
    },
    environment: {
      indoor: null, humidity: null, indoorPm25: null, outdoorPm25: null,
      indoorAirLabel: null, outdoorAirLabel: null,
    },
    weather: { temperature: null, high: null, low: null, description: "미연동" },
    climate: {
      available: false, on: false, current: null, target: 25, min: 18, max: 30,
      mode: "auto", modes: [], fan: "auto", fans: [],
    },
    curtain: { available: false, position: null, direction: 0, supportsPosition: false },
    ventilation: { available: false, mode: "auto", boostUntil: null },
    media: { available: false, title: null, artist: "", playing: false, volume: 0 },
    door: { configured: false, available: false, ringing: false, cameraUrl: null, missedCalls: 0, events: [] },
  };
}

function available(entity: HassEntity | undefined): entity is HassEntity {
  return !!entity && entity.state !== "unavailable" && entity.state !== "unknown";
}

export function createHassAdapter(cameraProxyUrl?: string): HomeAdapter & {
  update: (hass: HomeAssistant, config: PanelConfig) => void;
} {
  let snapshot = emptySnapshot();
  let previousEntity: string | undefined;
  let previousState: string | undefined;
  let initialized = false;
  const listeners = new Set<() => void>();
  const publish = (door: HomeSnapshot["door"], connection = snapshot.connection) => {
    snapshot = { ...snapshot, door, connection };
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update(hass, config) {
      const changed = previousEntity !== config.doorbell_entity;
      if (changed) {
        initialized = false;
        previousState = undefined;
        previousEntity = config.doorbell_entity;
      }
      const door = { ...snapshot.door, configured: !!config.doorbell_entity };
      if (changed) {
        door.ringing = false;
        door.events = [];
        door.missedCalls = 0;
      }
      if (!hass.connected) {
        initialized = false;
        publish({ ...door, available: false, cameraUrl: null, ringing: false }, "offline");
        return;
      }
      const bell = config.doorbell_entity ? hass.states[config.doorbell_entity] : undefined;
      const camera = config.camera_entity ? hass.states[config.camera_entity] : undefined;
      const picture = available(camera) ? camera.attributes.entity_picture : null;
      door.cameraUrl = available(camera) && cameraProxyUrl ? cameraProxyUrl : typeof picture === "string" && picture.startsWith("/api/camera_proxy/") ? picture : null;
      const waitingForFirstCall = !!bell && config.doorbell_entity?.startsWith("event.") && bell.state === "unknown";
      door.available = available(bell) || !!waitingForFirstCall;
      if (waitingForFirstCall) {
        initialized = true;
        previousState = bell.state;
        door.ringing = false;
      } else if (!available(bell)) {
        initialized = false;
        door.ringing = false;
      } else {
        const binary = config.doorbell_entity?.startsWith("binary_sensor.");
        const pressed = binary
          ? bell.state === "on" && previousState !== "on"
          : initialized && bell.state !== previousState && Number.isFinite(Date.parse(bell.state));
        if (pressed) {
          const time = binary ? new Date() : new Date(bell.state);
          door.ringing = true;
          door.missedCalls += 1;
          door.events = [{
            id: `${config.doorbell_entity}:${time.toISOString()}`,
            label: "현관 호출",
            time: time.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }),
          }, ...door.events].slice(0, 30);
        }
        previousState = bell.state;
        initialized = true;
      }
      publish(door, "online");
    },
    async execute(command) {
      if (command.type !== "door-dismiss") throw new Error("아직 연동하지 않은 기기입니다.");
      publish({ ...snapshot.door, ringing: false, missedCalls: 0 });
    },
    dispose() { listeners.clear(); },
  };
}

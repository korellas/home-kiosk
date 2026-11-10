import type { HomeAdapter, HomeSnapshot, HomeCommand, RoomId, HvacMode, FanMode } from "./types.ts";

export interface HassEntity {
  state: string;
  attributes: Record<string, unknown>;
}
export interface HomeAssistant {
  connected: boolean;
  sound_error?: string | null;
  states: Record<string, HassEntity>;
}
export interface PanelConfig {
  doorbell_entity?: string;
  camera_entity?: string;
  lights?: Partial<Record<RoomId, string[]>>;
  scenes?: Partial<Record<RoomId, Record<string, string>>>;
  climate_entity?: string;
  curtain_entity?: string;
  ventilation_entity?: string;
  media_entity?: string;
  weather_entity?: string;
  indoor_entity?: string;
  humidity_entity?: string;
  indoor_pm25_entity?: string;
  outdoor_pm25_entity?: string;
  co2_entity?: string;
  local_sound?: boolean;
  local_volume?: number;
  speaker_sound?: boolean;
  speaker_entity?: string;
  tts_entity?: string;
  announcement?: string;
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

function mappedState(hass: HomeAssistant, config: PanelConfig) {
  const entity = (id?: string) => id ? hass.states[id] : undefined;
  const numeric = (value: unknown): number | null => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
  const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter(v => typeof v === "string") : [];
  const has = (e: HassEntity | undefined, bit: number) => !!(Number(e?.attributes.supported_features) & bit);
  const mapRoom = (room: RoomId): HomeSnapshot["rooms"][RoomId] => ({
    scene: null,
    availableScenes: Object.entries(config.scenes?.[room] || {}).filter(([,id]) => !!entity(id)).map(([name]) => name),
    lights: (config.lights?.[room] || []).map(id => {
      const e = entity(id), a = e?.attributes || {}, modes = strings(a.supported_color_modes);
      const temperature = modes.includes("color_temp");
      return { id, name: String(a.friendly_name || id), available: available(e), on: e?.state === "on", dimmable: modes.some(mode => !["onoff", "unknown"].includes(mode)), brightness: Math.round((numeric(a.brightness) ?? 0) / 255 * 100), ...(temperature ? { kelvin: numeric(a.color_temp_kelvin) ?? 4000, kelvinRange: [numeric(a.min_color_temp_kelvin) ?? 2000, numeric(a.max_color_temp_kelvin) ?? 6500] as const } : {}) };
    }),
  });
  const rooms = { living: mapRoom("living"), kitchen: mapRoom("kitchen"), dining: mapRoom("dining") };
  const c = entity(config.climate_entity), ca = c?.attributes || {};
  const hvac = ["heat", "cool", "heat_cool", "auto", "dry", "fan_only"];
  const modes = strings(ca.hvac_modes).filter(mode => hvac.includes(mode)) as HvacMode[];
  const cover = entity(config.curtain_entity), fan = entity(config.ventilation_entity), media = entity(config.media_entity), weather = entity(config.weather_entity);
  const ma = media?.attributes || {};
  const fanModes: FanMode[] = [...(strings(fan?.attributes.preset_modes).includes("auto") ? ["auto" as const] : []), ...(has(fan, 1) ? ["low", "medium", "high"] as const : [])];
  const sensor = (id?: string) => { const e = entity(id); return available(e) ? numeric(e.state) : null; };
  return {
    rooms,
    environment: { indoor: sensor(config.indoor_entity), humidity: sensor(config.humidity_entity), indoorPm25: sensor(config.indoor_pm25_entity), outdoorPm25: sensor(config.outdoor_pm25_entity), co2: config.co2_entity ? sensor(config.co2_entity) : undefined, indoorAirLabel: null, outdoorAirLabel: null },
    weather: { temperature: available(weather) ? numeric(weather.attributes.temperature) : null, high: null, low: null, description: available(weather) ? weather.state : "미연동" },
    climate: { available: available(c), on: available(c) && c.state !== "off", current: numeric(ca.current_temperature), target: numeric(ca.temperature) ?? 25, min: numeric(ca.min_temp) ?? 7, max: numeric(ca.max_temp) ?? 35, step: numeric(ca.target_temp_step) ?? 1, supportsTemperature: has(c, 1), mode: (hvac.includes(c?.state || "") ? c!.state : modes[0] || "auto") as HvacMode, modes, fan: String(ca.fan_mode || "auto"), fans: strings(ca.fan_modes) },
    curtain: { available: available(cover), position: numeric(cover?.attributes.current_position), direction: (cover?.state === "opening" ? 1 : cover?.state === "closing" ? -1 : 0) as -1 | 0 | 1, supportsPosition: has(cover, 4), actions: (["open", "close", "stop"] as const).filter((_,i) => has(cover, [1,2,8][i])) },
    ventilation: { available: available(fan), mode: (fan?.attributes.preset_mode === "auto" ? "auto" : Number(fan?.attributes.percentage) > 66 ? "high" : Number(fan?.attributes.percentage) > 33 ? "medium" : "low") as FanMode, boostUntil: null, modes: fanModes, supportsBoost: false },
    media: { available: available(media), title: typeof ma.media_title === "string" ? ma.media_title : null, artist: String(ma.media_artist || ""), playing: media?.state === "playing", volume: Math.round((numeric(ma.volume_level) ?? 0) * 100), canPlay: has(media, 16384), canPause: has(media, 1), canPrevious: has(media, 16), canNext: has(media, 32), canVolume: has(media, 4), duration: numeric(ma.media_duration) ?? undefined, elapsed: numeric(ma.media_position) ?? undefined },
  };
}

export function createHassAdapter(cameraProxyUrl?: string, control?: (command: HomeCommand) => Promise<void>): HomeAdapter & {
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
      const door = { ...snapshot.door, soundError: hass.sound_error, configured: !!config.doorbell_entity };
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
      snapshot = { ...snapshot, ...mappedState(hass, config) };
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
          ? initialized && bell.state === "on" && previousState !== "on"
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
      if (command.type !== "door-dismiss") {
        if (!control) throw new Error("아직 연동하지 않은 기기입니다.");
        if (snapshot.connection !== "online") throw new Error("Home Assistant 연결을 기다리고 있어요.");
        return control(command);
      }
      publish({ ...snapshot.door, ringing: false, missedCalls: 0 });
    },
    dispose() { listeners.clear(); },
  };
}

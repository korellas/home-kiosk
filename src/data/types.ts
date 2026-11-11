export type RoomId = "living" | "kitchen" | "dining";
export type PageId = "home" | RoomId;
export type ScreenTheme = "classic" | "glass";
export type HvacMode = "cool" | "dry" | "fan_only" | "auto" | "heat" | "heat_cool";
export type FanMode = "auto" | "low" | "medium" | "high";

export interface Light {
  id: string;
  name: string;
  icon?: "ceiling" | "ambient" | "spot" | "floorLamp" | "pendant" | "wallLamp";
  on: boolean;
  available: boolean;
  dimmable: boolean;
  brightness: number;
  kelvin?: number;
  kelvinRange?: readonly [number, number];
}
export interface RoomState {
  lights: readonly Light[];
  scene: string | null;
  availableScenes?: readonly string[];
}
export interface ClimateState {
  available: boolean;
  on: boolean;
  current: number | null;
  target: number;
  min: number;
  max: number;
  mode: HvacMode;
  modes: readonly HvacMode[];
  fan: string;
  fans: readonly string[];
  supportsTemperature?: boolean;
  step?: number;
}
export interface HomeSnapshot {
  connection: "demo" | "online" | "offline";
  rooms: Record<RoomId, RoomState>;
  environment: {
    indoor: number | null;
    humidity: number | null;
    indoorPm25: number | null;
    outdoorPm25: number | null;
    indoorPm10?: number | null;
    outdoorPm10?: number | null;
    indoorAirLabel: string | null;
    outdoorAirLabel: string | null;
    co2?: number | null;
  };
  weather: {
    temperature: number | null;
    high: number | null;
    low: number | null;
    description: string;
    hourly?: readonly {
      label: string;
      condition: "weather" | "sun" | "rain" | "cloud" | "moon";
      temperature: number | null;
      rain: number | null;
    }[];
  };
  climate: ClimateState;
  curtain: {
    available: boolean;
    position: number | null;
    direction: -1 | 0 | 1;
    supportsPosition: boolean;
    actions?: readonly ("open" | "close" | "stop")[];
  };
  ventilation: { available: boolean; mode: FanMode; boostUntil: number | null; modes?: readonly FanMode[]; supportsBoost?: boolean };
  media: {
    available: boolean;
    title: string | null;
    artist: string;
    playing: boolean;
    volume: number;
    canPlay?: boolean;
    canPause?: boolean;
    canNext?: boolean;
    canPrevious?: boolean;
    canVolume?: boolean;
    artworkUrl?: string | null;
    elapsed?: number;
    duration?: number;
  };
  door: {
    soundError?: string | null;
    configured?: boolean;
    available?: boolean;
    ringing: boolean;
    cameraUrl: string | null;
    missedCalls: number;
    events: readonly {
      id: string;
      label: string;
      time: string;
      icon?: "missed" | "package" | "unlocked";
    }[];
  };
}
export type HomeCommand =
  | { type: "room-power"; room: RoomId; on: boolean }
  | {
      type: "light";
      room: RoomId;
      id: string;
      patch: Partial<Pick<Light, "on" | "brightness" | "kelvin">>;
    }
  | { type: "brightness"; room: RoomId; value: number }
  | { type: "scene"; room: RoomId; scene: string }
  | { type: "all-off" }
  | {
      type: "climate";
      patch: Partial<Pick<ClimateState, "on" | "target" | "mode" | "fan">>;
    }
  | { type: "curtain"; action: "open" | "close" | "stop" }
  | { type: "curtain-position"; value: number }
  | { type: "ventilation"; mode: FanMode }
  | { type: "boost"; on: boolean }
  | { type: "media-play"; playing: boolean }
  | { type: "media-volume"; value: number }
  | { type: "media-skip"; direction: "next" | "previous" }
  | { type: "door-dismiss" };

export interface HomeAdapter {
  getSnapshot: () => HomeSnapshot;
  subscribe: (listener: () => void) => () => void;
  execute: (command: HomeCommand) => Promise<void>;
  dispose: () => void;
}

import type {
  HomeAdapter,
  HomeCommand,
  HomeSnapshot,
  Light,
  RoomId,
  RoomState,
} from "./types.ts";
import { scenes } from "./rooms.ts";

function light(
  id: string,
  name: string,
  on: boolean,
  brightness: number,
  dimmable = true,
  kelvin?: number,
  icon?: Light["icon"],
): Light {
  return {
    id,
    name,
    icon,
    on,
    brightness,
    dimmable,
    available: true,
    kelvin,
    kelvinRange: kelvin ? [2700, 6500] : undefined,
  };
}
function initialState(): HomeSnapshot {
  return {
    connection: "demo",
    rooms: {
      living: {
        scene: "relax",
        lights: [
          light("living-main", "메인등", true, 40, true, 3800, "ceiling"),
          light(
            "living-ambient",
            "간접등",
            true,
            80,
            true,
            undefined,
            "ambient",
          ),
          light(
            "living-rail",
            "레일 조명",
            false,
            100,
            false,
            undefined,
            "spot",
          ),
          light(
            "living-floor",
            "스탠드",
            true,
            60,
            true,
            undefined,
            "floorLamp",
          ),
        ],
      },
      kitchen: {
        scene: null,
        lights: [
          light("kitchen-main", "주방 메인", true, 80, true, 5400, "ceiling"),
          light(
            "kitchen-pendant",
            "아일랜드 펜던트",
            true,
            80,
            true,
            undefined,
            "pendant",
          ),
          light(
            "kitchen-cabinet",
            "하부장 간접",
            false,
            100,
            false,
            undefined,
            "ambient",
          ),
        ],
      },
      dining: {
        scene: null,
        lights: [
          light(
            "dining-pendant",
            "식탁 펜던트",
            false,
            70,
            true,
            3500,
            "pendant",
          ),
          light(
            "dining-wall",
            "벽등",
            false,
            100,
            false,
            undefined,
            "wallLamp",
          ),
        ],
      },
    },
    environment: {
      indoor: 24.1,
      humidity: 52,
      indoorPm25: 8,
      outdoorPm25: 23,
      indoorPm10: 14,
      outdoorPm10: 41,
      indoorAirLabel: "좋음",
      outdoorAirLabel: "보통",
    },
    weather: {
      temperature: 21,
      high: 24,
      low: 15,
      description: "맑음 뒤 구름",
      hourly: [
        { label: "지금", condition: "weather", temperature: 21, rain: null },
        { label: "15시", condition: "sun", temperature: 23, rain: null },
        { label: "18시", condition: "rain", temperature: 20, rain: 30 },
        { label: "21시", condition: "cloud", temperature: 18, rain: 10 },
        { label: "00시", condition: "moon", temperature: 16, rain: null },
        { label: "내일", condition: "sun", temperature: 25, rain: null },
      ],
    },
    climate: {
      available: true,
      on: true,
      current: 26.5,
      target: 25,
      min: 18,
      max: 30,
      mode: "cool",
      modes: ["cool", "dry", "fan_only", "auto"],
      fan: "auto",
      fans: ["auto", "low", "medium", "high"],
    },
    curtain: {
      available: true,
      position: 100,
      direction: 0,
      supportsPosition: true,
    },
    ventilation: { available: true, mode: "auto", boostUntil: null },
    media: {
      available: true,
      title: "밤편지 (Live at 2026 Acoustic Session)",
      artist: "아이유 · 거실 스피커",
      playing: true,
      volume: 35,
      artworkUrl: null,
      elapsed: 96,
      duration: 253,
    },
    door: {
      ringing: false,
      cameraUrl: null,
      missedCalls: 1,
      events: [
        {
          id: "missed",
          label: "부재중 호출",
          time: "오늘 13:05",
          icon: "missed",
        },
        {
          id: "package",
          label: "택배 도착",
          time: "오늘 10:42",
          icon: "package",
        },
        {
          id: "opened",
          label: "문 열림 · 비밀번호",
          time: "오늘 08:15",
          icon: "unlocked",
        },
      ],
    },
  };
}
function range(value: number, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error(`${min}–${max} 범위의 값을 입력해 주세요.`);
}

export function createDemoAdapter(): HomeAdapter {
  let snapshot = initialState();
  const listeners = new Set<() => void>();
  let curtainTimer: ReturnType<typeof setInterval> | undefined;
  let boostTimer: ReturnType<typeof setTimeout> | undefined;
  const update = (patch: Partial<HomeSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  const updateRoom = (room: RoomId, patch: Partial<RoomState>) =>
    update({
      rooms: {
        ...snapshot.rooms,
        [room]: { ...snapshot.rooms[room], ...patch },
      },
    });
  const stopCurtain = () => {
    clearInterval(curtainTimer);
    curtainTimer = undefined;
  };

  async function execute(command: HomeCommand) {
    switch (command.type) {
      case "room-power":
        updateRoom(command.room, {
          scene: null,
          lights: snapshot.rooms[command.room].lights.map((l) => ({
            ...l,
            on: command.on,
          })),
        });
        break;
      case "light": {
        const current = snapshot.rooms[command.room].lights.find(
          (l) => l.id === command.id,
        );
        if (!current || !current.available)
          throw new Error("조명을 사용할 수 없어요.");
        const patch = command.patch;
        if (patch.brightness !== undefined) {
          if (!current.dimmable)
            throw new Error("밝기 조절을 지원하지 않아요.");
          range(patch.brightness, 0, 100);
        }
        if (patch.kelvin !== undefined) {
          if (!current.kelvinRange)
            throw new Error("색온도 조절을 지원하지 않아요.");
          range(patch.kelvin, ...current.kelvinRange);
        }
        updateRoom(command.room, {
          scene: null,
          lights: snapshot.rooms[command.room].lights.map((l) =>
            l.id === command.id ? { ...l, ...patch } : l,
          ),
        });
        break;
      }
      case "brightness": {
        range(command.value, 0, 100);
        const room = snapshot.rooms[command.room];
        const hasOn = room.lights.some((l) => l.on);
        updateRoom(command.room, {
          scene: null,
          lights: room.lights.map((l) =>
            !l.dimmable || !l.available || (hasOn && !l.on)
              ? l
              : { ...l, on: command.value > 0, brightness: command.value },
          ),
        });
        break;
      }
      case "scene": {
        const scene = scenes[command.room].find((s) => s.id === command.scene);
        if (!scene) throw new Error("장면을 찾을 수 없어요.");
        updateRoom(command.room, {
          scene: scene.id,
          lights: snapshot.rooms[command.room].lights.map((l, i) => ({
            ...l,
            on: scene.levels[i] > 0,
            brightness:
              l.dimmable && scene.levels[i] > 0
                ? scene.levels[i]
                : l.brightness,
          })),
        });
        break;
      }
      case "all-off": {
        const off = (room: RoomState): RoomState => ({
          scene: null,
          lights: room.lights.map((l) => ({ ...l, on: false })),
        });
        update({
          rooms: {
            living: off(snapshot.rooms.living),
            kitchen: off(snapshot.rooms.kitchen),
            dining: off(snapshot.rooms.dining),
          },
        });
        break;
      }
      case "climate": {
        const { patch } = command;
        if (patch.target !== undefined)
          range(patch.target, snapshot.climate.min, snapshot.climate.max);
        if (patch.mode && !snapshot.climate.modes.includes(patch.mode))
          throw new Error("지원하지 않는 운전 모드예요.");
        if (patch.fan && !snapshot.climate.fans.includes(patch.fan))
          throw new Error("지원하지 않는 풍량이에요.");
        update({ climate: { ...snapshot.climate, ...patch } });
        break;
      }
      case "curtain":
        stopCurtain();
        if (command.action === "stop") {
          update({ curtain: { ...snapshot.curtain, direction: 0 } });
        } else {
          const direction = command.action === "open" ? 1 : -1;
          update({ curtain: { ...snapshot.curtain, direction } });
          curtainTimer = setInterval(() => {
            const position = Math.max(
              0,
              Math.min(100, (snapshot.curtain.position ?? 0) + direction * 4),
            );
            const done = position === 0 || position === 100;
            update({
              curtain: {
                ...snapshot.curtain,
                position,
                direction: done ? 0 : direction,
              },
            });
            if (done) stopCurtain();
          }, 120);
        }
        break;
      case "curtain-position":
        range(command.value, 0, 100);
        stopCurtain();
        update({
          curtain: {
            ...snapshot.curtain,
            position: command.value,
            direction: 0,
          },
        });
        break;
      case "ventilation":
        clearTimeout(boostTimer);
        update({
          ventilation: {
            ...snapshot.ventilation,
            mode: command.mode,
            boostUntil: null,
          },
        });
        break;
      case "boost":
        clearTimeout(boostTimer);
        update({
          ventilation: {
            ...snapshot.ventilation,
            boostUntil: command.on ? Date.now() + 20 * 60_000 : null,
          },
        });
        if (command.on)
          boostTimer = setTimeout(
            () =>
              update({
                ventilation: { ...snapshot.ventilation, boostUntil: null },
              }),
            20 * 60_000,
          );
        break;
      case "media-play":
        update({ media: { ...snapshot.media, playing: command.playing } });
        break;
      case "media-volume":
        range(command.value, 0, 100);
        update({ media: { ...snapshot.media, volume: command.value } });
        break;
      case "door-dismiss":
        update({ door: { ...snapshot.door, ringing: false } });
        break;
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    execute,
    dispose: () => {
      stopCurtain();
      clearTimeout(boostTimer);
      listeners.clear();
    },
  };
}

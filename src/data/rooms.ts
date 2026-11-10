import type { PageId, RoomId, RoomState } from "./types.ts";

export const pages: readonly { id: PageId; name: string; photo: string }[] = [
  { id: "home", name: "우리 집", photo: "/photos/home.jpg" },
  { id: "living", name: "거실", photo: "/photos/living.jpg" },
  { id: "kitchen", name: "주방", photo: "/photos/kitchen.jpg" },
  { id: "dining", name: "다이닝", photo: "/photos/dining.jpg" },
];
export const roomIds: readonly RoomId[] = ["living", "kitchen", "dining"];
export const roomNames: Record<RoomId, string> = {
  living: "거실",
  kitchen: "주방",
  dining: "다이닝",
};

export const scenes: Record<
  RoomId,
  readonly { id: string; name: string; levels: readonly number[] }[]
> = {
  living: [
    { id: "relax", name: "휴식", levels: [40, 80, 0, 60] },
    { id: "daily", name: "일상", levels: [90, 50, 70, 0] },
    { id: "bright", name: "밝게", levels: [100, 100, 100, 100] },
    { id: "tv", name: "TV", levels: [0, 30, 0, 20] },
  ],
  kitchen: [
    { id: "daily", name: "일상", levels: [80, 80, 0] },
    { id: "bright", name: "밝게", levels: [100, 100, 100] },
    { id: "ambient", name: "간접", levels: [0, 40, 100] },
  ],
  dining: [
    { id: "meal", name: "식사", levels: [70, 100] },
    { id: "bright", name: "밝게", levels: [100, 100] },
    { id: "night", name: "야간", levels: [20, 0] },
  ],
};

export function roomSummary(room: RoomState) {
  const on = room.lights.filter((light) => light.on);
  const dimmed = on.filter((light) => light.dimmable);
  return {
    on: on.length > 0,
    count: on.length,
    brightness: dimmed.length
      ? Math.round(
          dimmed.reduce((total, light) => total + light.brightness, 0) /
            dimmed.length,
        )
      : 100,
  };
}

export const hvacLabels = {
  cool: "냉방",
  heat: "난방",
  heat_cool: "냉난방",
  dry: "제습",
  fan_only: "송풍",
  auto: "자동",
};
export const fanLabels = { auto: "자동", low: "약", medium: "중", high: "강" };

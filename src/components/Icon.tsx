const symbols = {
  sun: "sunny",
  rain: "rainy",
  cloud: "cloud",
  ceiling: "light",
  ambient: "wb_iridescent",
  spot: "highlight",
  floorLamp: "floor_lamp",
  pendant: "emoji_objects",
  wallLamp: "wall_lamp",
  previous: "skip_previous",
  lowBrightness: "brightness_low",
  highBrightness: "brightness_high",
  weather: "partly_cloudy_day",
  bulb: "lightbulb",
  sparkle: "auto_awesome",
  curtain: "curtains",
  snow: "ac_unit",
  fan: "mode_fan",
  moon: "bedtime",
  clean: "cleaning_services",
  standby: "schedule",
  camera: "videocam",
  history: "history",
  screen: "brightness_6",
  door: "doorbell",
  plus: "add",
  minus: "remove",
  pause: "pause",
  play: "play_arrow",
  next: "skip_next",
  close: "close",
  arrow: "arrow_outward",
  up: "unfold_more",
  down: "unfold_less",
  volume: "volume_up",
  tune: "tune",
  auto: "autorenew",
  air: "air",
  dark: "dark_mode",
  lock: "lock",
  missed: "call_missed",
  package: "package_2",
  unlocked: "lock_open",
} as const;
export type IconName = keyof typeof symbols;
export function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <span className={`icon ${className}`} aria-hidden="true">
      {symbols[name]}
    </span>
  );
}

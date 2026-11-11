import { useLayoutEffect, useRef } from "react";
import { useHome, useHomeValue, useCommandStatus } from "../hooks/useHome";
import { useClock } from "../hooks/useClock";
import { pages } from "../data/rooms";
import type { PageId } from "../data/types";
import { Icon } from "./Icon";
export type SheetId =
  | "weather"
  | "indoor"
  | "vent"
  | "screen"
  | "door"
  | "climate"
  | "curtain"
  | "media"
  | `light:${Exclude<PageId, "home">}`;
export function Header({
  configure,
  page,
  onPage,
  open,
  standby,
  hour12,
  portrait,
  width,
  height,
}: {
  configure?: () => void;
  page: PageId;
  onPage: (page: PageId) => void;
  open: (sheet: SheetId) => void;
  standby: boolean;
  hour12: boolean;
  portrait: boolean;
  width: number;
  height: number;
}) {
  const header = useRef<HTMLElement>(null);
  const clock = useRef<HTMLTimeElement>(null);
  const temperature = useRef<HTMLElement>(null);
  const standbyLabel = useRef<HTMLSpanElement>(null);
  const standbyPosition = useRef<{ minute: number; x: number; y: number } | null>(null);
  const { state: e, offline } = useHome(state => state.environment);
  const weather = useHomeValue(state => state.weather);
  const { pending } = useCommandStatus();
  const { time, date, period, now } = useClock(hour12);
  const driftMinute = Math.floor(now.getTime() / 60_000);
  const gauges = [
    { label: "실내", value: e.indoor, unit: "°", sheet: "indoor", note: null },
    {
      label: "습도",
      value: e.humidity,
      unit: "%",
      sheet: "indoor",
      note: null,
    },
    {
      label: "실내 공기",
      value: e.indoorPm25,
      unit: "",
      sheet: "indoor",
      note: e.indoorAirLabel,
    },
    {
      label: "실외 공기",
      value: e.outdoorPm25,
      unit: "",
      sheet: "weather",
      note: e.outdoorAirLabel,
    },
    ...(e.co2 !== undefined
      ? [
          {
            label: "CO₂",
            value: e.co2,
            unit: "",
            sheet: "indoor" as const,
            note: "ppm",
          },
        ]
      : []),
  ] satisfies {
    label: string;
    value: number | null;
    unit: string;
    sheet: SheetId;
    note: string | null;
  }[];
  useLayoutEffect(() => {
    const root = header.current,
      timeEl = clock.current,
      tempEl = temperature.current;
    const labelEl = standbyLabel.current;
    if (!root || !timeEl || !tempEl || !labelEl) return;
    if (!standby) standbyPosition.current = null;
    else if (standbyPosition.current?.minute !== driftMinute) {
      standbyPosition.current = { minute: driftMinute, x: Math.random(), y: Math.random() };
    }
    const update = () => {
      const timeScale = (portrait ? 280 : 240) / (portrait ? 200 : 120);
      const tempScale = (portrait ? 160 : 132) / 40;
      const timeHeight = timeEl.offsetHeight * timeScale,
        tempHeight = tempEl.offsetHeight * tempScale;
      const groupWidth = Math.max(timeEl.offsetWidth * timeScale, tempEl.offsetWidth * tempScale);
      const groupHeight = timeHeight + 64 + tempHeight + 20 + labelEl.offsetHeight;
      const availableX = Math.max(0, width - groupWidth - 128);
      const availableY = Math.max(0, height - groupHeight - 128);
      const position = standbyPosition.current;
      const driftX = ((position?.x ?? 0.5) - 0.5) * availableX;
      const driftY = ((position?.y ?? 0.5) - 0.5) * availableY;
      const timeTop = (height - groupHeight) / 2 + driftY;
      const tempTop = timeTop + timeHeight + 64;
      const move = (el: HTMLElement, ratio: number, top: number) =>
        `translate(${(width - el.offsetWidth * ratio) / 2 - el.offsetLeft + driftX}px, ${top - el.offsetTop}px) scale(${ratio})`;
      root.style.setProperty(
        "--standby-clock",
        move(timeEl, timeScale, timeTop),
      );
      root.style.setProperty(
        "--standby-temperature",
        move(tempEl, tempScale, tempTop),
      );
      root.style.setProperty("--standby-drift-x", `${driftX}px`);
      root.style.setProperty(
        "--standby-label-top",
        `${tempTop + tempHeight + 20}px`,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(timeEl);
    observer.observe(tempEl);
    observer.observe(labelEl);
    update();
    return () => observer.disconnect();
  }, [width, height, portrait, time, period, e.indoor, standby, driftMinute]);
  return (
    <header ref={header} className={`header ${standby ? "standby" : ""}`}>
      <div className="standby-shade" aria-hidden="true" />
      <span ref={standbyLabel} className="standby-label">실내 온도</span>
      <div className="header-main">
        <div className="clock">
          <time ref={clock}>{time}{period && <span className="clock-period"> {period}</span>}</time>
          <div className="date">{date}</div>
        </div>
        <div className="environment">
          <button
            className="weather-summary"
            onClick={() => open("weather")}
            aria-label="날씨 상세"
          >
            <Icon name="weather" />
            <span>
              <strong>
                {weather.temperature ?? "—"}
                {weather.temperature !== null && "°"}
              </strong>
              <small>
                {weather.high ?? "—"}° / {weather.low ?? "—"}°
              </small>
            </span>
          </button>
          <div className="gauges">
            {gauges.map((g) => (
              <button
                key={g.label}
                className="gauge"
                onClick={() => open(g.sheet)}
                aria-label={`${g.label} 상세`}
              >
                <span className="gauge-label">{g.label}</span>
                <span className="gauge-reading">
                  {g.note && g.value !== null && (
                    <i
                      className={`air-dot ${g.sheet === "weather" ? "outdoor" : ""}`}
                    />
                  )}
                  <strong ref={g.label === "실내" ? temperature : undefined}>
                    {g.value ?? "—"}
                    {g.value !== null && g.unit}
                  </strong>
                  <small>{g.value !== null ? g.note : null}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="nav-line">
        <nav className="room-nav" aria-label="공간 이동">
          {pages.map((p) => (
            <button
              key={p.id}
              className={p.id === page ? "active" : ""}
              onClick={() => onPage(p.id)}
              aria-current={p.id === page ? "page" : undefined}
            >
              {p.name}
            </button>
          ))}
        </nav>
        {configure && <button className="connection-settings" aria-label="연결 설정" onClick={configure}><Icon name="tune" /></button>}
        {(pending || offline) && (
          <div
            className={`connection ${offline ? "disconnected" : ""}`}
            role="status"
          >
            {pending ? "요청 중…" : "연결 끊김 · 마지막 상태"}
          </div>
        )}
      </div>
    </header>
  );
}

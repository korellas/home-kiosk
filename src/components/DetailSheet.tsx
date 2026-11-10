import { CommandError } from "./CommandError";
import { DoorCamera } from "./DoorCamera";
import { useLayoutEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { useHome } from "../hooks/useHome";
import { useClock } from "../hooks/useClock";
import {
  fanLabels,
  hvacLabels,
  roomNames,
  roomIds,
  roomSummary,
} from "../data/rooms";
import type { RoomId } from "../data/types";
import type { SheetId } from "./Header";
import { Pill, Slider, Stat } from "./Controls";
import { Icon } from "./Icon";
import {
  ClimateControls,
  CurtainControls,
  SceneControls,
  curtainLabel,
} from "./DeviceTiles";

export function DetailSheet({
  sheet,
  close,
  open,
  brightness,
  setBrightness,
  night,
  toggleNight,
  hour12,
  setHour12,
  clean,
  standby,
}: {
  sheet: SheetId;
  close: () => void;
  open: (sheet: SheetId) => void;
  brightness: number;
  setBrightness: (value: number) => void;
  night: boolean;
  toggleNight: () => void;
  hour12: boolean;
  setHour12: (value: boolean) => void;
  clean: () => void;
  standby: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLElement>(null);
  const gesture = useRef<{ x: number; y: number; scale: number } | null>(null);
  const swiped = useRef(false);
  const lastWheel = useRef(0);
  const { state, send, offline } = useHome();
  const { now } = useClock();
  const lightRoom = sheet.startsWith("light:")
    ? (sheet.split(":")[1] as RoomId)
    : null;
  const lightOn = lightRoom ? roomSummary(state.rooms[lightRoom]).on : false;
  const c = state.climate;
  const e = state.environment;
  const m = state.media;
  const titles = {
    weather: "날씨 · 실외 공기",
    indoor: "실내 환경",
    vent: "환기",
    screen: "화면",
    door: "현관",
    climate: "거실 에어컨",
    curtain: "거실 커튼",
    media: "거실 스피커",
  };
  const title = lightRoom
    ? `${roomNames[lightRoom]} 조명`
    : titles[sheet as keyof typeof titles];
  useLayoutEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  useLayoutEffect(() => {
    if (!lightRoom) return;
    const node = content.current,
      panel = dialog.current;
    if (!node || !panel) return;
    const update = () => {
      panel.style.touchAction =
        node.scrollHeight > node.clientHeight + 1 ? "pan-y" : "none";
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    Array.from(node.children).forEach((child) => observer.observe(child));
    update();
    return () => {
      observer.disconnect();
      panel.style.touchAction = "";
    };
  }, [lightRoom]);

  return (
    <dialog
      ref={dialog}
      className={`sheet-dialog sheet-${lightRoom ? "light" : sheet}`}
      aria-labelledby="sheet-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onPointerDown={(event) => {
        swiped.current = false;
        if (
          !lightRoom ||
          (event.target as HTMLElement).closest("button, input")
        )
          return;
        const node = event.currentTarget;
        const scale = node.getBoundingClientRect().width / node.offsetWidth;
        gesture.current = { x: event.clientX, y: event.clientY, scale };
      }}
      onPointerUp={(event) => {
        const start = gesture.current;
        gesture.current = null;
        if (!start || !lightRoom) return;
        const dx = (event.clientX - start.x) / start.scale,
          dy = (event.clientY - start.y) / start.scale;
        const portrait =
          event.currentTarget.offsetHeight >= event.currentTarget.offsetWidth;
        const d = portrait ? dx : dy,
          other = portrait ? dy : dx;
        const node = content.current;
        if (
          (!portrait && node && node.scrollHeight > node.clientHeight + 1) ||
          Math.abs(d) < 70 ||
          Math.abs(d) < Math.abs(other)
        )
          return;
        swiped.current = true;
        const index = roomIds.indexOf(lightRoom);
        const next =
          roomIds[
            Math.max(0, Math.min(roomIds.length - 1, index + (d < 0 ? 1 : -1)))
          ];
        if (next !== lightRoom) open(`light:${next}`);
      }}
      onPointerCancel={() => {
        gesture.current = null;
      }}
      onWheel={(event) => {
        if (!lightRoom) return;
        const node = content.current;
        if (node && node.scrollHeight > node.clientHeight + 1) return;
        const delta =
          Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? event.deltaX
            : event.deltaY;
        if (Math.abs(delta) < 20 || Date.now() - lastWheel.current < 550)
          return;
        lastWheel.current = Date.now();
        const index = roomIds.indexOf(lightRoom);
        const next =
          roomIds[
            Math.max(
              0,
              Math.min(roomIds.length - 1, index + (delta > 0 ? 1 : -1)),
            )
          ];
        if (next !== lightRoom) open(`light:${next}`);
      }}
      onClickCapture={(event) => {
        if (swiped.current) {
          event.preventDefault();
          event.stopPropagation();
          swiped.current = false;
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section ref={content} className="sheet-content">
        <header className="sheet-heading">
          <h2 id="sheet-title">{title}</h2>
          {(sheet === "climate" || lightRoom) && (
            <button
              className="sheet-power"
              disabled={offline || (lightRoom ? !state.rooms[lightRoom].lights.some((light) => light.available) : !c.available)}
              onClick={() =>
                lightRoom
                  ? send({ type: "room-power", room: lightRoom, on: !lightOn })
                  : send({ type: "climate", patch: { on: !c.on } })
              }
            >
              <i
                className={`device-dot ${(lightRoom ? lightOn : c.on) ? "powered" : ""}`}
                style={
                  {
                    "--accent": lightRoom ? "var(--warm)" : "var(--cool)",
                  } as CSSProperties
                }
              />
              {(lightRoom ? lightOn : c.on) ? "켜짐" : "꺼짐"}
            </button>
          )}
          <button
            className="sheet-close"
            aria-label="상세 창 닫기"
            onClick={close}
          >
            <Icon name="close" />
          </button>
        </header>
        {lightRoom && (
          <>
            <div className="fixture-grid">
              {state.rooms[lightRoom].lights.map((l) => {
                const toggle = () =>
                  send({
                    type: "light",
                    room: lightRoom,
                    id: l.id,
                    patch: { on: !l.on },
                  });
                return (
                  <section
                    className={`fixture ${l.on ? "on" : "off"}`}
                    key={l.id}
                  >
                    <button
                      className="fixture-badge"
                      aria-label={`${l.name} ${l.on ? "끄기" : "켜기"}`}
                      aria-pressed={l.on}
                      disabled={offline || !l.available}
                      onClick={toggle}
                    >
                      <Icon name={l.icon ?? "bulb"} />
                    </button>
                    <div className="fixture-copy">
                      <h3>{l.name}</h3>
                      <p>
                        {!l.available
                          ? "연결 끊김"
                          : !l.on
                            ? "꺼짐"
                            : l.dimmable
                              ? `${l.brightness}%${l.kelvin ? ` · ${l.kelvin}K` : ""}`
                              : "켜짐"}
                      </p>
                    </div>
                    <div className="fixture-controls">
                      {l.dimmable ? (
                        <Slider
                          label={`${l.name} 밝기`}
                          disabled={offline || !l.available}
                          value={l.on ? l.brightness : 0}
                          onChange={(brightness) =>
                            send({
                              type: "light",
                              room: lightRoom,
                              id: l.id,
                              patch: { brightness, on: brightness > 0 },
                            })
                          }
                        />
                      ) : (
                        <Pill
                          disabled={offline || !l.available}
                          active={l.on}
                          onClick={toggle}
                        >
                          {l.on ? "켜짐" : "꺼짐 · 눌러서 켜기"}
                        </Pill>
                      )}
                      {l.kelvin !== undefined && l.kelvinRange && (
                        <div className="color-temperature">
                          <Slider
                            label={`${l.name} 색온도`}
                            min={l.kelvinRange[0]}
                            max={l.kelvinRange[1]}
                            step={100}
                            value={l.kelvin}
                            disabled={offline || !l.available}
                            onChange={(kelvin) =>
                              send({
                                type: "light",
                                room: lightRoom,
                                id: l.id,
                                patch: { kelvin, on: true },
                              })
                            }
                          />
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="sheet-section">
              <p className="muted">장면 · 프리셋</p>
              <SceneControls room={lightRoom} />
            </div>
          </>
        )}
        {sheet === "climate" && (
          <>
            {c.mode !== "fan_only" && (
              <div className="thermostat">
                <ClimateControls />
                <div>
                  <strong>{c.target}°</strong>
                  <p>
                    현재 {c.current ?? "—"}° · 습도 {e.humidity ?? "—"}%
                  </p>
                </div>
              </div>
            )}
            <div className="sheet-section">
              <p className="muted">모드</p>
              <div className="control-row">
                {c.modes.map((mode) => (
                  <Pill
                    key={mode}
                    active={c.mode === mode}
                    disabled={offline || !c.available}
                    onClick={() =>
                      send({ type: "climate", patch: { mode, on: true } })
                    }
                  >
                    {hvacLabels[mode]}
                  </Pill>
                ))}
              </div>
            </div>
            <div className="sheet-section">
              <p className="muted">바람</p>
              <div className="control-row">
                {c.fans.map((fan) => (
                  <Pill
                    key={fan}
                    active={c.fan === fan}
                    disabled={offline || !c.available}
                    onClick={() => send({ type: "climate", patch: { fan } })}
                  >
                    {fanLabels[fan as keyof typeof fanLabels] ?? fan}
                  </Pill>
                ))}
              </div>
            </div>
          </>
        )}
        {sheet === "curtain" && (
          <>
            {state.curtain.supportsPosition &&
              state.curtain.position !== null && (
                <label className="range-field">
                  <span>
                    열림 정도{" "}
                    <small>
                      {curtainLabel(
                        state.curtain.position,
                        state.curtain.direction,
                      )}
                    </small>
                  </span>
                  <Slider
                    label="커튼 열림 정도"
                    value={state.curtain.position}
                    color="white"
                    disabled={offline || !state.curtain.available}
                    onChange={(value) =>
                      send({ type: "curtain-position", value })
                    }
                  />
                </label>
              )}
            <CurtainControls />
          </>
        )}
        {(sheet === "weather" || sheet === "indoor") && (
          <>
            {sheet === "weather" && (
              <div className="weather-detail">
                <Icon name="weather" />
                <strong>{state.weather.temperature ?? "—"}°</strong>
                <div>
                  <h3>{state.weather.description}</h3>
                  <p>
                    최고 {state.weather.high ?? "—"}° · 최저{" "}
                    {state.weather.low ?? "—"}°
                  </p>
                </div>
              </div>
            )}
            {sheet === "weather" && state.weather.hourly && (
              <div className="hourly-forecast">
                {state.weather.hourly.map((hour, i) => (
                  <div
                    key={`${hour.label}-${i}`}
                    className={`forecast-hour condition-${hour.condition}`}
                  >
                    <span>{hour.label}</span>
                    <Icon name={hour.condition} />
                    <strong>{hour.temperature ?? "—"}°</strong>
                    <small>{hour.rain !== null ? `${hour.rain}%` : ""}</small>
                  </div>
                ))}
              </div>
            )}
            <div className="stats-grid">
              {sheet === "indoor" ? (
                <>
                  <Stat
                    label="온도"
                    value={e.indoor}
                    unit="°C"
                    note={e.indoor !== null ? "쾌적" : null}
                  />
                  <Stat
                    label="습도"
                    value={e.humidity}
                    unit="%"
                    note={e.humidity !== null ? "적정" : null}
                  />
                  <AirStat
                    label="초미세먼지 PM2.5"
                    value={e.indoorPm25}
                    thresholds={[15, 35, 75]}
                  />
                  {e.indoorPm10 !== undefined && (
                    <AirStat
                      label="미세먼지 PM10"
                      value={e.indoorPm10}
                      thresholds={[30, 80, 150]}
                    />
                  )}
                  {e.co2 !== undefined && (
                    <AirStat
                      label="이산화탄소"
                      value={e.co2}
                      unit="ppm"
                      thresholds={[700, 1000, 2000]}
                    />
                  )}
                </>
              ) : (
                <>
                  <AirStat
                    label="초미세먼지 PM2.5"
                    value={e.outdoorPm25}
                    thresholds={[15, 35, 75]}
                  />
                  {e.outdoorPm10 !== undefined && (
                    <AirStat
                      label="미세먼지 PM10"
                      value={e.outdoorPm10}
                      thresholds={[30, 80, 150]}
                    />
                  )}
                </>
              )}
            </div>
          </>
        )}
        {sheet === "vent" && (
          <>
            <div className="control-row">
              {(state.ventilation.modes ?? Object.keys(fanLabels) as (keyof typeof fanLabels)[]).map(
                (mode) => (
                  <Pill
                    key={mode}
                    active={
                      !state.ventilation.boostUntil &&
                      state.ventilation.mode === mode
                    }
                    disabled={offline || !state.ventilation.available}
                    onClick={() => send({ type: "ventilation", mode })}
                  >
                    {fanLabels[mode]}
                  </Pill>
                ),
              )}
            </div>
            {state.ventilation.supportsBoost !== false && <div className="boost-row">
              <div>
                <h3>
                  {state.ventilation.boostUntil
                    ? `강풍 운전 중 · ${Math.ceil(Math.max(0, state.ventilation.boostUntil - now.getTime()) / 60_000)}분 남음`
                    : "20분 강하게"}
                </h3>
                <p>끝나면 이전 모드로 돌아갑니다</p>
              </div>
              <Pill
                active={!!state.ventilation.boostUntil}
                disabled={offline || !state.ventilation.available}
                onClick={() =>
                  send({ type: "boost", on: !state.ventilation.boostUntil })
                }
              >
                {state.ventilation.boostUntil ? "중지" : "시작"}
              </Pill>
            </div>}
          </>
        )}
        {sheet === "media" &&
          (m.title || m.available ? (
            <>
              <div className="media-detail">
                <div className="album-art">
                  {m.artworkUrl ? (
                    <img src={m.artworkUrl} alt="앨범 아트" />
                  ) : (
                    <span>앨범 아트</span>
                  )}
                </div>
                <div className="media-copy">
                  <h3>{m.title || "재생 대기"}</h3>
                  <p>{m.artist}</p>
                  {m.duration !== undefined && m.elapsed !== undefined && (
                    <>
                      <div className="media-progress">
                        <span
                          style={{
                            width: `${Math.min(100, (m.elapsed / m.duration) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="media-times">
                        <span>{formatTime(m.elapsed)}</span>
                        <span>{formatTime(m.duration)}</span>
                      </div>
                    </>
                  )}
                  <div className="control-row media-transport">
                    <Pill icon="previous" label="이전 곡" disabled={offline || !m.available || !m.canPrevious} onClick={() => send({ type: "media-skip", direction: "previous" })} />
                    <Pill
                      icon={m.playing ? "pause" : "play"}
                      active
                      label={m.playing ? "미디어 일시정지" : "미디어 재생"}
                      disabled={offline || !m.available || (m.playing ? m.canPause === false : m.canPlay === false)}
                      onClick={() =>
                        send({ type: "media-play", playing: !m.playing })
                      }
                    />
                    <Pill icon="next" label="다음 곡" disabled={offline || !m.available || !m.canNext} onClick={() => send({ type: "media-skip", direction: "next" })} />
                  </div>
                </div>
              </div>
              <label className="range-field">
                <span>
                  음량 <small>{m.volume}%</small>
                </span>
                <Slider
                  label="스피커 음량"
                  value={m.volume}
                  color="white"
                  disabled={offline || !m.available || m.canVolume === false}
                  onChange={(value) => send({ type: "media-volume", value })}
                />
              </label>
            </>
          ) : (
            <p className="empty-state">재생 중인 미디어가 없어요.</p>
          ))}
        {sheet === "screen" && (
          <>
            <div className="control-row" role="group" aria-label="시간 표시">
              <Pill active={hour12} onClick={() => setHour12(true)}>12시간제</Pill>
              <Pill active={!hour12} onClick={() => setHour12(false)}>24시간제</Pill>
            </div>
            <div className="screen-brightness">
              <Icon name="lowBrightness" />
              <Slider
                label="화면 밝기"
                min={10}
                value={brightness}
                color="white"
                onChange={setBrightness}
              />
              <Icon name="highBrightness" />
            </div>
            <div className="control-row">
              <Pill icon="moon" active={night} onClick={toggleNight}>
                야간 모드
              </Pill>
              <Pill icon="standby" onClick={standby}>
                대기모드
              </Pill>
              <Pill icon="clean" onClick={clean}>
                화면 청소 30초
              </Pill>
            </div>
          </>
        )}
        {sheet === "door" && (
          <div className="door-detail">
            <DoorCamera />
            {state.door.configured === false && <p>HA의 Home Kiosk 연결 설정에서 초인종 엔티티를 선택해 주세요.</p>}
            {state.door.configured && state.door.available === false && <p>선택한 초인종에 연결할 수 없어요.</p>}
            <div className="door-history">
              <h3>최근 기록</h3>
              <div className="door-events">
                {state.door.events.length ? (
                  state.door.events.map((event) => (
                    <div key={event.id}>
                      <Icon name={event.icon ?? "history"} />
                      <span>{event.label}</span>
                      <time>{event.time}</time>
                    </div>
                  ))
                ) : (
                  <p className="empty-state">최근 호출 기록이 없어요.</p>
                )}
              </div>
              <button
                className="door-open"
                disabled
                aria-label="문 열기 · 기기 연동 필요"
              >
                <Icon name="lock" />
                문 열기 · 지원 예정
              </button>
            </div>
          </div>
        )}
      </section>
      {lightRoom && (
        <nav className="light-room-dots" aria-label="조명 공간 선택">
          {roomIds.map((id) => (
            <button
              key={id}
              aria-label={`${roomNames[id]} 조명 선택`}
              aria-current={lightRoom === id ? "page" : undefined}
              className={lightRoom === id ? "active" : ""}
              onClick={() => open(`light:${id}`)}
            >
              <span />
            </button>
          ))}
        </nav>
      )}
      <CommandError />
    </dialog>
  );
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
function AirStat({
  label,
  value,
  thresholds,
  unit = "㎍/㎥",
}: {
  label: string;
  value: number | null;
  thresholds: readonly [number, number, number];
  unit?: string;
}) {
  const colors = [
    "oklch(0.8 0.11 245)",
    "oklch(0.83 0.14 150)",
    "oklch(0.8 0.15 70)",
    "oklch(0.68 0.19 25)",
  ];
  const grade =
    value === null
      ? 0
      : value <= thresholds[0]
        ? 0
        : value <= thresholds[1]
          ? 1
          : value <= thresholds[2]
            ? 2
            : 3;
  const low = grade ? thresholds[grade - 1] : 0;
  const high =
    grade === 0
      ? thresholds[0]
      : grade === 1
        ? thresholds[1]
        : grade === 2
          ? thresholds[2]
          : thresholds[2] * 1.5;
  const pos =
    value === null
      ? 0
      : Math.min(99, (grade + Math.min(1, (value - low) / (high - low))) * 25);
  return (
    <div
      className="air-stat"
      style={{ color: value === null ? "white" : colors[grade] }}
    >
      <Stat
        label={label}
        value={value}
        unit={unit}
        note={
          value === null ? null : ["좋음", "보통", "나쁨", "매우 나쁨"][grade]
        }
      />
      {value !== null && (
        <div className="air-scale">
          {colors.map((color) => (
            <span key={color} style={{ background: color }} />
          ))}
          <i style={{ left: `calc(${pos}% - 14px)` }} />
        </div>
      )}
    </div>
  );
}

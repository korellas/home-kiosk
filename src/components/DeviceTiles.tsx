import { memo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useHome, useHomeValue } from "../hooks/useHome";
import type { RoomId, PageId } from "../data/types";
import {
  scenes,
  roomSummary,
  roomIds,
  hvacLabels,
  fanLabels,
} from "../data/rooms";
import { Icon } from "./Icon";
import { ActionButton, Pill, Slider } from "./Controls";
import type { SheetId } from "./Header";

type Open = (sheet: SheetId) => void;
function Tile({
  name,
  status,
  value,
  unit,
  on,
  color = "var(--warm)",
  toggle,
  open,
  children,
  className = "",
  disabled = false,
  chevron = false,
}: {
  name: string;
  status: string;
  value?: ReactNode;
  unit?: string;
  on?: boolean;
  color?: string;
  toggle?: () => void;
  open: () => void;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  chevron?: boolean;
}) {
  return (
    <section
      className={`device-tile ${on ? "is-on" : ""} ${className}`}
      style={{ "--accent": color } as CSSProperties}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button, input")) open();
      }}
    >
      <div className="device-copy">
        <ActionButton
          className="device-name"
          onClick={toggle ?? open}
          disabled={!!toggle && disabled}
          aria-pressed={toggle ? !!on : undefined}
        >
          <i className="device-dot" />
          <span className="device-title">{name}</span>
          {chevron && <Icon name="arrow" />}
          <span className="portrait-value" aria-hidden="true">
            {value}
            <small>{unit}</small>
          </span>
        </ActionButton>
        <button
          className="device-detail"
          aria-label={`${name} 상세`}
          onClick={open}
        >
          <span className="device-status">{status}</span>
          <span className="device-value">
            {value}
            <small>{unit}</small>
          </span>
        </button>
      </div>
      <div className="device-controls">{children}</div>
    </section>
  );
}
export function curtainLabel(position: number | null, direction: number) {
  if (direction)
    return `${direction > 0 ? "여는 중" : "닫는 중"}${position !== null ? ` · ${position}%` : ""}`;
  return position === null
    ? "위치 정보 없음"
    : position === 100
      ? "열림"
      : position === 0
        ? "닫힘"
        : `${position}% 열림`;
}
export function CurtainControls() {
  const { state: c, send, offline } = useHome(state => state.curtain);
  return (
    <div className="control-row">
      {(["open", "stop", "close"] as const).map((action, i) => (
        <Pill
          key={action}
          icon={(["up", "pause", "down"] as const)[i]}
          label={["커튼 열기", "커튼 정지", "커튼 닫기"][i]}
          active={
            action !== "stop" && c.direction === (action === "open" ? 1 : -1)
          }
          disabled={offline || !c.available || (c.actions !== undefined && !c.actions.includes(action))}
          onClick={() => send({ type: "curtain", action })}
        >
          <span className="curtain-button-label">
            {["열기", "정지", "닫기"][i]}
          </span>
        </Pill>
      ))}
    </div>
  );
}
export function ClimateControls() {
  const { state: c, send, offline } = useHome(state => state.climate);
  return (
    <div className="control-row">
      <Pill
        icon="minus"
        label="설정 온도 낮추기"
        disabled={offline || !c.available || !c.on || c.supportsTemperature === false || c.target <= c.min}
        onClick={() =>
          send({ type: "climate", patch: { target: Math.max(c.min, c.target - (c.step ?? 1)) } })
        }
      />
      <Pill
        icon="plus"
        label="설정 온도 높이기"
        disabled={offline || !c.available || !c.on || c.supportsTemperature === false || c.target >= c.max}
        onClick={() =>
          send({ type: "climate", patch: { target: Math.min(c.max, c.target + (c.step ?? 1)) } })
        }
      />
    </div>
  );
}
export function SceneControls({ room }: { room: RoomId }) {
  const { state: lights, send, offline } = useHome(state => state.rooms[room]);
  return (
    <div className="control-row scenes">
      {scenes[room].map((scene) => (
        <Pill
          key={scene.id}
          active={
            lights.scene === scene.id &&
            roomSummary(lights).on
          }
          disabled={offline || (lights.availableScenes ? !lights.availableScenes!.includes(scene.id) : !lights.lights.some(light => light.available))}
          onClick={() => send({ type: "scene", room, scene: scene.id })}
        >
          {scene.name}
        </Pill>
      ))}
    </div>
  );
}
function RoomTiles({ room, open }: { room: RoomId; open: Open }) {
  const { state: lights, send, offline } = useHome(state => state.rooms[room]);
  const summary = roomSummary(lights);
  const sceneName =
    scenes[room].find((s) => s.id === lights.scene)?.name ?? "개별";
  return (
    <>
      <Tile
        name="조명"
        on={summary.on}
        disabled={offline || !lights.lights.some((light) => light.available)}
        toggle={() => send({ type: "room-power", room, on: !summary.on })}
        open={() => open(`light:${room}`)}
        status={
          summary.on
            ? `${summary.count}/${lights.lights.length}개 켜짐 · ${summary.brightness}%`
            : lights.lights.length ? "모두 꺼짐" : "미연동"
        }
        value={summary.on ? (summary.brightness ?? "개별") : lights.lights.length ? "꺼짐" : "—"}
        unit={summary.on && summary.brightness !== null ? "%" : ""}
      >
        {summary.on && lights.lights.some(light => light.on && light.dimmable) && (
          <Slider
            commitOnRelease
            label={`${room} 공간 밝기`}
            value={summary.on ? (summary.brightness ?? 50) : 0}
            mixed={summary.on && summary.brightness === null}
            disabled={offline}
            onChange={(value) => send({ type: "brightness", room, value })}
          />
        )}
      </Tile>
      <Tile
        name="장면"
        status={
          summary.on
            ? lights.scene
              ? `${sceneName} 적용됨`
              : "개별 설정"
            : lights.lights.length ? "조명 꺼짐" : "미연동"
        }
        value={summary.on ? sceneName : "—"}
        open={() => open(`light:${room}`)}
        className="scene-tile"
      >
        <SceneControls room={room} />
      </Tile>
      {room === "living" && <LivingTiles open={open} />}
    </>
  );
}
const LivingTiles = memo(function LivingTiles({ open }: { open: Open }) {
  const { state: c, send, offline } = useHome(state => state.climate);
  const curtain = useHomeValue(state => state.curtain);
  const m = useHomeValue(state => state.media);
  return (

    <>
      <Tile
        name="커튼"
        status={curtain.available ? curtainLabel(curtain.position, curtain.direction) : "미연동 또는 연결 끊김"}
        value={curtain.position ?? "—"}
        unit={curtain.position !== null ? "%" : ""}
        on={curtain.direction !== 0}
        color="white"
        open={() => open("curtain")}
      >
        <CurtainControls />
      </Tile>
      <Tile
        name="에어컨"
        status={
          c.available
            ? c.on
              ? `${hvacLabels[c.mode]} · 현재 ${c.current ?? "—"}°`
              : "꺼짐"
            : "미연동 또는 연결 끊김"
        }
        value={!c.available ? "—" : c.on ? (c.mode === "fan_only" ? "송풍" : c.target) : "꺼짐"}
        unit={c.on && c.mode !== "fan_only" ? "°" : ""}
        on={c.on}
        color="var(--cool)"
        disabled={offline || !c.available}
        toggle={() => send({ type: "climate", patch: { on: !c.on } })}
        open={() => open("climate")}
      >
        {c.mode !== "fan_only" && <ClimateControls />}
      </Tile>
      <Tile
        name={m.title ?? "미디어"}
        status={m.title ? m.artist : "재생 중인 미디어가 없어요"}
        on={!!m.title && m.playing}
        color="white"
        open={() => open("media")}
        className="media-tile"
      >
        {m.title && (
          <div className="control-row">
            <Pill
              icon={m.playing ? "pause" : "play"}
              label={m.playing ? "미디어 일시정지" : "미디어 재생"}
              active
              disabled={offline || !m.available || (m.playing ? m.canPause === false : m.canPlay === false)}
              onClick={() =>
                send({ type: "media-play", playing: !m.playing })
              }
            />
            <Pill icon="next" label="다음 곡" disabled={offline || !m.available || !m.canNext} onClick={() => send({ type: "media-skip", direction: "next" })} />
          </div>
        )}
      </Tile>
    </>
  );
});

export function DeviceTiles({
  page,
  open,
  brightness,
  night,
  toggleNight,
  clean,
}: {
  page: PageId;
  open: Open;
  brightness: number;
  night: boolean;
  toggleNight: () => void;
  clean: () => void;
}) {
  return (
    <div className={`device-grid ${page === "home" ? "home-grid" : page === "living" ? "living-grid" : "room-grid"}`}>
      {page === "home" ? <HomeTiles open={open} brightness={brightness} night={night} toggleNight={toggleNight} clean={clean} /> : <RoomTiles room={page} open={open} />}
    </div>
  );
}

function HomeTiles({ open, brightness, night, toggleNight, clean }: Omit<Parameters<typeof DeviceTiles>[0], "page">) {
  const { state: rooms, send, offline } = useHome(state => state.rooms);
  const vent = useHomeValue(state => state.ventilation);
  const door = useHomeValue(state => state.door);
  const count = roomIds.reduce(
    (n, id) => n + roomSummary(rooms[id]).count,
    0,
  );
  const spaces = roomIds.filter((id) => roomSummary(rooms[id]).on).length;
  const lightsAvailable = roomIds.some((id) => rooms[id].lights.some((light) => light.available));
  return (
    <>
      <Tile
        chevron
        name="조명"
        status={!lightsAvailable ? "미연동" : count ? `${spaces}곳 · ${count}개 켜짐` : "모두 꺼짐"}
        value={count}
        unit="개"
        on={count > 0}
        disabled={offline || !lightsAvailable}
        toggle={() => send({ type: "all-off" })}
        open={() => open("light:living")}
      >
        <div className="control-row">
          <Pill
            icon="dark"
            disabled={offline || !lightsAvailable}
            onClick={() => send({ type: "all-off" })}
          >
            전체 소등
          </Pill>
          <Pill icon="tune" onClick={() => open("light:living")}>
            조명 제어
          </Pill>
        </div>
      </Tile>
      <Tile
        chevron
        name="환기"
        status={
          !vent.available ? "미연동 또는 연결 끊김" : vent.boostUntil
            ? "강풍 · 타이머 운전"
            : `${fanLabels[vent.mode]} 운전`
        }
        value={vent.boostUntil ? "강풍" : fanLabels[vent.mode]}
        on={!!vent.boostUntil}
        color="var(--mint)"
        open={() => open("vent")}
      >
        <div className="control-row">
          <Pill
            icon="auto"
            disabled={offline || !vent.available || (vent.modes !== undefined && !vent.modes.includes("auto"))}
            active={!vent.boostUntil && vent.mode === "auto"}
            onClick={() => send({ type: "ventilation", mode: "auto" })}
          >
            자동
          </Pill>
          <Pill
            icon="air"
            disabled={offline || !vent.available || (vent.modes !== undefined && !vent.modes.includes("high"))}
            active={vent.supportsBoost === false ? vent.mode === "high" : !!vent.boostUntil}
            onClick={() => send(vent.supportsBoost === false ? { type: "ventilation", mode: "high" } : { type: "boost", on: !vent.boostUntil })}
          >
            강풍
          </Pill>
        </div>
      </Tile>
      <Tile
        chevron
        name="화면"
        status={`밝기 ${brightness}%${night ? " · 야간" : ""}`}
        value={brightness}
        unit="%"
        open={() => open("screen")}
      >
        <div className="control-row">
          <Pill icon="moon" active={night} onClick={toggleNight}>
            야간
          </Pill>
          <Pill icon="clean" onClick={clean}>
            청소
          </Pill>
        </div>
      </Tile>
      <Tile
        chevron
        name="현관"
        status={
          door.configured === false ? "초인종 미연동" : door.available === false ? "초인종 연결 끊김" : door.missedCalls
            ? `미확인 ${door.missedCalls}${door.events[0] ? ` · ${door.events[0].time}` : ""}`
            : "새 호출 없음"
        }
        value={door.missedCalls || "—"}
        unit={door.missedCalls ? "미확인" : ""}
        open={() => open("door")}
      >
        <div className="control-row">
          <Pill icon="camera" onClick={() => open("door")}>
            카메라
          </Pill>
          <Pill icon="history" onClick={() => open("door")}>
            기록
          </Pill>
        </div>
      </Tile>
    </>
  );
}

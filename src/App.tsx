import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { pages, roomSummary, scenes, hvacLabels } from "./data/rooms";
import type { PageId } from "./data/types";
import { useHome } from "./hooks/useHome";
import { useClock } from "./hooks/useClock";
import { Header } from "./components/Header";
import type { SheetId } from "./components/Header";
import { DeviceTiles } from "./components/DeviceTiles";
import { DetailSheet } from "./components/DetailSheet";
import { CleaningOverlay } from "./components/CleaningOverlay";
import { CommandError } from "./components/CommandError";
import { DoorCall } from "./components/DoorCall";

export const IDLE_TIMEOUT_MS = 60_000;

function readScreenSettings() {
  try {
    const settings = JSON.parse(
      localStorage.getItem("home-kiosk-screen") ?? "{}",
    );
    return {
      brightness: Number.isFinite(settings.brightness)
        ? Math.min(100, Math.max(10, settings.brightness))
        : 70,
      night: settings.night === true,
      hour12: settings.hour12 === true,
    };
  } catch {
    return { brightness: 70, night: false, hour12: false };
  }
}
export function App({ configure, configuration, chime }: { configure?: () => void; configuration?: ReactNode; chime?: () => Promise<void> } = {}) {
  const { state } = useHome();
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useLayoutEffect(() => {
    const resize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const portrait = viewport.height >= viewport.width;
  const scale = Math.min(
    viewport.width / (portrait ? 1080 : 1920),
    viewport.height / (portrait ? 1920 : 1080),
  );
  const { date } = useClock();
  const [page, setPage] = useState<PageId>("living");
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [screen, setScreen] = useState(readScreenSettings);
  const [cleanDeadline, setCleanDeadline] = useState<number | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const dragOffset = useRef(0);
  const dragFrame = useRef<number | null>(null);
  const resetDrag = useCallback(() => {
    swipe.current = null;
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    dragOffset.current = 0;
    track.current?.classList.remove("dragging");
    track.current?.style.removeProperty("--drag-offset");
  }, []);
  const dragged = useRef(false);
  const [standby, setStandby] = useState(false);
  useEffect(() => {
    if (state.door.ringing) {
      setStandby(false);
      setCleanDeadline(null);
      setSheet(null);
    }
  }, [state.door.ringing]);
  const pageIndex = pages.findIndex((p) => p.id === page);
  useLayoutEffect(() => {
    resetDrag();
    return resetDrag;
  }, [page, viewport, standby, sheet, configuration, cleanDeadline, state.door.ringing, resetDrag]);
  const enterStandby = () => {
    setSheet(null);
    setStandby(true);
  };
  useEffect(() => {
    if (standby || sheet || configuration || cleanDeadline || state.door.ringing) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setStandby(true), IDLE_TIMEOUT_MS);
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel"] as const;
    events.forEach((name) =>
      window.addEventListener(name, reset, { passive: true }),
    );
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, reset));
    };
  }, [standby, sheet, configuration, cleanDeadline, state.door.ringing]);
  useEffect(() => {
    if (!standby) return;
    const wake = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setStandby(false);
    };
    window.addEventListener("keydown", wake, true);
    return () => window.removeEventListener("keydown", wake, true);
  }, [standby]);
  const finishCleaning = useCallback(() => setCleanDeadline(null), []);
  const clean = () => {
    setSheet(null);
    setCleanDeadline(Date.now() + 30_000);
  };
  const settings = (patch: Partial<typeof screen>) => {
    const next = { ...screen, ...patch };
    setScreen(next);
    try {
      localStorage.setItem("home-kiosk-screen", JSON.stringify(next));
    } catch {
      /* Display settings still work without browser storage. */
    }
  };
  const captionFor = (id: PageId) => {
    if (id === "home")
      return portrait
        ? `조명 켜진 공간 ${Object.values(state.rooms).filter((room) => roomSummary(room).on).length}곳${state.climate.on ? ` · 에어컨 ${hvacLabels[state.climate.mode]}` : ""}`
        : date;
    const summary = roomSummary(state.rooms[id]);
    const scene = scenes[id].find((s) => s.id === state.rooms[id].scene)?.name;
    return summary.on ? `조명 켜짐 · ${scene ?? "개별 설정"}` : "조명 꺼짐";
  };
  return (
    <div
      className={`kiosk ${portrait ? "portrait" : "landscape"} ${screen.night ? "night" : ""}`}
      style={
        {
          width: viewport.width / scale,
          height: viewport.height / scale,
          transform: `scale(${scale})`,
          "--scale": scale,
          "--design-width": `${viewport.width / scale}px`,
          "--design-height": `${viewport.height / scale}px`,
        } as CSSProperties
      }
      onClickCapture={(event) => {
        if (standby || dragged.current) {
          event.preventDefault();
          event.stopPropagation();
          dragged.current = false;
          if (standby) setStandby(false);
        }
      }}
      onPointerDown={(event) => {
        dragged.current = false;
        if (
          standby ||
          sheet ||
          configuration ||
          cleanDeadline ||
          state.door.ringing ||
          (event.target as HTMLElement).closest("button, input, dialog")
        )
          return;
        resetDrag();
        swipe.current = { x: event.clientX, y: event.clientY };
        track.current?.classList.add("dragging");
      }}
      onPointerMove={(event) => {
        const start = swipe.current;
        if (!start) return;
        const dx = event.clientX - start.x,
          dy = event.clientY - start.y;
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
          resetDrag();
          return;
        }
        if (Math.abs(dx) > 10 && !dragged.current) {
          dragged.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        const edge =
          (pageIndex === 0 && dx > 0) ||
          (pageIndex === pages.length - 1 && dx < 0);
        dragOffset.current = dx / scale / (edge ? 3 : 1);
        if (dragFrame.current === null) {
          dragFrame.current = requestAnimationFrame(() => {
            dragFrame.current = null;
            track.current?.style.setProperty("--drag-offset", `${dragOffset.current}px`);
          });
        }
      }}
      onPointerUp={(event) => {
        const start = swipe.current;
        resetDrag();
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) < viewport.width * 0.12 || Math.abs(dx) < Math.abs(dy))
          return;
        const index = pages.findIndex((p) => p.id === page);
        setPage(
          pages[
            Math.max(0, Math.min(pages.length - 1, index + (dx < 0 ? 1 : -1)))
          ].id,
        );
      }}
      onPointerCancel={resetDrag}
    >
      <div
        ref={track}
        className="page-track"
        style={{
          width: `${pages.length * 100}%`,
          "--page-offset": `${(-100 * pageIndex) / pages.length}%`,
        } as CSSProperties}
      >
        {pages.map((p) => (
          <section
            key={p.id}
            className="dashboard-page"
            style={{ flexBasis: `${100 / pages.length}%` }}
            inert={p.id !== page}
            aria-label={p.name}
          >
            <div className="backgrounds" aria-hidden="true">
              <img src={`${import.meta.env.BASE_URL}${p.photo.slice(1)}`} alt="" draggable={false} />
            </div>
            <div className="photo-shade" />
            <main className="room-content">
              <div className="room-heading">
                <h1>{p.name}</h1>
                <p>{captionFor(p.id)}</p>
              </div>
              <DeviceTiles
                page={p.id}
                open={setSheet}
                brightness={screen.brightness}
                night={screen.night}
                toggleNight={() => settings({ night: !screen.night })}
                clean={clean}
              />
            </main>
          </section>
        ))}
      </div>
      <Header
          configure={configure}
        page={page}
        onPage={setPage}
        open={setSheet}
        standby={standby}
        hour12={screen.hour12}
        portrait={portrait}
        width={viewport.width / scale}
        height={viewport.height / scale}
      />
      <nav className="page-dots" aria-label="공간 바로가기">
        {pages.map((p) => (
          <button
            key={p.id}
            aria-label={`${p.name}로 이동`}
            aria-current={p.id === page ? "page" : undefined}
            className={p.id === page ? "active" : ""}
            onClick={() => setPage(p.id)}
          >
            <span />
          </button>
        ))}
      </nav>
      <div className="screen-dim" aria-hidden="true" />
      {sheet && (
        <DetailSheet
          sheet={sheet}
          close={() => setSheet(null)}
          open={setSheet}
          brightness={screen.brightness}
          setBrightness={(brightness) => settings({ brightness })}
          night={screen.night}
          hour12={screen.hour12}
          setHour12={(hour12) => settings({ hour12 })}
          toggleNight={() => settings({ night: !screen.night })}
          clean={clean}
          standby={enterStandby}
        />
      )}
      {cleanDeadline && (
        <CleaningOverlay deadline={cleanDeadline} finish={finishCleaning} />
      )}
      {state.door.ringing && <DoorCall view={() => setSheet("door")} chime={chime} />}
      {!sheet && !state.door.ringing && <CommandError />}
      {configuration}
    </div>
  );
}

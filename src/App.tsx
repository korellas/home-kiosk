import {
  useCallback,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { pages, roomSummary, scenes, hvacLabels } from "./data/rooms";
import type { PageId, RoomId } from "./data/types";
import { useHomeValue } from "./hooks/useHome";
import { useClock } from "./hooks/useClock";
import { Header } from "./components/Header";
import type { SheetId } from "./components/Header";
import { DeviceTiles } from "./components/DeviceTiles";
import { DetailSheet } from "./components/DetailSheet";
import { CleaningOverlay } from "./components/CleaningOverlay";
import { CommandError } from "./components/CommandError";
import { DoorCall } from "./components/DoorCall";

export const IDLE_TIMEOUT_MS = 60_000;

function HomeDate() {
  const { date } = useClock();
  return <>{date}</>;
}

function HomeSummary() {
  const rooms = useHomeValue(state => state.rooms);
  const climateOn = useHomeValue(state => state.climate.on);
  const mode = useHomeValue(state => state.climate.mode);
  return <>조명 켜진 공간 {Object.values(rooms).filter(room => roomSummary(room).on).length}곳{climateOn ? ` · 에어컨 ${hvacLabels[mode]}` : ""}</>;
}

function RoomCaption({ room }: { room: RoomId }) {
  const state = useHomeValue(state => state.rooms[room]);
  const summary = roomSummary(state);
  const scene = scenes[room].find(scene => scene.id === state.scene)?.name;
  return <>{summary.on ? `조명 켜짐 · ${scene ?? "개별 설정"}` : "조명 꺼짐"}</>;
}

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
export const App = memo(function App({ configure, configuration, chime }: { configure?: () => void; configuration?: ReactNode; chime?: () => Promise<void> } = {}) {
  const ringing = useHomeValue(state => state.door.ringing);
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
  const [page, setPage] = useState<PageId>("living");
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [screen, setScreen] = useState(readScreenSettings);
  const [cleanDeadline, setCleanDeadline] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const [standby, setStandby] = useState(false);
  useEffect(() => {
    if (ringing) {
      setStandby(false);
      setCleanDeadline(null);
      setSheet(null);
    }
  }, [ringing]);
  const pageIndex = pages.findIndex((p) => p.id === page);
  const pagingBlocked = Boolean(standby || sheet || configuration || cleanDeadline || ringing);
  const scrollToPage = useCallback((index: number) => {
    const scroller = track.current;
    if (scroller) scroller.scrollTo({ left: index * scroller.clientWidth, behavior: "instant" });
  }, []);
  useLayoutEffect(() => {
    scrollToPage(pageIndex);
  }, [pageIndex, viewport, pagingBlocked, scrollToPage]);
  const navigate = (id: PageId) => {
    scrollToPage(pages.findIndex((p) => p.id === id));
    setPage(id);
  };
  const enterStandby = () => {
    setSheet(null);
    setStandby(true);
  };
  useEffect(() => {
    if (standby || sheet || configuration || cleanDeadline || ringing) return;
    let timer: ReturnType<typeof setTimeout>;
    let lastActivity = performance.now();
    const reset = () => {
      lastActivity = performance.now();
    };
    const check = () => {
      const remaining = IDLE_TIMEOUT_MS - (performance.now() - lastActivity);
      if (remaining <= 0) setStandby(true);
      else timer = setTimeout(check, remaining);
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel"] as const;
    events.forEach((name) =>
      window.addEventListener(name, reset, { passive: true }),
    );
    timer = setTimeout(check, IDLE_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, reset));
    };
  }, [standby, sheet, configuration, cleanDeadline, ringing]);
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
        if (standby) {
          event.preventDefault();
          event.stopPropagation();
          setStandby(false);
          return;
        }
        const button = (event.target as Element).closest("button:enabled");
        if (button && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          button.animate([{ opacity: 0.45 }, { opacity: 1 }], {
            duration: 250,
            easing: "ease-out",
          });
        }
      }}
    >
      <div
        ref={track}
        className="page-track"
        inert={pagingBlocked}
        onScrollEnd={(event) => {
          if (pagingBlocked) return;
          const scroller = event.currentTarget;
          const index = Math.round(scroller.scrollLeft / scroller.clientWidth);
          const settled = pages[index];
          if (settled) setPage(settled.id);
        }}
      >
        {pages.map((p) => (
          <section
            key={p.id}
            className="dashboard-page"
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
                <p>{p.id === "home" ? (portrait ? <HomeSummary /> : <HomeDate />) : <RoomCaption room={p.id} />}</p>
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
        onPage={navigate}
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
            onClick={() => navigate(p.id)}
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
      {ringing && <DoorCall view={() => setSheet("door")} chime={chime} />}
      {!sheet && !ringing && <CommandError />}
      {configuration}
    </div>
  );
});

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useHome } from "../hooks/useHome";
import type { PanelConfig } from "../data/hass";
import type { RoomId } from "../data/types";
import { roomIds, roomNames, scenes } from "../data/rooms";
import { playChime } from "../data/chime";
import { Pill, Slider } from "./Controls";

interface EntityChoice { id: string; name: string; domain: string; state: string; unit?: string; device_class?: string }
type EntityKey = Exclude<keyof PanelConfig, "lights" | "scenes" | "local_sound" | "local_volume" | "speaker_sound" | "announcement">;
const sections = { door: "현관", rooms: "공간별 기기", environment: "환경 센서", sound: "소리" };

export function ConnectionSettings({ config, endpoint, close }: {
  config: PanelConfig;
  endpoint: (path: string) => string;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const { state } = useHome();
  const [draft, setDraft] = useState(config);
  const [entities, setEntities] = useState<EntityChoice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [section, setSection] = useState<keyof typeof sections>("door");
  const [room, setRoom] = useState<RoomId>("living");
  const [query, setQuery] = useState("");
  useLayoutEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  useEffect(() => { if (state.door.ringing) close(); }, [state.door.ringing, close]);
  useEffect(() => { content.current?.scrollTo(0, 0); setQuery(""); }, [section, room]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint("api/entities"), { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("기기 목록을 불러오지 못했어요. HA 관리자 권한과 연결을 확인해 주세요.");
        setEntities(await response.json() as EntityChoice[]);
        setLoaded(true);
      }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "목록을 불러오지 못했어요."); });
    return () => controller.abort();
  }, [endpoint]);
  const patch = (value: Partial<PanelConfig>) => { setDraft(current => ({ ...current, ...value })); setMessage(""); };
  const matches = (entity: EntityChoice) => `${entity.name} ${entity.id}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const picker = (label: string, value: string | undefined, domains: string[], change: (id: string) => void) => {
    const selected = entities.find(entity => entity.id === value);
    const choices = entities.filter(entity => domains.includes(entity.domain) && (matches(entity) || entity.id === value));
    return <label className="connection-field" key={label}>
      <span>{label}</span>
      <select aria-label={label} value={value || ""} disabled={!loaded || pending || testing} onChange={event => change(event.target.value)}>
        <option value="">연결 안 함</option>
        {value && !selected && <option value={value}>찾을 수 없는 기기 · {value}</option>}
        {choices.map(entity => <option value={entity.id} key={entity.id}>{entity.name} · {entity.id}{["unavailable", "unknown"].includes(entity.state) ? " · 상태 확인 필요" : ""}</option>)}
      </select>
      <small>{!value ? "선택하면 대시보드에 연결됩니다." : !selected ? "HA에서 기기를 찾을 수 없어요. 다시 선택해 주세요." : `현재 상태: ${selected.state}${selected.unit ? ` ${selected.unit}` : ""}`}</small>
    </label>;
  };
  const field = (key: EntityKey, label: string, domains: string[]) => picker(label, draft[key], domains, id => patch({ [key]: id }));
  const save = async () => {
    setPending(true); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint("api/settings"), { method: "PUT", headers: { "Content-Type": "application/json", "X-Home-Kiosk": "settings" }, body: JSON.stringify(draft) });
      if (!response.ok) throw new Error((await response.json() as { message: string }).message);
      close();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "설정을 저장하지 못했어요."); }
    finally { setPending(false); }
  };
  const testSound = async (external: boolean) => {
    setTesting(true); setError(""); setMessage("");
    try {
      if (external) {
        const response = await fetch(endpoint("api/test-sound"), { method: "POST", headers: { "Content-Type": "application/json", "X-Home-Kiosk": "settings" }, body: JSON.stringify(draft) });
        if (!response.ok) throw new Error((await response.json() as { message: string }).message);
        setMessage("외부 스피커에 재생 요청을 보냈어요. 실제로 들리는지 확인해 주세요.");
      } else { await playChime(draft.local_volume ?? 60); setMessage("이 화면을 연 기기에서 벨소리를 재생했어요."); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "소리를 재생하지 못했어요."); }
    finally { setTesting(false); }
  };
  const selectedLights = draft.lights?.[room] || [];
  return <dialog ref={dialog} className="sheet-dialog connection-dialog" aria-labelledby="connection-settings-title" onCancel={event => { event.preventDefault(); if (!pending) close(); }}>
    <section className="connection-form">
      <header className="sheet-heading"><div><h2 id="connection-settings-title">우리 집 연결</h2><p>{state.connection === "online" ? "Home Assistant 연결됨" : "Home Assistant 연결을 기다리고 있어요"} · 필요한 기기만 선택하세요</p></div></header>
      <nav className="connection-tabs" aria-label="연결 설정 분류">{Object.entries(sections).map(([key,label]) => <Pill key={key} active={section === key} onClick={() => setSection(key as keyof typeof sections)}>{label}</Pill>)}</nav>
      <div ref={content} className="connection-body">
        <label className="connection-search"><span>기기 검색</span><input type="search" placeholder="이름이나 엔티티 ID로 검색" value={query} onChange={event => setQuery(event.target.value)} /></label>
        {!loaded && !error && <p role="status">HA에 등록된 기기를 불러오는 중…</p>}
        {section === "door" && <>
          <p className="connection-help">초인종이 울리면 대기 화면을 깨우고 카메라를 크게 보여줍니다. 동작 감지 센서가 아닌 호출 전용 기기를 선택하세요.</p>
          {field("doorbell_entity", "초인종 호출", ["event", "binary_sensor"])}
          {field("camera_entity", "현관 카메라", ["camera"])}
          <p className="connection-help">소리는 ‘소리’에서 따로 켤 수 있어요. 문 열기와 양방향 통화는 지원하지 않습니다.</p>
        </>}
        {section === "rooms" && <>
          <nav className="connection-tabs" aria-label="설정할 공간">{roomIds.map(id => <Pill key={id} active={room === id} onClick={() => setRoom(id)}>{roomNames[id]}</Pill>)}</nav>
          <h3>조명 <small>{selectedLights.length}개 선택</small></h3>
          <div className="entity-checks">{entities.filter(e => e.domain === "light" && (matches(e) || selectedLights.includes(e.id))).map(entity => {
            const elsewhere = roomIds.some(id => id !== room && draft.lights?.[id]?.includes(entity.id));
            return <label className="entity-check" key={entity.id}><input type="checkbox" checked={selectedLights.includes(entity.id)} disabled={pending || elsewhere} onChange={event => patch({ lights: { ...draft.lights, [room]: event.target.checked ? [...selectedLights, entity.id] : selectedLights.filter(id => id !== entity.id) } })} /><span>{entity.name}<small>{elsewhere ? "다른 공간에 연결됨" : entity.id} · {entity.state}</small></span></label>;
          })}</div>
          {loaded && !entities.some(e => e.domain === "light") && <p>HA에 등록된 조명이 없어요.</p>}
          {selectedLights.filter(id => !entities.some(e => e.id === id)).map(id => <div className="connection-missing" key={id}><span>찾을 수 없는 조명 · {id}</span><Pill onClick={() => patch({ lights: { ...draft.lights, [room]: selectedLights.filter(value => value !== id) } })}>연결 해제</Pill></div>)}
          <details><summary>장면 연결 <small>선택 사항</small></summary><p className="connection-help">HA에 만든 장면을 대시보드의 장면 버튼에 연결합니다.</p>{scenes[room].map(scene => picker(scene.name, draft.scenes?.[room]?.[scene.id], ["scene"], id => patch({ scenes: { ...draft.scenes, [room]: { ...draft.scenes?.[room], [scene.id]: id } } })))}</details>
          {room === "living" && <><h3>거실 기기</h3>{field("curtain_entity", "커튼", ["cover"])}{field("climate_entity", "냉난방", ["climate"])}{field("media_entity", "미디어 플레이어", ["media_player"])}</>}
        </>}
        {section === "environment" && <>
          <p className="connection-help">센서 값은 대시보드 상단에 표시됩니다. HA에서 설정한 측정 단위를 확인해 주세요.</p>
          {field("indoor_entity", "실내 온도", ["sensor"])}{field("humidity_entity", "실내 습도", ["sensor"])}
          {field("indoor_pm25_entity", "실내 초미세먼지", ["sensor"])}{field("outdoor_pm25_entity", "실외 초미세먼지", ["sensor"])}
          {field("co2_entity", "이산화탄소", ["sensor"])}{field("weather_entity", "날씨", ["weather"])}{field("ventilation_entity", "환기 팬", ["fan"])}
        </>}
        {section === "sound" && <>
          <p className="connection-help">키오스크와 외부 스피커를 각각 켜거나 함께 사용할 수 있어요.</p>
          <section className="connection-card"><label className="entity-check"><input type="checkbox" checked={!!draft.local_sound} onChange={event => patch({ local_sound: event.target.checked })} /><span>키오스크 벨소리<small>파이에 연결한 HDMI·USB 스피커에서 재생</small></span></label>
            <label className="range-field"><span>벨소리 음량 · {draft.local_volume ?? 60}%</span><Slider label="벨소리 음량" value={draft.local_volume ?? 60} disabled={!draft.local_sound} onChange={local_volume => patch({ local_volume })} /></label>
            <Pill icon="volume" onClick={() => void testSound(false)} disabled={testing}>이 기기에서 벨소리 듣기</Pill>
            <p className="connection-help">이 버튼은 현재 브라우저에서 재생합니다. 파이 출력 장치는 HA 앱의 오디오 설정에서 선택하세요.</p>
          </section>
          <section className="connection-card"><label className="entity-check"><input type="checkbox" checked={!!draft.speaker_sound} onChange={event => patch({ speaker_sound: event.target.checked })} /><span>HA 외부 스피커 안내<small>대시보드가 닫혀 있어도 앱 서버가 안내</small></span></label>
            {field("speaker_entity", "알림 스피커", ["media_player"])}{field("tts_entity", "음성 엔진", ["tts"])}
            <label className="connection-field"><span>안내 문구</span><input aria-label="안내 문구" maxLength={200} value={draft.announcement ?? "방문자가 왔어요."} onChange={event => patch({ announcement: event.target.value })} /></label>
            <Pill icon="volume" onClick={() => void testSound(true)} disabled={testing || !draft.speaker_sound || !draft.speaker_entity || !draft.tts_entity}>외부 스피커 테스트</Pill>
            <p className="connection-help">스피커의 현재 음량을 사용합니다. 인터넷 없이 쓰려면 HA에 로컬 음성 엔진을 연결하세요. 일부 스피커는 재생 중인 음악을 중단할 수 있어요.</p>
          </section>
        </>}
      </div>
      <footer className="connection-footer">
        {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
        <div className="control-row"><Pill onClick={close} disabled={pending}>닫기</Pill><Pill active onClick={() => void save()} disabled={!loaded || pending || testing}>{pending ? "저장 중…" : "저장하고 적용"}</Pill></div>
      </footer>
    </section>
  </dialog>;
}

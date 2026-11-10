import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useHome } from "../hooks/useHome";
import type { PanelConfig } from "../data/hass";
import { Pill } from "./Controls";

interface EntityChoice { id: string; name: string; domain: string }

export function ConnectionSettings({ config, endpoint, close }: {
  config: PanelConfig;
  endpoint: (path: string) => string;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { state } = useHome();
  const [draft, setDraft] = useState(config);
  const [entities, setEntities] = useState<EntityChoice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useLayoutEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => { if (state.door.ringing) close(); }, [state.door.ringing, close]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint("api/entities"), { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("엔티티 목록을 불러오지 못했습니다. HA 관리자 권한과 연결을 확인해 주세요.");
        setEntities(await response.json() as EntityChoice[]);
        setLoaded(true);
      }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "목록을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [endpoint]);
  const save = async () => {
    setPending(true);
    setError("");
    try {
      const response = await fetch(endpoint("api/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Home-Kiosk": "settings" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) {
        const failure = await response.json() as { message: string };
        throw new Error(failure.message);
      }
      close();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "설정을 저장하지 못했습니다."); }
    finally { setPending(false); }
  };
  return <dialog ref={dialog} className="sheet-dialog" aria-labelledby="connection-settings-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <section className="sheet-content connection-form">
      <header className="sheet-heading"><h2 id="connection-settings-title">연결 설정</h2></header>
      <p>HA에 등록된 초인종 호출 전용 엔티티를 선택하세요. 동작 감지 센서는 호출로 사용하지 않습니다.</p>
      {([
        ["doorbell_entity", "초인종 호출", ["event", "binary_sensor"]],
        ["camera_entity", "현관 카메라", ["camera"]],
      ] as const).map(([key, label, domains]) => <label className="connection-field" key={key}>
        <span>{label}</span>
        <select aria-label={label} value={draft[key] || ""} disabled={!loaded || pending} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}>
          <option value="">연결 안 함</option>
          {entities.filter((entity) => (domains as readonly string[]).includes(entity.domain)).map((entity) => <option value={entity.id} key={entity.id}>{entity.name} · {entity.id}</option>)}
        </select>
      </label>)}
      {error && <p role="alert">{error}</p>}
      <div className="control-row"><Pill onClick={close}>닫기</Pill><Pill onClick={() => void save()} disabled={!loaded || pending}>{pending ? "저장 중…" : "저장"}</Pill></div>
    </section>
  </dialog>;
}

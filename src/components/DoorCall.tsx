import { CommandError } from "./CommandError";
import { useEffect, useRef, useState } from "react";
import { useHome } from "../hooks/useHome";
import { Icon } from "./Icon";
import { Pill } from "./Controls";
import { DoorCamera } from "./DoorCamera";

export function DoorCall({ view, chime }: { view: () => void; chime?: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { send, state } = useHome();
  const [soundError, setSoundError] = useState("");
  const played = useRef<string | undefined>(undefined);
  const callId = state.door.events[0]?.id;
  useEffect(() => {
    if (!chime || !callId || played.current === callId) return;
    played.current = callId;
    void chime().catch(() => setSoundError("소리를 허용하려면 벨소리 재생을 눌러 주세요."));
  }, [chime, callId]);
  const dismiss = () => send({ type: "door-dismiss" });
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="sheet-dialog door-call"
      aria-labelledby="door-call-title"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <header className="door-call-heading">
        <Icon name="door" />
        <div><h2 id="door-call-title">방문자가 왔어요.</h2><p>현관에서 호출 중</p></div>
      </header>
      <DoorCamera />
      {soundError && <div role="status"><p>{soundError}</p><Pill onClick={() => { void chime?.().then(() => setSoundError("")).catch(() => setSoundError("소리를 재생하지 못했어요. 스피커 연결을 확인해 주세요.")); }}>벨소리 재생</Pill></div>}
      {state.door.soundError && <p role="status">{state.door.soundError}</p>}
      <div className="control-row">
        <Pill
          onClick={() => {
            dismiss();
            view();
          }}
        >
          현관 보기
        </Pill>
        <Pill onClick={dismiss}>닫기</Pill>
      </div>
      <CommandError />
    </dialog>
  );
}

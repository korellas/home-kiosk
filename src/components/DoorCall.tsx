import { CommandError } from "./CommandError";
import { useEffect, useRef } from "react";
import { useHome } from "../hooks/useHome";
import { Icon } from "./Icon";
import { Pill } from "./Controls";
import { DoorCamera } from "./DoorCamera";

export function DoorCall({ view }: { view: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { send } = useHome();
  const dismiss = () => send({ type: "door-dismiss" });
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="door-call"
      aria-labelledby="door-call-title"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <Icon name="door" />
      <h2 id="door-call-title">방문자가 왔어요.</h2>
      <p>현관에서 호출 중</p>
      <DoorCamera />
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

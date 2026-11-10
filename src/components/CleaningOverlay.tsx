import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export function CleaningOverlay({
  deadline,
  finish,
}: {
  deadline: number;
  finish: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [remaining, setRemaining] = useState(() =>
    Math.ceil((deadline - Date.now()) / 1000),
  );
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    const timer = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) finish();
    }, 200);
    return () => {
      clearInterval(timer);
      node?.close();
    };
  }, [deadline, finish]);
  return (
    <dialog
      ref={dialog}
      className="clean-dialog"
      aria-labelledby="clean-title"
      onCancel={(e) => e.preventDefault()}
    >
      <Icon name="clean" />
      <h2 id="clean-title">편하게 닦아주세요.</h2>
      <p>지금은 터치가 잠겨 있어요.</p>
      <strong>
        {remaining}
        <small>초</small>
      </strong>
      <p>시간이 지나면 원래 화면으로 돌아갑니다.</p>
    </dialog>
  );
}

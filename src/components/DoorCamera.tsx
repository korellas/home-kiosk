import { useEffect, useState } from "react";
import { useHome } from "../hooks/useHome";

export function DoorCamera() {
  const { state, offline } = useHome(state => state.door);
  const url = state.cameraUrl;
  const [frame, setFrame] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    if (!url || offline) return;
    const timer = window.setInterval(() => setFrame(Date.now()), 2000);
    return () => window.clearInterval(timer);
  }, [url, offline]);
  return (
    <div className="camera-placeholder">
      {url && !offline ? (
        <>
          <img
            src={`${url}${url.includes("?") ? "&" : "?"}_frame=${frame}`}
            alt="현관 카메라 · 주기적으로 갱신되는 이미지"
            onError={() => setFailed(true)}
            onLoad={() => setFailed(false)}
          />
          {failed && <p role="status">카메라에 연결할 수 없어요.</p>}
        </>
      ) : (
        <p>{offline ? "Home Assistant 연결을 기다리고 있어요." : "연결 설정에서 현관 카메라를 선택해 주세요."}</p>
      )}
    </div>
  );
}

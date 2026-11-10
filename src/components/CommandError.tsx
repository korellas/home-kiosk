import { useHome } from "../hooks/useHome";
import { Icon } from "./Icon";

export function CommandError() {
  const { error, dismissError } = useHome();
  if (!error) return null;
  return (
    <div className="error-toast" role="alert">
      <span>{error}</span>
      <button aria-label="오류 알림 닫기" onClick={dismissError}>
        <Icon name="close" />
      </button>
    </div>
  );
}

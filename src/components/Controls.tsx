import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

export function Pill({
  children,
  icon,
  active = false,
  onClick,
  disabled = false,
  label,
}: {
  children?: ReactNode;
  icon?: IconName;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={`pill ${active ? "selected" : ""} ${!children ? "icon-only" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
    >
      {icon && <Icon name={icon} />} {children}
    </button>
  );
}
export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  color = "var(--warm)",
  mixed = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  color?: string;
  mixed?: boolean;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className={`slider ${mixed ? "mixed" : ""}`}
      aria-label={label}
      aria-valuetext={
        mixed
          ? "조명별 밝기가 다름; 조절하면 켜진 조명을 같은 밝기로 설정"
          : `${value}`
      }
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ "--fill": `${fill}%`, "--slider-color": color } as CSSProperties}
    />
  );
}
export function Stat({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: number | string | null;
  unit?: string;
  note?: string | null;
}) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <div className="stat-value">
        {value ?? "—"}
        {value !== null && <small>{unit}</small>}
      </div>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

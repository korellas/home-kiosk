import { useEffect, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  MouseEvent,
  ReactNode,
} from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

export function ActionButton({
  onClick,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  return (
    <button
      {...props}
      className={`${props.className ?? ""} action-button`}
      aria-busy={busy || undefined}
      aria-disabled={props.disabled || busy || undefined}
      onClick={async (event) => {
        if (inFlight.current || !onClick) return;
        inFlight.current = true;
        try {
          const result = onClick(event);
          if (result && typeof result.then === "function") {
            setBusy(true);
            await result;
          }
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      }}
    >
      {children}
      {busy && <span className="control-spinner" aria-hidden="true" />}
    </button>
  );
}

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
  onClick?: () => void | Promise<unknown>;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <ActionButton
      type="button"
      className={`pill ${active ? "selected" : ""} ${!children ? "icon-only" : ""}`}
      onClick={onClick}
      disabled={disabled || !onClick}
      aria-label={label}
      aria-pressed={active}
    >
      {icon && <Icon name={icon} />} {children}
    </ActionButton>
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
  commitOnRelease = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void | Promise<boolean | void>;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  color?: string;
  mixed?: boolean;
  commitOnRelease?: boolean;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const draftRef = useRef<number | null>(null);
  const editing = useRef(false);
  const inFlight = useRef(false);
  const awaitingValue = useRef<number | null>(null);
  const clearDraft = () => {
    draftRef.current = null;
    awaitingValue.current = null;
    setDraft(null);
  };
  useEffect(() => {
    if (
      disabled ||
      (!editing.current &&
        awaitingValue.current !== null &&
        (value !== awaitingValue.current || value === draftRef.current))
    ) {
      editing.current = false;
      clearDraft();
    }
  }, [value, disabled]);
  const commit = async () => {
    if (!editing.current || inFlight.current) return;
    editing.current = false;
    const next = draftRef.current;
    if (next === null || next === value) {
      clearDraft();
      return;
    }
    awaitingValue.current = value;
    inFlight.current = true;
    setBusy(true);
    try {
      const accepted = await onChange(next);
      if (accepted === false) clearDraft();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const cancel = () => {
    if (!editing.current) return;
    editing.current = false;
    clearDraft();
  };
  const displayed = draft ?? value;
  const fill = ((displayed - min) / (max - min)) * 100;
  return (
    <span className="slider-control">
      <input
        type="range"
        className={`slider ${mixed && draft === null ? "mixed" : ""}`}
        aria-label={label}
        aria-valuetext={
          mixed && draft === null
            ? "조명별 밝기가 다름; 조절하면 켜진 조명을 같은 밝기로 설정"
            : `${displayed}${draft !== null ? (busy ? " · 전송 중" : editing.current ? " · 미리보기" : " · 상태 확인 중") : ""}`
        }
        min={min}
        max={max}
        step={step}
        value={displayed}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        onPointerDown={(event) => {
          if (!commitOnRelease || inFlight.current) return;
          editing.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={() => {
          if (commitOnRelease) void commit();
        }}
        onPointerCancel={cancel}
        onKeyDown={(event) => {
          if (
            commitOnRelease &&
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(event.key)
          )
            editing.current = true;
        }}
        onKeyUp={() => {
          if (commitOnRelease) void commit();
        }}
        onBlur={() => {
          if (commitOnRelease) void commit();
        }}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!commitOnRelease) {
            void onChange(next);
            return;
          }
          draftRef.current = next;
          setDraft(next);
          if (!editing.current) {
            editing.current = true;
            void commit();
          }
        }}
        style={
          { "--fill": `${fill}%`, "--slider-color": color } as CSSProperties
        }
      />
      {draft !== null && (
        <output className="slider-feedback">
          {displayed}
          {busy ? " · 전송 중" : editing.current ? "" : " · 상태 확인 중"}
        </output>
      )}
    </span>
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

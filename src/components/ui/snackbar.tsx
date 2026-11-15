"use client";

import * as React from "react";

export interface SnackbarProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
  /** Stisk pozastaví časovač (ToastProvider). */
  onPressChange?: (pressed: boolean) => void;
}

/** Odhoz prstem do strany: podíl šířky nebo rychlost (px/ms). */
const DISMISS_RATIO = 0.35;
const DISMISS_VELOCITY = 0.5;
const AXIS_LOCK_PX = 8;

/**
 * Snackbar M3 v inverzní barvě. Umístění a `aria-live` drží ToastProvider,
 * tady je jen obsah, který jde odhodit prstem do strany; svislý pohyb
 * nechává scrollu.
 */
export function Snackbar({
  title,
  description,
  actionLabel,
  onAction,
  onClose,
  onPressChange,
}: SnackbarProps) {
  const [dx, setDx] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const swipe = React.useRef<{
    x0: number;
    y0: number;
    x: number;
    t: number;
    v: number;
    locked: boolean;
  } | null>(null);
  const swiped = React.useRef(false);
  const width = React.useRef(0);

  const end = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const s = swipe.current;
    swipe.current = null;
    onPressChange?.(false);
    setDragging(false);
    if (!s?.locked) return;
    const off = e.clientX - s.x0;
    if (!cancelled && (Math.abs(off) > width.current * DISMISS_RATIO || Math.abs(s.v) > DISMISS_VELOCITY)) {
      setLeaving(true);
      setDx(Math.sign(off || s.v) * width.current * 1.2);
      window.setTimeout(onClose, 160);
    } else {
      setDx(0);
    }
  };

  return (
    <div
      className="anim-enter w-full touch-pan-y select-none"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        swiped.current = false;
        width.current = e.currentTarget.offsetWidth;
        swipe.current = { x0: e.clientX, y0: e.clientY, x: e.clientX, t: e.timeStamp, v: 0, locked: false };
        onPressChange?.(true);
      }}
      onPointerMove={(e) => {
        const s = swipe.current;
        if (!s) return;
        const ox = e.clientX - s.x0;
        if (!s.locked) {
          // Zámek osy: rozhodne prvních 8 px, svislý tah patří scrollu.
          if (Math.abs(ox) < AXIS_LOCK_PX && Math.abs(e.clientY - s.y0) < AXIS_LOCK_PX) return;
          if (Math.abs(ox) <= Math.abs(e.clientY - s.y0)) {
            swipe.current = null;
            onPressChange?.(false);
            return;
          }
          s.locked = true;
          swiped.current = true;
          setDragging(true);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // ukazatel už mezitím zmizel
          }
        }
        const dt = e.timeStamp - s.t;
        if (dt > 0) s.v = (e.clientX - s.x) / dt;
        s.x = e.clientX;
        s.t = e.timeStamp;
        setDx(ox);
      }}
      onPointerUp={(e) => end(e, false)}
      onPointerCancel={(e) => end(e, true)}
      onClickCapture={(e) => {
        // Po odhozu se nesmí odpálit akce, na které prst začal.
        if (swiped.current) {
          e.preventDefault();
          e.stopPropagation();
          swiped.current = false;
        }
      }}
    >
      <div
        className="flex min-h-12 items-center gap-2 rounded-xl border border-white/10 bg-inverse-surface py-1.5 pl-4 pr-2 text-inverse-on-surface shadow-[var(--shadow-3)]"
        style={{
          transform: dx ? `translateX(${dx}px)` : undefined,
          opacity: dx ? Math.max(0, 1 - Math.abs(dx) / (width.current || 1)) : undefined,
          transition: dragging
            ? "none"
            : leaving
              ? "transform 160ms var(--ease-emphasized-accel), opacity 160ms var(--ease-emphasized-accel)"
              : "transform var(--dur-spring-fast) var(--spring-fast), opacity var(--dur-effects) var(--effects)",
        }}
      >
        <div className="min-w-0 flex-1 py-1.5">
          <p className="text-body-md">{title}</p>
          {description ? <p className="mt-0.5 text-body-sm opacity-80">{description}</p> : null}
        </div>
        {actionLabel ? (
          <button
            type="button"
            onClick={onAction}
            className="state-layer h-10 shrink-0 rounded-full px-3 text-label-lg text-inverse-primary"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

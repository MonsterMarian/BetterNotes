"use client";

import * as React from "react";
import { cn } from "./cn";

/**
 * Výška klávesnice. WebView bez `adjustResize` klávesnici jen přikreslí přes
 * stránku, tak se dopočítá z `visualViewport`.
 */
export function useKeyboardHeight(): number {
  const [keyboard, setKeyboard] = React.useState(0);

  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setKeyboard(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return keyboard;
}

/** Plovoucí lišta M3 Expressive (formát, diktování). Drží se nad klávesnicí i nad snackbarem. */
export function FloatingToolbar({
  children,
  vibrant = false,
  className,
}: {
  children: React.ReactNode;
  vibrant?: boolean;
  className?: string;
}) {
  const keyboard = useKeyboardHeight();
  const ref = React.useRef<HTMLDivElement>(null);

  // Prohlížeč posouvá kurzor do výhledu podle viewportu a o liště neví -
  // poslední řádek by skončil pod ní (výška lišty + 12 odsazení + rezerva).
  // `className` mění výšku (rozbalené formátování), proto je v závislostech.
  React.useEffect(() => {
    const root = document.documentElement;
    root.style.scrollPaddingBottom = `${keyboard + (ref.current?.offsetHeight ?? 64) + 24}px`;
    return () => {
      root.style.scrollPaddingBottom = "";
    };
  }, [keyboard, className]);

  return (
    <div
      ref={ref}
      role="toolbar"
      style={{ bottom: `calc(max(var(--mw-safe-bottom), ${keyboard}px) + 12px + var(--snackbar-h, 0px))` }}
      className={cn(
        "anim-enter no-scrollbar fixed left-1/2 z-40 flex h-16 max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full px-2 shadow-[var(--shadow-3)] transition-colors duration-200",
        vibrant ? "border border-primary/30 bg-primary-container text-on-primary-container" : "border border-white/10 bg-surface-high text-on-surface",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Tlačítko lišty. Stisk nebere fokus textarei, takže kurzor i klávesnice zůstanou. */
export function ToolbarButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onPointerDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "state-layer press-morph grid size-12 shrink-0 place-items-center rounded-[24px] disabled:opacity-40 [&_svg]:size-6",
        active && "bg-primary text-on-primary",
      )}
    >
      {icon}
    </button>
  );
}

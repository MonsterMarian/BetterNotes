"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { useLongPress } from "@/lib/use-long-press";
import { useLayer, useMounted, usePresence } from "./layer";

export interface FabProps {
  icon: React.ReactNode;
  label?: string;
  /** Rozbalený ukazuje popisek; sbalení jede po pružině šířky. */
  extended?: boolean;
  size?: "md" | "lg";
  onClick?: () => void;
  onLongPress?: () => void;
  /** Otevřené menu: FAB se zakulatí do kruhu a ikona se otočí o 45°. */
  menuOpen?: boolean;
  className?: string;
  "aria-label"?: string;
}

const noop = () => {};

/**
 * Plovoucí tlačítko hlavní akce. Odsazení zdola počítá s pruhem gest
 * i se snackbarem, který ho jinak překryje.
 */
export function Fab({
  icon,
  label,
  extended = false,
  size = "md",
  onClick,
  onLongPress,
  menuOpen,
  className,
  "aria-label": ariaLabel,
}: FabProps) {
  const longPress = useLongPress({ onLongPress: onLongPress ?? noop, onClick: () => onClick?.() });
  const showLabel = extended && !!label && !menuOpen;

  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      aria-expanded={menuOpen}
      className={cn(
        "fab state-layer fixed inline-flex select-none items-center justify-center",
        "bottom-[calc(16px+var(--mw-safe-bottom)+var(--snackbar-h,0px))] right-[calc(16px+var(--mw-safe-right))]",
        "bg-primary font-semibold text-on-primary shadow-[var(--shadow-3)] active:scale-95",
        size === "lg" && !menuOpen
          ? "min-h-24 min-w-24 rounded-full px-7 [&_svg]:size-9"
          : "min-h-14 min-w-14 rounded-full px-5 [&_svg]:size-6",
        // Kruh přes poloměr 28 px, ne 9999 - jinak by morf cvakl až na konci.
        menuOpen ? "z-[45] rounded-[28px]" : "z-30",
        className,
      )}
      {...(onLongPress ? longPress : { onClick })}
    >
      <span className="fab-icon" aria-hidden>
        {icon}
      </span>
      {label ? (
        <span className="fab-label text-title-md" data-shown={showLabel || undefined} aria-hidden>
          <span>{label}</span>
        </span>
      ) : null}
    </button>
  );
}

export interface FabMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

/**
 * Rychlé vytvoření nad FABem: pilulky se zvednou vějířem odspodu, nejbližší
 * první. Zpět i Escape menu zavřou (vrstva zpět, I18).
 */
export function FabMenu({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: FabMenuItem[];
}) {
  const mounted = useMounted();
  const present = usePresence(open);
  const listRef = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  useLayer(open, close);

  React.useEffect(() => {
    if (open) listRef.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [open]);

  if (!mounted || !present) return null;
  const state = open ? "open" : "closed";

  return createPortal(
    <div className={cn("fixed inset-0 z-40", !open && "pointer-events-none")}>
      <div data-state={state} className="dlg-scrim absolute inset-0" onClick={close} aria-hidden />
      <div
        ref={listRef}
        role="menu"
        className="absolute bottom-[calc(88px+var(--mw-safe-bottom)+var(--snackbar-h,0px))] right-[calc(16px+var(--mw-safe-right))] flex flex-col items-end gap-2"
      >
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            data-state={state}
            style={{ "--i": items.length - 1 - i } as React.CSSProperties}
            className="fab-menu-item state-layer inline-flex h-14 items-center gap-3 rounded-full bg-primary-container pl-4 pr-6 text-title-md text-on-primary-container [&_svg]:size-6 [&_svg]:shrink-0"
            onClick={() => {
              close();
              item.onSelect();
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

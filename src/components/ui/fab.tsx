"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Plovoucí tlačítko pro hlavní akci obrazovky. Odsazení zdola počítá s pruhem
 * gest, aby ho na telefonu s gestovou navigací nepřekryl systém.
 */
export function Fab({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "mw-fab-in fixed z-30 inline-flex items-center gap-2 rounded-full",
        "bottom-[calc(1.5rem+var(--mw-safe-bottom))] right-[calc(1.25rem+var(--mw-safe-right))]",
        "h-14 px-5 text-sm font-medium",
        "bg-progress text-progress-foreground shadow-lg shadow-black/25",
        "transition-transform active:scale-95 hover:brightness-105",
        "[&_svg]:size-5 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

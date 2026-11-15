"use client";

import * as React from "react";
import { useBackLayer } from "@/components/providers/use-app-back";

/** Délka odchodové animace (≈ 60 % příchodu). Sedí s `250ms` v globals.css. */
export const EXIT_MS = 250;

/**
 * Drží zavřenou vrstvu ještě chvíli v DOM, aby stihla odjet. Vrací true,
 * dokud se má vykreslovat; stav animace si prvek bere z `open`.
 */
export function usePresence(open: boolean, exitMs = EXIT_MS): boolean {
  const [present, setPresent] = React.useState(open);

  React.useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const timer = window.setTimeout(() => setPresent(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, exitMs]);

  return open || present;
}

/** Portály až po namontování - jinak nesedí hydratace (I9). */
export function useMounted(): boolean {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted;
}

/** Otevřené vrstvy v pořadí, jak přišly - Escape zavře jen tu nejvýš (I18). */
const escapeStack: object[] = [];

/**
 * Přihlásí otevřenou vrstvu (dialog, menu FABu) k Escape i k systémovému Zpět.
 * Obojí zavře jen vrstvu nejvýš, ne všechny naráz.
 */
export function useLayer(open: boolean, close: () => void): void {
  const latest = React.useRef(close);
  latest.current = close;

  useBackLayer(open, close);

  React.useEffect(() => {
    if (!open) return;
    const token = {};
    escapeStack.push(token);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && escapeStack[escapeStack.length - 1] === token) {
        e.preventDefault();
        latest.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const at = escapeStack.indexOf(token);
      if (at !== -1) escapeStack.splice(at, 1);
    };
  }, [open]);
}

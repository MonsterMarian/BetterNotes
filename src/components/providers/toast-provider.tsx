"use client";

import * as React from "react";
import { Snackbar } from "@/components/ui/snackbar";
import { useKeyboardHeight } from "@/components/ui/floating-toolbar";

/**
 * Hlášky dole na obrazovce. Vždy jen jedna: nová nahradí starou - dvě
 * snackbary nad sebou by zakryly polovinu seznamu a "Zpět" by nebylo jasné
 * ke které akci patří.
 */
type ToastTone = "success" | "info" | "warn";

export interface ToastInput {
  tone?: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  /** ms; výchozí 6 s s akcí (je čas trefit "Zpět"), jinak 4 s. */
  duration?: number;
}

interface ToastApi {
  toast: (t: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast musí být uvnitř ToastProvider");
  return ctx;
}

/** Výška snackbary pro FAB a spodní odsazení seznamu, ať je nezakryje. */
function setSnackbarHeight(px: number): void {
  document.documentElement.style.setProperty("--snackbar-h", `${px}px`);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = React.useState<(ToastInput & { id: number }) | null>(null);
  const nextId = React.useRef(1);
  const timer = React.useRef<{ handle?: number; endsAt: number; left: number }>({ endsAt: 0, left: 0 });
  const boxRef = React.useRef<HTMLDivElement>(null);
  // Bez adjustResize by snackbar i jeho Zpět skončily pod klávesnicí.
  const keyboard = useKeyboardHeight();

  const dismiss = React.useCallback((id: number) => {
    setCurrent((t) => (t?.id === id ? null : t));
  }, []);

  const startTimer = React.useCallback(
    (id: number, ms: number) => {
      window.clearTimeout(timer.current.handle);
      timer.current = { handle: window.setTimeout(() => dismiss(id), ms), endsAt: Date.now() + ms, left: ms };
    },
    [dismiss],
  );

  const toast = React.useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setCurrent({ ...t, id });
      startTimer(id, t.duration ?? (t.action ? 6000 : 4000));
      return id;
    },
    [startTimer],
  );

  // Držený prst čas zastaví - kdo čte, nemá o hlášku přijít.
  const onPressChange = React.useCallback(
    (pressed: boolean) => {
      if (!current) return;
      if (pressed) {
        window.clearTimeout(timer.current.handle);
        timer.current.left = Math.max(0, timer.current.endsAt - Date.now());
      } else {
        startTimer(current.id, Math.max(1500, timer.current.left));
      }
    },
    [current, startTimer],
  );

  React.useLayoutEffect(() => {
    const box = boxRef.current;
    if (!current || !box) {
      setSnackbarHeight(0);
      return;
    }
    const measure = () => setSnackbarHeight(box.offsetHeight + 8);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [current]);

  React.useEffect(() => () => window.clearTimeout(timer.current.handle), []);

  const api = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
        style={{ bottom: `calc(16px + max(var(--mw-safe-bottom), ${keyboard}px))` }}
        role="status"
        aria-live="polite"
      >
        {current ? (
          <div ref={boxRef} className="pointer-events-auto w-full max-w-md">
            <Snackbar
              key={current.id}
              title={current.title}
              description={current.description}
              actionLabel={current.action?.label}
              onAction={
                current.action
                  ? () => {
                      current.action?.onClick();
                      dismiss(current.id);
                    }
                  : undefined
              }
              onClose={() => dismiss(current.id)}
              onPressChange={onPressChange}
            />
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

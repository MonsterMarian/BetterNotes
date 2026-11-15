"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "./cn";
import { Button } from "./button";
import { useLayer, useMounted, usePresence } from "./layer";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** sheet = zdola s úchytem, center = potvrzení, fullscreen = celá obrazovka. */
  variant?: "sheet" | "center" | "fullscreen";
}

/** Tažení úchytu dolů: o kolik px nebo jak rychle (px/ms) se list zavře. */
const DRAG_CLOSE_PX = 96;
const DRAG_CLOSE_VELOCITY = 0.5;

/** Napřed viditelné pole formuláře, teprve pak tlačítko - jinak by fokus sebral křížek. */
function firstFocusable(panel: HTMLElement): HTMLElement | null {
  const visible = (el: HTMLElement) => el.getClientRects().length > 0;
  const fields = panel.querySelectorAll<HTMLElement>(
    "input:not([type='hidden']):not(:disabled), select:not(:disabled), textarea:not(:disabled)",
  );
  const field = Array.from(fields).find(visible);
  if (field) return field;
  const buttons = panel.querySelectorAll<HTMLElement>("button:not(:disabled), [href]");
  return Array.from(buttons).find(visible) ?? null;
}

/**
 * Dialog bez externích závislostí ve třech podobách M3. Zpět i Escape zavřou
 * jen ten nejvýš (I18), zavřený ještě odjede, než zmizí z DOM.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  variant = "sheet",
}: DialogProps) {
  const mounted = useMounted();
  const present = usePresence(open);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ y0: number; y: number; t: number; v: number } | null>(null);
  const [scrolled, setScrolled] = React.useState(false);
  const titleId = React.useId();
  const descId = React.useId();

  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  useLayer(open, close);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (panel) firstFocusable(panel)?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      // Fokus zpátky tam, odkud dialog přišel - pokud tam ještě něco je.
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (!mounted || !present) return null;

  const state = open ? "open" : "closed";
  const sheet = variant === "sheet";

  const dragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { y0: e.clientY, y: e.clientY, t: e.timeStamp, v: 0 };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ukazatel už mezitím zmizel
    }
    if (panelRef.current) panelRef.current.style.transition = "none";
  };

  const dragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dt = e.timeStamp - d.t;
    if (dt > 0) d.v = (e.clientY - d.y) / dt;
    d.y = e.clientY;
    d.t = e.timeStamp;
    if (panelRef.current) {
      panelRef.current.style.transform = `translateY(${Math.max(0, d.y - d.y0)}px)`;
    }
  };

  // Uvolnění vrátí styl CSS: buď odjede dolů (closed), nebo pružinou zpět.
  const dragEnd = (cancelled: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (panelRef.current) {
      panelRef.current.style.transition = "";
      panelRef.current.style.transform = "";
    }
    if (!cancelled && (d.y - d.y0 > DRAG_CLOSE_PX || d.v > DRAG_CLOSE_VELOCITY)) close();
  };

  const heading =
    variant === "center" ? (
      <h2 id={titleId} className="text-headline-sm text-on-surface">
        {title}
      </h2>
    ) : (
      <h2 id={titleId} className="truncate text-title-lg text-on-surface">
        {title}
      </h2>
    );

  const desc = description ? (
    <p id={descId} className="text-body-md text-on-surface-variant">
      {description}
    </p>
  ) : null;

  const actions = footer ? (
    <div className="mt-6 flex flex-wrap items-center justify-end gap-2">{footer}</div>
  ) : null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex",
        // Odjíždějící dialog už nesmí brát dotyky obsahu pod sebou.
        !open && "pointer-events-none",
        sheet && "items-end justify-center",
        variant === "center" && "items-center justify-center p-6",
      )}
    >
      {variant !== "fullscreen" ? (
        <div data-state={state} className="dlg-scrim absolute inset-0" onClick={close} aria-hidden />
      ) : null}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        data-state={state}
        data-variant={variant}
        className={cn(
          "dlg-panel relative flex w-full flex-col text-on-surface",
          sheet &&
            "max-h-[90dvh] max-w-[640px] rounded-t-2xl border-t border-white/10 bg-surface-low shadow-[var(--shadow-2)]",
          variant === "center" &&
            "max-h-[85dvh] min-w-[280px] max-w-[560px] rounded-2xl border border-white/10 bg-surface-low p-6 shadow-[var(--shadow-2)]",
          variant === "fullscreen" && "h-dvh bg-surface",
          className,
        )}
      >
        {sheet ? (
          <>
            <div
              className="flex shrink-0 cursor-grab touch-none flex-col active:cursor-grabbing"
              onPointerDown={dragStart}
              onPointerMove={dragMove}
              onPointerUp={() => dragEnd(false)}
              onPointerCancel={() => dragEnd(true)}
            >
              <div className="flex justify-center pb-3 pt-4" aria-hidden>
                <span className="h-1 w-8 rounded-full bg-on-surface-variant/40" />
              </div>
              <div className="flex flex-col gap-1 px-6 pb-4">
                {heading}
                {desc}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-[calc(24px+var(--mw-safe-bottom))]">
              {children}
              {actions}
            </div>
          </>
        ) : null}

        {variant === "center" ? (
          <>
            <div className="flex shrink-0 flex-col gap-4">
              {heading}
              {desc}
            </div>
            {children ? (
              <div className="-mx-6 mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6">
                {children}
              </div>
            ) : null}
            {actions}
          </>
        ) : null}

        {variant === "fullscreen" ? (
          <>
            <div
              className={cn(
                "mw-safe-top mw-safe-x shrink-0 bg-surface transition-colors duration-200",
                scrolled && "bar-scrolled",
              )}
            >
              <div className="flex h-16 items-center gap-1 px-1">
                <Button variant="ghost" size="icon-lg" aria-label="Zavřít" onClick={close}>
                  <X />
                </Button>
                {heading}
              </div>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(24px+var(--mw-safe-bottom))]"
              onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}
            >
              {desc ? <div className="pb-4">{desc}</div> : null}
              {children}
              {actions}
            </div>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useBackLayer } from "@/components/providers/use-app-back";
import { cn } from "@/lib/utils";
import { useImageSrc } from "./note-thumb";

/**
 * Fotka přes celou obrazovku.
 *
 * Důvod, proč to vzniklo: na screenshotu nasdíleném do poznámky nejde
 * v čtverečku 14 px nic přečíst. Fotka se proto vejde celá do okna
 * (`object-contain`), ne že se ořízne na čtverec.
 *
 * Zavírá se klepnutím mimo, křížkem, klávesou Escape a tlačítkem Zpět
 * i systémovým gestem - to poslední přes `useBackLayer`, aby Zpět zavřelo
 * jen lupu a ne rovnou celý detail poznámky.
 */
export function ImageLightbox({
  names,
  index,
  onIndexChange,
  onClose,
}: {
  names: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  useBackLayer(true, onClose);

  const count = names.length;
  const go = React.useCallback(
    (delta: number) => {
      if (count < 2) return;
      onIndexChange((index + delta + count) % count);
    },
    [count, index, onIndexChange],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [go, onClose]);

  /* Přejíždění mezi fotkami. Rozhoduje vodorovná vzdálenost, ne rychlost:
     prst na fotce se hýbe pomalu a švihnutí by se nepoznalo. */
  const start = React.useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const from = start.current;
    start.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  };

  if (!mounted || count === 0) return null;

  const name = names[Math.min(Math.max(index, 0), count - 1)];

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95" role="dialog" aria-modal="true">
      {/* viewportFit=cover: bez safe-area by křížek ležel pod stavovou lištou nebo výřezem. */}
      <div className="flex items-center gap-2 pb-3 pl-[calc(12px+var(--mw-safe-left))] pr-[calc(12px+var(--mw-safe-right))] pt-[calc(12px+var(--mw-safe-top))] text-white">
        <span className="tabular text-label-lg opacity-70">
          {count > 1 ? `${index + 1} / ${count}` : ""}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zavřít fotku"
          className="ml-auto grid size-12 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Plocha kolem fotky zavírá - stejně jako u dialogu. */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-2"
        onClick={onClose}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <FullImage name={name} />

        {count > 1 ? (
          <>
            <Arrow side="left" onClick={() => go(-1)} />
            <Arrow side="right" onClick={() => go(1)} />
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div className="flex justify-center gap-0 pb-[calc(1rem+var(--mw-safe-bottom))] pt-2">
          {/* Tečka je malá, zásah ne: size-8 si na dotyku roztáhne 44px hack v globals.css. */}
          {names.map((n, i) => (
            <button
              key={n}
              type="button"
              aria-label={`Fotka ${i + 1}`}
              aria-current={i === index || undefined}
              onClick={() => onIndexChange(i)}
              className="grid size-8 place-items-center"
            >
              <span
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  i === index ? "bg-white" : "bg-white/35",
                )}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Předchozí fotka" : "Další fotka"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20",
        side === "left" ? "left-2" : "right-2",
      )}
    >
      <Icon className="size-6" />
    </button>
  );
}

/** Fotka v plné velikosti - adresa se bere stejně jako u náhledu. */
function FullImage({ name }: { name: string }) {
  const { src, missing, onError } = useImageSrc(name);

  if (missing) {
    return <p className="text-body-md text-white/70">Tahle fotka už v telefonu není.</p>;
  }
  if (!src) {
    return <div className="size-16 animate-pulse rounded-lg bg-white/10" />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Fotka v poznámce"
      onError={onError}
      onClick={(e) => e.stopPropagation()}
      className="anim-fade max-h-full max-w-full object-contain"
    />
  );
}

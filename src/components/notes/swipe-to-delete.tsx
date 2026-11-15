"use client";

import * as React from "react";
import { Archive, Trash2 } from "lucide-react";
import { haptic } from "@/lib/native";
import { cn } from "@/lib/utils";

/** Jaký kus šířky karty musí prst ujet, aby se akce po puštění provedla. */
const THRESHOLD = 0.4;
/** Odlet karty z obrazovky - pak teprve akce, ať ji prst „odhodí". */
const FLY_MS = 200;

/**
 * Tah karty do stran: vlevo do koše, vpravo do archivu (v archivu zpět).
 *
 * Tah rozhoduje osa hned v prvních pixelech: vodorovný přetah patří kartě,
 * svislý nechá seznam normálně rolovat, aby swipe nekradl posouvání.
 * Potvrzovací dialog tu není - akce jde vrátit tlačítkem „Zpět" v liště,
 * kterou ukáže volající přes `useUndo`.
 *
 * Jede na pointer events, ne na touch: stejný kód pak funguje prstem
 * v telefonu i myší na počítači, kde se appka ladí přes `npm run dev`.
 * Svislé rolování drží `touch-action: pan-y` - prohlížeč si posouvání
 * vezme sám a my dostaneme jen vodorovné tahy.
 *
 * Bez obou handlerů (výběr více poznámek) se karta netáhne vůbec.
 */
export function SwipeToDelete({
  onSwipeLeft,
  onSwipeRight,
  leftLabel,
  rightLabel,
  rightIcon,
  className,
  children,
}: {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftLabel: string;
  rightLabel: string;
  /** V archivu míří tah vpravo zpět, ne do archivu - jiná ikona. */
  rightIcon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [dx, setDx] = React.useState(0);
  const [phase, setPhase] = React.useState<"idle" | "drag" | "fly">("idle");
  // Strana odkrytého podkladu. Drží se i během návratu karty na místo,
  // jinak by podklad zmizel dřív, než ho karta zase zakryje.
  const [side, setSide] = React.useState<-1 | 1 | null>(null);
  const [armed, setArmed] = React.useState(false);

  // Pohyb jde přes ref: `pointerup` může přijít dřív, než React překreslí
  // poslední `pointermove`, a stav z renderu by byl o krok pozadu.
  const drag = React.useRef<{ x: number; y: number; width: number; dx: number } | null>(null);
  // null = ještě nerozhodnuto, "x" = vodorovný tah, "y" = svislý (roluje se).
  const axis = React.useRef<"x" | "y" | null>(null);
  // Ujetá karta nesmí po puštění otevřít detail - klik přijde až po pointerup.
  const swiped = React.useRef(false);

  const enabled = Boolean(onSwipeLeft || onSwipeRight);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Jen hlavní tlačítko myši; pravé patří kontextové nabídce.
    if (!enabled || phase === "fly" || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag.current = { x: e.clientX, y: e.clientY, width: e.currentTarget.offsetWidth || 1, dx: 0 };
    axis.current = null;
    swiped.current = false;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;

    if (axis.current === null) {
      if (Math.abs(mx) > 8 || Math.abs(my) > 8) axis.current = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      else return;
    }
    if (axis.current !== "x") return;

    // Od téhle chvíle patří tah nám, ne prohlížeči (výběr textu, drag odkazu).
    if (e.pointerType !== "touch") e.preventDefault();
    if (!swiped.current) {
      // Zachytává se na cíl, ne na obal: události pak dál bublají přes kartu,
      // takže její dlouhý stisk uvidí pohyb prstu a sám se zruší.
      // Ukazatel už mezitím mohl zmizet (přerušený tah), pak není co chytat.
      try {
        (e.target as Element).setPointerCapture(e.pointerId);
      } catch {
        /* nevadí - tah dojede bez zachycení */
      }
      swiped.current = true;
      setPhase("drag");
    }

    // Směr bez akce se nepustí - karta by slibovala něco, co neudělá.
    const next = Math.max(onSwipeLeft ? -d.width : 0, Math.min(onSwipeRight ? d.width : 0, mx));
    const wasArmed = Math.abs(d.dx) > d.width * THRESHOLD;
    const isArmed = Math.abs(next) > d.width * THRESHOLD;
    if (isArmed && !wasArmed) haptic("tick");
    d.dx = next;
    setArmed(isArmed);
    setDx(next);
    if (next !== 0) setSide(next < 0 ? -1 : 1);
  };

  const finish = (commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    axis.current = null;
    if (!d || !swiped.current) return;
    const action = d.dx < 0 ? onSwipeLeft : onSwipeRight;
    if (!commit || !action || Math.abs(d.dx) <= d.width * THRESHOLD) {
      setPhase("idle");
      setArmed(false);
      setDx(0);
      // Karta na nule se nikam nevrací a konec přechodu by nepřišel.
      if (d.dx === 0) setSide(null);
      return;
    }
    setPhase("fly");
    setDx(Math.sign(d.dx) * (d.width + 32));
    window.setTimeout(() => {
      action();
      // Karta většinou zmizí ze seznamu; když ne, vrátí se na místo.
      setPhase("idle");
      setArmed(false);
      setDx(0);
    }, FLY_MS);
  };

  // Karta je odkaz: po tažení by se jinak ještě otevřel detail.
  const onClickCapture = (e: React.MouseEvent) => {
    if (!swiped.current) return;
    e.preventDefault();
    e.stopPropagation();
    swiped.current = false;
  };

  const transition =
    phase === "drag"
      ? "none"
      : phase === "fly"
        ? `transform ${FLY_MS}ms var(--ease-emphasized-accel)`
        : "transform var(--dur-spring-fast) var(--spring-fast)";

  return (
    <div className={cn("relative overflow-hidden rounded-lg-plus", className)}>
      {side !== null ? (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center gap-2 px-6",
            side < 0
              ? "flex-row-reverse bg-error-container text-on-error-container"
              : "bg-primary-container text-on-primary-container",
          )}
        >
          <span
            className="[&_svg]:size-6"
            style={{
              transform: `scale(${armed ? 1.1 : 0.8})`,
              transition: "transform var(--dur-spring-fast) var(--spring-fast)",
            }}
          >
            {side < 0 ? <Trash2 /> : (rightIcon ?? <Archive />)}
          </span>
          <span className="text-label-lg">{side < 0 ? leftLabel : rightLabel}</span>
        </div>
      ) : null}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => finish(true)}
        onPointerCancel={() => finish(false)}
        onClickCapture={onClickCapture}
        onDragStart={(e) => e.preventDefault()}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === "transform" && phase === "idle") setSide(null);
        }}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: "pan-y", transition }}
        className={cn("relative", phase === "drag" && "select-none")}
      >
        {children}
      </div>
    </div>
  );
}

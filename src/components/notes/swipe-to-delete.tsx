"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useStore } from "@/components/providers/store-provider";
import { useToast } from "@/components/providers/toast-provider";
import { noteTitle } from "@/lib/notes";
import { tapFeedback } from "@/lib/native";
import { cn } from "@/lib/utils";
import type { Note } from "@/lib/types";

/** Jak daleko musí karta ujet, aby se nabídlo smazání. */
const TRIGGER = 72;

/**
 * Smazání poznámky tažením vlevo ze seznamu - bez otvírání detailu.
 *
 * Tah rozhoduje osa hned v prvních pixelech: vodorovný přetah otvírá
 * mazání, svislý nechá seznam normálně rolovat, aby swipe nekradl
 * posouvání. Potvrzení jde přes dialog - prst na autobuse táhne vlevo
 * i omylem a koš je návratný jen ze zálohy.
 *
 * Jede na pointer events, ne na touch: stejný kód pak funguje prstem
 * v telefonu i myší na počítači, kde se appka ladí přes `npm run dev`.
 * Svislé rolování drží `touch-action: pan-y` - prohlížeč si posouvání
 * vezme sám a my dostaneme jen vodorovné tahy.
 */
export function SwipeToDelete({ note, children }: { note: Note; children: React.ReactNode }) {
  const { trash } = useStore();
  const { toast } = useToast();
  const [dx, setDx] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);

  const start = React.useRef<{ x: number; y: number } | null>(null);
  // null = ještě nerozhodnuto, "x" = vodorovný tah, "y" = svislý (roluje se).
  const axis = React.useRef<"x" | "y" | null>(null);
  // Ujetá karta nesmí po puštění otevřít detail - klik přijde až po pointerup.
  const swiped = React.useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    // Jen hlavní tlačítko myši; pravé patří kontextové nabídce.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = null;
    swiped.current = false;
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const mx = e.clientX - start.current.x;
    const my = e.clientY - start.current.y;

    if (axis.current === null) {
      if (Math.abs(mx) > 8 || Math.abs(my) > 8) axis.current = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      else return;
    }
    if (axis.current !== "x") return;

    // Od téhle chvíle patří tah nám, ne prohlížeči (výběr textu, drag odkazu).
    if (e.pointerType !== "touch") e.preventDefault();
    // Bez zachycení by tah myší skončil, jakmile kurzor sjede z karty.
    // Ukazatel už mezitím mohl zmizet (přerušený tah), pak není co chytat.
    if (!swiped.current) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* nevadí - tah dojede bez zachycení */
      }
    }
    swiped.current = true;

    // Tažení vlevo odkrývá koš, vpravo se brzy zastaví - pryč z karty.
    setDx(Math.max(Math.min(mx, 0), -TRIGGER - 24));
  };

  const onPointerUp = () => {
    if (axis.current === "x" && dx < -TRIGGER) {
      void tapFeedback();
      setConfirm(true);
    }
    setDx(0);
    setDragging(false);
    start.current = null;
    axis.current = null;
  };

  // Karta je odkaz: po tažení by se jinak ještě otevřel detail.
  const onClickCapture = (e: React.MouseEvent) => {
    if (!swiped.current) return;
    e.preventDefault();
    e.stopPropagation();
    swiped.current = false;
  };

  const onTrash = () => {
    trash(note.id);
    setConfirm(false);
    toast({ tone: "info", title: "Poznámka v koši", description: noteTitle(note) });
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-xl">
        {/* Koš pod kartou - vidět, jakmile karta ujede vlevo. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-destructive text-destructive-foreground">
          <Trash2 className="size-5" />
        </div>
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClickCapture={onClickCapture}
          onDragStart={(e) => e.preventDefault()}
          style={{ transform: `translateX(${dx}px)`, touchAction: "pan-y" }}
          className={cn(
            "relative bg-card",
            !dragging && "transition-transform duration-200",
            dragging && dx !== 0 && "select-none",
          )}
        >
          {children}
        </div>
      </div>

      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Smazat poznámku?"
        description={noteTitle(note)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void tapFeedback();
                onTrash();
              }}
            >
              Smazat
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Poznámka se přesune do koše, kde ji jde obnovit.
        </p>
      </Dialog>
    </>
  );
}

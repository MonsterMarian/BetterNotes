"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { NOTE_TONES, type NoteTone } from "@/lib/types";

/**
 * Výběr barvy poznámky. Kolečka mají pozadí i lem přímo z tónu karty
 * (`data-tone`), takže vzorek vypadá přesně jako výsledek. Vybraný se
 * zhranatí a dostane fajfku - poznat jde i bez rozlišování barev.
 */
export function TonePicker({ value, onChange }: { value: NoteTone; onChange: (tone: NoteTone) => void }) {
  return (
    <div role="group" aria-label="Barva" className="flex flex-wrap justify-center gap-2">
      {NOTE_TONES.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            data-tone={t.id}
            aria-label={t.label}
            aria-pressed={selected}
            title={t.label}
            onClick={() => onChange(t.id)}
            className={
              "press-morph grid size-11 place-items-center border-2 text-on-surface " +
              (selected ? "rounded-md" : "rounded-[24px]")
            }
            style={{ background: "var(--note-bg)", borderColor: "var(--note-accent)" }}
          >
            {selected ? (
              <Check className="anim-pop size-6" strokeWidth={2.5} aria-hidden />
            ) : t.id === "none" ? (
              // Bez barvy = přeškrtnuté kolečko, ne jen další odstín béžové.
              <span aria-hidden className="h-0.5 w-7 -rotate-45 rounded-full bg-outline" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import * as React from "react";
import { Chip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { TonePicker } from "@/components/ui/tone-picker";
import { QUICK_FILTERS, type QuickFilter } from "@/lib/notes";
import { haptic } from "@/lib/native";
import type { NoteTone } from "@/lib/types";

/** Aktivní je vždycky jen jeden čip; výchozí stav je „Vše". */
export interface HomeFilter {
  quick: QuickFilter;
  tone: NoteTone | null;
  tag: string | null;
}

export const ALL_FILTER: HomeFilter = { quick: "all", tone: null, tag: null };

export function isFiltered(f: HomeFilter): boolean {
  return f.quick !== "all" || f.tone !== null || f.tag !== null;
}

/**
 * Rychlé filtry nad seznamem: pevné čipy, barva a štítky. Ťuknutí na
 * aktivní čip vrací na „Vše" - druhý ovládací prvek na rušení by tu jen
 * zabíral místo.
 */
export function FilterChips({
  value,
  onChange,
  tags,
}: {
  value: HomeFilter;
  onChange: (f: HomeFilter) => void;
  tags: string[];
}) {
  const [toneOpen, setToneOpen] = React.useState(false);

  const pick = (next: HomeFilter, active: boolean) => {
    haptic("select");
    onChange(active ? ALL_FILTER : next);
  };

  return (
    <>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1.5">
        {QUICK_FILTERS.map((q) => {
          const active = !isFiltered(value) ? q.id === "all" : value.quick === q.id && q.id !== "all";
          return (
            <Chip
              key={q.id}
              selected={active}
              onClick={() => pick({ ...ALL_FILTER, quick: q.id }, active && q.id !== "all")}
              className="shrink-0"
            >
              {q.label}
            </Chip>
          );
        })}
        <Chip
          selected={value.tone !== null}
          onClick={() => {
            if (value.tone !== null) pick(ALL_FILTER, true);
            else setToneOpen(true);
          }}
          icon={
            value.tone !== null ? (
              <span data-tone={value.tone} className="block size-3 rounded-full bg-[var(--note-accent)]" />
            ) : undefined
          }
          className="shrink-0"
        >
          Barva
        </Chip>
        {tags.map((tag) => {
          const active = value.tag === tag;
          return (
            <Chip
              key={tag}
              selected={active}
              onClick={() => pick({ ...ALL_FILTER, tag }, active)}
              className="shrink-0"
            >
              #{tag}
            </Chip>
          );
        })}
      </div>

      <Dialog open={toneOpen} onOpenChange={setToneOpen} title="Filtrovat podle barvy">
        <TonePicker
          value={value.tone ?? "none"}
          onChange={(tone) => {
            setToneOpen(false);
            pick({ ...ALL_FILTER, tone }, false);
          }}
        />
      </Dialog>
    </>
  );
}

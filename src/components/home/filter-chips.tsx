"use client";

import * as React from "react";
import { Palette, Plus, SlidersHorizontal } from "lucide-react";
import { ActionList } from "@/components/ui/action-list";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TonePicker } from "@/components/ui/tone-picker";
import { setPrefs, usePrefs } from "@/components/providers/use-prefs";
import { QUICK_FILTERS, normalizeTag, type QuickFilter } from "@/lib/notes";
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

/** Filtry, které nejsou kategorie. Sedí za jedním čipem, ať kategorie nemusí ustupovat doprava. */
const MORE_FILTERS = QUICK_FILTERS.filter((q) => q.id !== "all" && q.id !== "untagged");

/**
 * Kategorie nad seznamem (štítky poznámek) jako v systémových Poznámkách:
 * Vše, kategorie, Nezařazené. Čipy se zalamují do řádků místo posouvání
 * do boku - všechno je vidět bez hledání. Ťuknutí na aktivní čip vrací na „Vše".
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
  const { categories } = usePrefs();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [toneOpen, setToneOpen] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  const pick = (next: HomeFilter, active: boolean) => {
    haptic("select");
    onChange(active ? ALL_FILTER : next);
  };

  const createCategory = () => {
    const tag = normalizeTag(draft);
    if (!tag) return;
    if (!categories.includes(tag)) setPrefs({ categories: [...categories, tag] });
    setDraft("");
    setNewOpen(false);
    pick({ ...ALL_FILTER, tag }, false);
  };

  const untagged = value.quick === "untagged";
  const moreActive = value.tone !== null || (value.quick !== "all" && !untagged);
  const moreLabel = value.tone !== null ? "Barva" : MORE_FILTERS.find((q) => q.id === value.quick)?.label;

  return (
    <>
      <div className="flex flex-wrap gap-2 py-1.5">
        <Chip selected={!isFiltered(value)} onClick={() => pick(ALL_FILTER, false)}>
          Vše
        </Chip>
        {tags.map((tag) => {
          const active = value.tag === tag;
          return (
            <Chip key={tag} selected={active} onClick={() => pick({ ...ALL_FILTER, tag }, active)}>
              {tag}
            </Chip>
          );
        })}
        {tags.length > 0 ? (
          <Chip selected={untagged} onClick={() => pick({ ...ALL_FILTER, quick: "untagged" }, untagged)}>
            Nezařazené
          </Chip>
        ) : null}
        <Chip icon={<Plus />} onClick={() => setNewOpen(true)}>
          Kategorie
        </Chip>
        <Chip
          selected={moreActive}
          icon={<SlidersHorizontal />}
          onClick={() => (moreActive ? pick(ALL_FILTER, true) : setMoreOpen(true))}
        >
          {moreActive ? moreLabel : "Filtry"}
        </Chip>
      </div>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen} title="Filtry">
        <ActionList
          items={[
            ...MORE_FILTERS.map((q) => ({
              id: q.id,
              label: q.label,
              onSelect: () => {
                setMoreOpen(false);
                pick({ ...ALL_FILTER, quick: q.id }, false);
              },
            })),
            {
              id: "tone",
              label: "Barva",
              icon: <Palette />,
              // Další list až po zavření tohohle, ať Zpět nemusí zavírat dva naráz.
              onSelect: () => {
                setMoreOpen(false);
                setToneOpen(true);
              },
            },
          ]}
        />
      </Dialog>

      <Dialog open={toneOpen} onOpenChange={setToneOpen} title="Filtrovat podle barvy">
        <TonePicker
          value={value.tone ?? "none"}
          onChange={(tone) => {
            setToneOpen(false);
            pick({ ...ALL_FILTER, tone }, false);
          }}
        />
      </Dialog>

      <Dialog
        open={newOpen}
        onOpenChange={setNewOpen}
        title="Nová kategorie"
        description="Poznámku do ní zařadíš ikonou složky v poznámce. Nová poznámka založená v kategorii do ní patří sama."
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Zrušit
            </Button>
            <Button disabled={!normalizeTag(draft)} onClick={createCategory}>
              Přidat
            </Button>
          </>
        }
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            createCategory();
          }}
          placeholder="Název kategorie"
          aria-label="Název kategorie"
          enterKeyHint="done"
          autoFocus
        />
      </Dialog>
    </>
  );
}

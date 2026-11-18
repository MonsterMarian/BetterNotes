"use client";

import * as React from "react";
import { Chip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useStore } from "@/components/providers/store-provider";
import { usePrefs } from "@/components/providers/use-prefs";
import { haptic } from "@/lib/native";
import { normalizeTag, noteTags, tagCounts } from "@/lib/notes";
import type { Note } from "@/lib/types";

/** Sheet „Kategorie" (štítky poznámky): přidat, odebrat, vzít jednu z už založených. */
export function TagsSheet({
  note,
  open,
  onOpenChange,
}: {
  note: Note;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { state, addTag, removeTag } = useStore();
  const { categories } = usePrefs();
  const [draft, setDraft] = React.useState("");

  const current = noteTags(note);
  // Používané + ručně založené kategorie, ve kterých zatím nic není.
  const used = open
    ? [...new Set([...tagCounts(state).map((t) => t.tag), ...categories])].filter((t) => !current.includes(t))
    : [];

  const commit = () => {
    const tag = normalizeTag(draft);
    setDraft("");
    if (!tag) return;
    addTag(note.id, tag);
    haptic("select");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Kategorie">
      <div className="flex flex-col gap-4">
        {current.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {current.map((tag) => (
              <Chip
                key={tag}
                selected
                onRemove={note.tags.includes(tag) ? () => removeTag(note.id, tag) : undefined}
              >
                #{tag}
              </Chip>
            ))}
          </div>
        ) : null}

        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="Nová kategorie"
          aria-label="Nová kategorie"
          enterKeyHint="done"
          autoCapitalize="off"
        />

        {used.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-title-sm text-on-surface-variant">Zařadit do</h3>
            <div className="flex flex-wrap gap-2">
              {used.map((tag) => (
                <Chip
                  key={tag}
                  onClick={() => {
                    addTag(note.id, tag);
                    haptic("select");
                  }}
                >
                  #{tag}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}

        <p className="text-body-sm text-on-surface-variant">Kategorii přidáš i přímo v textu: #nakup</p>
      </div>
    </Dialog>
  );
}

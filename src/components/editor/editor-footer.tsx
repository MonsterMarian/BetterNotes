"use client";

import * as React from "react";
import { Chip } from "@/components/ui/chip";
import { taskStats } from "@/lib/checklist";
import { formatStamp } from "@/lib/date";
import { noteTags } from "@/lib/notes";
import { formatStats, textStats } from "@/lib/text-stats";
import type { Note } from "@/lib/types";

/**
 * Pata editoru: kdy se naposled psalo, kolik toho je a štítky.
 * Štítky z textu (`#nakup`) se odebírají v textu, proto nemají křížek.
 */
export function EditorFooter({ note, onRemoveTag }: { note: Note; onRemoveTag: (tag: string) => void }) {
  const stats = React.useMemo(() => formatStats(textStats(note.text)), [note.text]);
  const tasks = React.useMemo(() => taskStats(note.text), [note.text]);
  const tags = noteTags(note);

  return (
    // mt-auto: u krátké poznámky sedí pata dole, ne uprostřed prázdné stránky.
    <footer className="mt-auto flex flex-col gap-3 pt-6">
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Chip key={tag} onRemove={note.tags.includes(tag) ? () => onRemoveTag(tag) : undefined}>
              #{tag}
            </Chip>
          ))}
        </div>
      ) : null}
      <p className="tabular text-label-sm text-on-surface-variant">
        Upraveno {formatStamp(note.updatedAt)} · {stats}
        {tasks.total > 0 ? ` · ${tasks.done}/${tasks.total} hotovo` : ""}
      </p>
    </footer>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, Check, ListChecks, Pin } from "lucide-react";
import { NoteThumb } from "./note-thumb";
import { CardPreview, Marked } from "@/components/home/card-preview";
import { noteTags, noteTitle } from "@/lib/notes";
import { taskStats } from "@/lib/checklist";
import { formatStamp } from "@/lib/date";
import { haptic } from "@/lib/native";
import { useLongPress } from "@/lib/use-long-press";
import { cn } from "@/lib/utils";
import type { Note } from "@/lib/types";

/** Kolik náhledových fotek se vejde do karty v seznamu, než přijde „+N". */
const LIST_THUMBS = 3;

/**
 * Poznámka v seznamu.
 *
 * Celá karta je odkaz - míří se na ni palcem za jízdy autobusem, takže cíl
 * musí být co největší. Dlouhý stisk spouští výběr více poznámek; ve výběru
 * klepnutí jen přepíná, kam karta patří.
 *
 * Prvek je pořád tentýž `<a>`, i ve výběru: kdyby se pod prstem vyměnil
 * za tlačítko, puštění po dlouhém stisku by kliklo do nového prvku a právě
 * vybranou kartu hned zase odznačilo.
 */
export function NoteCard({
  note,
  dense = false,
  query = "",
  selectionMode = false,
  selected = false,
  onToggle,
  onLongPress,
}: {
  note: Note;
  /** Mřížka: fotka přes celou šířku nahoře a delší náhled. */
  dense?: boolean;
  query?: string;
  selectionMode?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  onLongPress?: () => void;
}) {
  const title = noteTitle(note);
  const tags = noteTags(note);
  const tasks = taskStats(note.text);
  const extraThumbs = note.images.length - (dense ? 1 : LIST_THUMBS);

  const lp = useLongPress({
    onLongPress: () => {
      haptic("press");
      onLongPress?.();
    },
    onClick: (e) => {
      if (!selectionMode) return;
      e.preventDefault();
      haptic("select");
      onToggle?.();
    },
  });

  return (
    <Link
      href={`/note/?id=${encodeURIComponent(note.id)}`}
      data-tone={note.tone}
      draggable={false}
      role={selectionMode ? "checkbox" : undefined}
      aria-checked={selectionMode ? selected : undefined}
      {...lp}
      style={{
        transition:
          "transform var(--dur-spring-fast) var(--spring-fast), scale var(--dur-spring-fast) var(--spring-fast), border-radius var(--dur-spring-fast) var(--spring-fast), opacity var(--dur-effects) var(--effects)",
      }}
      className={cn(
        "note-surface press-morph relative flex flex-col gap-2 overflow-hidden border border-white/10 p-4 text-left [-webkit-touch-callout:none]",
        selectionMode && selected ? "scale-[.96] rounded-2xl border-primary" : "rounded-2xl",
        selectionMode && !selected && "opacity-60",
      )}
    >
      {dense && note.images.length > 0 ? (
        <div className="relative -mx-4 -mt-4 mb-1">
          <NoteThumb name={note.images[0]} className="aspect-[16/10] w-full rounded-none" />
          {extraThumbs > 0 ? (
            <span className="absolute bottom-2 right-2 rounded-full bg-inverse-surface/80 px-2 text-label-sm text-inverse-on-surface tabular">
              +{extraThumbs}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-title-md text-on-surface">
          <span className="line-clamp-2 break-words">
            {note.day ? <CalendarDays className="-mt-0.5 mr-1 inline size-4 text-[var(--note-accent)]" /> : null}
            <Marked text={title} query={query} />
          </span>
        </h3>
        {note.pinned && !selectionMode ? (
          <Pin aria-label="Připnuté" className="mt-1 size-3.5 shrink-0 fill-[var(--tertiary)] text-[var(--tertiary)]" />
        ) : null}
      </div>

      <CardPreview note={note} query={query} lines={dense ? 8 : 4} />

      {!dense && note.images.length > 0 ? (
        <div className="flex gap-2">
          {note.images.slice(0, LIST_THUMBS).map((name) => (
            <NoteThumb key={name} name={name} className="size-14 shrink-0 rounded-md" />
          ))}
          {extraThumbs > 0 ? (
            <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-on-surface/8 text-label-md text-on-surface-variant tabular">
              +{extraThumbs}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label-sm text-on-surface-variant tabular">
        <span>{formatStamp(note.updatedAt)}</span>
        {tasks.total > 0 ? (
          <span className="inline-flex items-center gap-1">
            <ListChecks className="size-3" />
            {tasks.done}/{tasks.total}
          </span>
        ) : null}
        {tags.slice(0, 2).map((tag) => (
          <span key={tag} className="max-w-28 truncate rounded-full bg-on-surface/8 px-2">
            #{tag}
          </span>
        ))}
        {tags.length > 2 ? <span>+{tags.length - 2}</span> : null}
        {note.archivedAt && query.trim() ? (
          <span className="rounded-full bg-on-surface/8 px-2">Archiv</span>
        ) : null}
      </div>

      {selectionMode && selected ? (
        <span className="anim-pop absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-highlight text-on-highlight">
          <Check className="size-4" />
        </span>
      ) : null}
    </Link>
  );
}

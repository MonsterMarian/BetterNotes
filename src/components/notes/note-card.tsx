"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, Check, ListChecks, Pin } from "lucide-react";
import { NoteThumb } from "./note-thumb";
import { CardPreview, Marked } from "@/components/home/card-preview";
import { noteExcerpt, noteTags, noteTitle } from "@/lib/notes";
import { searchSnippet } from "@/lib/search";
import { taskStats } from "@/lib/checklist";
import { formatStamp } from "@/lib/date";
import { haptic } from "@/lib/native";
import { useLongPress } from "@/lib/use-long-press";
import { cn } from "@/lib/utils";
import type { Note } from "@/lib/types";

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
  /** Mřížka: fotka přes celou šířku nahoře a delší náhled. Jinak kompaktní karta na dva řádky. */
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
  const extraThumbs = note.images.length - 1;

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
        "note-surface press-morph relative flex flex-col overflow-hidden border border-white/10 text-left [-webkit-touch-callout:none]",
        dense ? "gap-2 p-4" : "px-4 py-3",
        selectionMode && selected ? "scale-[.96] rounded-2xl border-primary" : "rounded-2xl",
        selectionMode && !selected && "opacity-60",
      )}
    >
      {dense ? (
        <>
          {note.images.length > 0 ? (
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

          <CardPreview note={note} query={query} lines={8} />

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
        </>
      ) : (
        <CompactBody note={note} title={title} query={query} tasks={tasks} pin={note.pinned && !selectionMode} />
      )}

      {selectionMode && selected ? (
        <span className="anim-pop absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-highlight text-on-highlight">
          <Check className="size-4" />
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Karta v seznamu na dva řádky jako v systémových Poznámkách: název s datem,
 * pod ním jeden řádek textu. Na obrazovku se vejde zhruba sedm poznámek.
 */
function CompactBody({
  note,
  title,
  query,
  tasks,
  pin,
}: {
  note: Note;
  title: string;
  query: string;
  tasks: { done: number; total: number };
  pin: boolean;
}) {
  const excerpt = query.trim() ? searchSnippet(note, query) : noteExcerpt(note);
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-title-md text-on-surface">
            {note.day ? <CalendarDays className="-mt-0.5 mr-1 inline size-4 text-[var(--note-accent)]" /> : null}
            <Marked text={title} query={query} />
          </h3>
          {pin ? <Pin aria-label="Připnuté" className="size-3.5 shrink-0 fill-[var(--tertiary)] text-[var(--tertiary)]" /> : null}
          <span className="shrink-0 text-label-sm text-on-surface-variant tabular">{formatStamp(note.updatedAt)}</span>
        </div>
        <div className="flex items-center gap-2 text-body-md text-on-surface-variant">
          <p className="min-w-0 flex-1 truncate">
            {excerpt ? <Marked text={excerpt} query={query} /> : <span className="opacity-60">Žádný text</span>}
          </p>
          {tasks.total > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-label-sm tabular">
              <ListChecks className="size-3" />
              {tasks.done}/{tasks.total}
            </span>
          ) : null}
          {note.archivedAt && query.trim() ? (
            <span className="shrink-0 rounded-full bg-on-surface/8 px-2 text-label-sm">Archiv</span>
          ) : null}
        </div>
      </div>
      {note.images.length > 0 ? <NoteThumb name={note.images[0]} className="size-11 shrink-0 rounded-md" /> : null}
    </div>
  );
}

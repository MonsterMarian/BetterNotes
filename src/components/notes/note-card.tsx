"use client";

import * as React from "react";
import Link from "next/link";
import { ImageIcon, Pin } from "lucide-react";
import { NoteThumb } from "./note-thumb";
import { noteExcerpt, noteTitle } from "@/lib/notes";
import { formatDateRelative } from "@/lib/date";
import { cn, plural } from "@/lib/utils";
import type { Note } from "@/lib/types";

/**
 * Poznámka v seznamu.
 *
 * Celá karta je odkaz - míří se na ni palcem za jízdy autobusem, takže cíl
 * musí být co největší. Připnutí a mazání sedí až v detailu; tlačítka
 * v kartě by se pod prstem pletla s otevřením.
 */
export function NoteCard({ note, dense = false }: { note: Note; dense?: boolean }) {
  const title = noteTitle(note);
  const excerpt = noteExcerpt(note, dense ? 90 : 160);
  // Razítko je ISO s časem, `formatDateRelative` čeká YYYY-MM-DD.
  const day = note.updatedAt.slice(0, 10);

  return (
    <Link
      href={`/note/?id=${encodeURIComponent(note.id)}`}
      data-tone={note.tone}
      className={cn(
        "note-stripe relative flex flex-col overflow-hidden rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-colors",
        "hover:bg-accent/40 active:bg-accent/60",
        // Karta v mřížce je vysoká jako celý řádek; datum a štítky pak sedí
        // na dně, ne uprostřed prázdna.
        dense && "h-full",
        note.tone !== "none" && "pl-5",
      )}
    >
      <div className="flex items-start gap-2">
        <h3 className={cn("min-w-0 flex-1 font-medium leading-snug", dense ? "text-sm" : "text-[0.95rem]")}>
          <span className="line-clamp-2 break-words">{title}</span>
        </h3>
        {note.pinned ? <Pin className="mt-0.5 size-3.5 shrink-0 fill-mark text-mark" /> : null}
      </div>

      {excerpt ? (
        <p
          className={cn(
            "mt-1 whitespace-pre-line break-words text-sm text-muted-foreground",
            dense ? "line-clamp-3" : "line-clamp-2",
          )}
        >
          {excerpt}
        </p>
      ) : null}

      {note.images.length > 0 ? (
        <div className="mt-3 flex gap-2">
          {note.images.slice(0, dense ? 1 : 3).map((name) => (
            <NoteThumb key={name} name={name} className="size-14 shrink-0" />
          ))}
          {note.images.length > (dense ? 1 : 3) ? (
            <div className="flex size-14 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-xs text-muted-foreground">
              +{note.images.length - (dense ? 1 : 3)}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground",
          dense && "mt-auto pt-3",
        )}
      >
        <span className="tabular">{formatDateRelative(day)}</span>
        {note.images.length > 0 ? (
          <span className="inline-flex items-center gap-1">
            <ImageIcon className="size-3" />
            {note.images.length} {plural(note.images.length, "fotka", "fotky", "fotek")}
          </span>
        ) : null}
        {note.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
            #{tag}
          </span>
        ))}
      </div>
    </Link>
  );
}

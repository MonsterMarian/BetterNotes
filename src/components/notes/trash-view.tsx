"use client";

import * as React from "react";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useStore } from "@/components/providers/store-provider";
import { useGoUp } from "@/components/providers/use-app-back";
import { noteExcerpt, noteTitle, trashedNotes } from "@/lib/notes";
import { formatDateRelative } from "@/lib/date";
import { plural } from "@/lib/utils";

/**
 * Koš. Poznámky se z appky nemažou rovnou - smazat rozepsanou myšlenku
 * jedním ťuknutím na telefonu je moc snadné. Vysypat se musí ručně, žádná
 * lhůta neběží: appka nemá na pozadí kdy uklízet a tichý úklid „po 30 dnech"
 * by pro uživatele byl neviditelný.
 */
export function TrashView() {
  const { state, hydrated, restore, purge, emptyTrash } = useStore();
  const goUp = useGoUp();
  const [confirmEmpty, setConfirmEmpty] = React.useState(false);

  const notes = React.useMemo(() => {
    return trashedNotes(state).sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
  }, [state]);

  if (!hydrated) return <div className="h-40 animate-pulse rounded-xl border bg-muted/40" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Zpět" onClick={() => goUp("/")}>
          <ArrowLeft />
        </Button>
        <h1 className="text-base font-semibold tracking-tight">Koš</h1>
        {notes.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-destructive"
            onClick={() => setConfirmEmpty(true)}
          >
            Vysypat
          </Button>
        ) : null}
      </div>

      {notes.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">
          Koš je prázdný.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notes.map((note) => (
            <div key={note.id} className="flex items-start gap-2 rounded-xl border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{noteTitle(note)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {noteExcerpt(note, 70) || "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  smazáno {formatDateRelative((note.deletedAt ?? "").slice(0, 10))}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Vrátit zpět"
                title="Vrátit zpět"
                onClick={() => restore(note.id)}
              >
                <RotateCcw />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Smazat natrvalo"
                title="Smazat natrvalo"
                onClick={() => purge(note.id)}
              >
                <Trash2 className="text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={confirmEmpty}
        onOpenChange={setConfirmEmpty}
        title="Vysypat koš?"
        description={`${notes.length} ${plural(notes.length, "poznámka zmizí", "poznámky zmizí", "poznámek zmizí")} i s fotkami. Tohle se vrátit nedá.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmEmpty(false)}>
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                emptyTrash();
                setConfirmEmpty(false);
              }}
            >
              <Trash2 />
              Vysypat
            </Button>
          </>
        }
      />
    </div>
  );
}

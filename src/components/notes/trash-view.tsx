"use client";

import * as React from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { TopBar, useScrolled } from "@/components/ui/top-bar";
import { useStore } from "@/components/providers/store-provider";
import { useGoUp } from "@/components/providers/use-app-back";
import { useUndo } from "@/components/providers/use-undo";
import { noteExcerpt, noteTitle, trashedNotes } from "@/lib/notes";
import { formatStamp } from "@/lib/date";
import { haptic } from "@/lib/native";
import { plural } from "@/lib/utils";
import type { Note } from "@/lib/types";

/**
 * Koš. Poznámky se z appky nemažou rovnou - smazat rozepsanou myšlenku
 * jedním ťuknutím na telefonu je moc snadné. Vysypat se musí ručně, žádná
 * lhůta neběží: appka nemá na pozadí kdy uklízet a tichý úklid „po 30 dnech"
 * by pro uživatele byl neviditelný.
 *
 * Potvrzení chtějí jen nevratné kroky; obnovení jde vrátit z lišty.
 */
export function TrashView() {
  const { state, hydrated, restore, purge, emptyTrash } = useStore();
  const goUp = useGoUp();
  const undo = useUndo();
  const scrolled = useScrolled();
  const [confirmEmpty, setConfirmEmpty] = React.useState(false);
  const [purging, setPurging] = React.useState<Note | null>(null);

  const notes = React.useMemo(
    () => trashedNotes(state).sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? "")),
    [state],
  );

  if (!hydrated) {
    return <div className="mw-safe-top mx-4 mt-20 h-40 animate-pulse rounded-lg-plus bg-surface-low" />;
  }

  return (
    <>
      <TopBar
        title="Koš"
        scrolled={scrolled}
        leading={
          <Button variant="ghost" size="icon" aria-label="Zpět" onClick={() => goUp("/")}>
            <ArrowLeft />
          </Button>
        }
        actions={
          notes.length > 0 ? (
            <Button variant="text" className="text-error" onClick={() => setConfirmEmpty(true)}>
              Vysypat koš
            </Button>
          ) : null
        }
      />

      <div className="mw-safe-x mw-pad-nav">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4">
          {notes.length === 0 ? (
            <EmptyState shape="circle" title="Koš je prázdný." description="Nic tu nehnije." />
          ) : (
            <>
              <p className="text-body-md text-on-surface-variant">Poznámky v koši zůstanou, dokud koš nevysypeš.</p>
              {notes.map((note) => (
                <div
                  key={note.id}
                  data-tone={note.tone}
                  className="note-surface flex flex-col gap-1 rounded-lg-plus p-4"
                >
                  <p className="truncate text-title-md">{noteTitle(note)}</p>
                  {noteExcerpt(note, 90) ? (
                    <p className="line-clamp-2 text-body-md text-on-surface-variant">{noteExcerpt(note, 90)}</p>
                  ) : null}
                  <p className="text-label-sm text-on-surface-variant tabular">
                    smazáno {formatStamp(note.deletedAt ?? note.updatedAt)}
                  </p>
                  <div className="mt-2 flex justify-end gap-2">
                    <Button variant="text" className="text-error" onClick={() => setPurging(note)}>
                      Smazat navždy
                    </Button>
                    <Button
                      variant="tonal"
                      onClick={() => undo({ message: "Obnoveno", ids: [note.id], run: () => restore(note.id) })}
                    >
                      <RotateCcw />
                      Obnovit
                    </Button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <Dialog
        open={purging !== null}
        onOpenChange={(open) => {
          if (!open) setPurging(null);
        }}
        variant="center"
        title="Smazat navždy?"
        description="Poznámku i její fotky už nepůjde vrátit."
        footer={
          <>
            <Button variant="text" onClick={() => setPurging(null)}>
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (purging) purge(purging.id);
                haptic("press");
                setPurging(null);
              }}
            >
              Smazat
            </Button>
          </>
        }
      />

      <Dialog
        open={confirmEmpty}
        onOpenChange={setConfirmEmpty}
        variant="center"
        title="Vysypat koš?"
        description={`${notes.length} ${plural(notes.length, "poznámka zmizí", "poznámky zmizí", "poznámek zmizí")} i s fotkami.`}
        footer={
          <>
            <Button variant="text" onClick={() => setConfirmEmpty(false)}>
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                emptyTrash();
                haptic("press");
                setConfirmEmpty(false);
              }}
            >
              Vysypat
            </Button>
          </>
        }
      />
    </>
  );
}

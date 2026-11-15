"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { ListSkeleton, NoteFeed, useSwipeActions } from "@/components/notes/notes-list";
import { NoteCard } from "@/components/notes/note-card";
import { SwipeToDelete } from "@/components/notes/swipe-to-delete";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TopBar, useScrolled } from "@/components/ui/top-bar";
import { useStore } from "@/components/providers/store-provider";
import { useGoUp } from "@/components/providers/use-app-back";
import { usePrefs } from "@/components/providers/use-prefs";
import { visibleNotes } from "@/lib/notes";

/**
 * Archiv: poznámky, které nemají překážet na hlavní obrazovce, ale smazat
 * se nemají. Tah vpravo je vrací zpět, vlevo posílá do koše.
 */
export default function ArchivePage() {
  const { state, hydrated } = useStore();
  const { view, order } = usePrefs();
  const goUp = useGoUp();
  const swipe = useSwipeActions();
  const scrolled = useScrolled();
  const notes = React.useMemo(() => visibleNotes(state, { scope: "archive", order }), [state, order]);

  if (!hydrated) return <ListSkeleton />;

  return (
    <>
      <TopBar
        title="Archiv"
        scrolled={scrolled}
        leading={
          <Button variant="ghost" size="icon" aria-label="Zpět" onClick={() => goUp("/")}>
            <ArrowLeft />
          </Button>
        }
      />
      <div className="mw-safe-x mw-pad-nav">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4">
          {notes.length === 0 ? (
            <EmptyState
              shape="clover"
              title="Archiv je prázdný."
              description="Sem odsouvej, co nechceš mít na očích, ale nechceš smazat."
            />
          ) : (
            <NoteFeed notes={notes} order={order}>
              {(note) => (
                <SwipeToDelete {...swipe(note)}>
                  <NoteCard note={note} dense={view === "grid"} />
                </SwipeToDelete>
              )}
            </NoteFeed>
          )}
        </div>
      </div>
    </>
  );
}

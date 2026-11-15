"use client";

import * as React from "react";
import { Archive, Palette, Pin, PinOff, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TonePicker } from "@/components/ui/tone-picker";
import { useStore } from "@/components/providers/store-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useUndo } from "@/components/providers/use-undo";
import { usePrefs } from "@/components/providers/use-prefs";
import { haptic } from "@/lib/native";
import { isSupabaseConfigured } from "@/lib/supabase";
import { sendAllNotes } from "@/lib/sync";
import { plural } from "@/lib/utils";
import type { Note } from "@/lib/types";

/**
 * Kontextová lišta výběru více poznámek. Leží přes horní lištu (ne místo ní),
 * takže se seznam pod ní při vstupu do výběru nepohne.
 *
 * Po každé akci se výběr ruší - výběr, který po smazání zůstane viset,
 * svádí k druhému omylu.
 */
export function SelectionBar({ notes, onClear }: { notes: Note[]; onClear: () => void }) {
  const { updateMany, archiveMany, trashMany, trash } = useStore();
  const { trashAfterSync } = usePrefs();
  const { toast } = useToast();
  const undo = useUndo();
  const [toneOpen, setToneOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const ids = notes.map((n) => n.id);
  const n = ids.length;
  const allPinned = n > 0 && notes.every((note) => note.pinned);

  const togglePin = () => {
    haptic("select");
    updateMany(ids, { pinned: !allPinned });
    onClear();
  };

  const archive = () => {
    undo({ message: `Archivováno: ${n}`, ids, run: () => archiveMany(ids) });
    onClear();
  };

  const remove = () => {
    undo({ message: `Přesunuto do koše: ${n}`, ids, run: () => trashMany(ids) });
    onClear();
  };

  // Odeslání vybraných do počítače - jen když je nastavené spojení.
  const send = async () => {
    setBusy(true);
    const res = await sendAllNotes(notes);
    setBusy(false);
    if (trashAfterSync) for (const id of res.sentIds) trash(id);
    onClear();
    toast(
      res.failed === 0
        ? { tone: "success", title: `Odesláno ${res.sent} ${plural(res.sent, "poznámka", "poznámky", "poznámek")}` }
        : { tone: "warn", title: `Odesláno ${res.sent} z ${res.sent + res.failed}`, description: res.message },
    );
  };

  return (
    <>
      <div className="anim-fade mw-safe-top mw-safe-x fixed inset-x-0 top-0 z-40 bg-surface-container">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-1 px-2">
          <Button variant="ghost" size="icon" aria-label="Zrušit výběr" onClick={onClear}>
            <X />
          </Button>
          <span className="min-w-0 flex-1 truncate text-title-md tabular">
            {n} {plural(n, "vybraná", "vybrané", "vybraných")}
          </span>
          <Button variant="ghost" size="icon" aria-label={allPinned ? "Odepnout" : "Připnout"} onClick={togglePin}>
            {allPinned ? <PinOff /> : <Pin />}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Barva" onClick={() => setToneOpen(true)}>
            <Palette />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Archivovat" onClick={archive}>
            <Archive />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Smazat" onClick={remove}>
            <Trash2 />
          </Button>
          {isSupabaseConfigured() ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Odeslat do počítače"
              disabled={busy}
              onClick={() => void send()}
            >
              <Send />
            </Button>
          ) : null}
        </div>
      </div>

      <Dialog open={toneOpen} onOpenChange={setToneOpen} title="Barva">
        <TonePicker
          value={notes[0]?.tone ?? "none"}
          onChange={(tone) => {
            haptic("select");
            updateMany(ids, { tone });
            setToneOpen(false);
            onClear();
          }}
        />
      </Dialog>
    </>
  );
}

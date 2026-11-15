"use client";

import * as React from "react";
import { Share } from "@capacitor/share";
import { Archive, ArchiveRestore, Copy, ListRestart, ListX, Send, Share2, Tags, Trash2 } from "lucide-react";
import { ActionList, type ActionItem } from "@/components/ui/action-list";
import { Dialog } from "@/components/ui/dialog";
import { TonePicker } from "@/components/ui/tone-picker";
import { useStore } from "@/components/providers/store-provider";
import { useGoUp } from "@/components/providers/use-app-back";
import { usePrefs } from "@/components/providers/use-prefs";
import { useToast } from "@/components/providers/toast-provider";
import { useUndo } from "@/components/providers/use-undo";
import { removeChecked, taskStats, uncheckAll } from "@/lib/checklist";
import { stripImageMarkers } from "@/lib/inline-images";
import { haptic, isNative } from "@/lib/native";
import { isEmptyNote, noteTitle } from "@/lib/notes";
import { isSupabaseConfigured } from "@/lib/supabase";
import { currentAccount, sendNote } from "@/lib/sync";
import type { Note } from "@/lib/types";

/**
 * Text poznámky tak, jak se hodí do schránky nebo do sdílení. Značky fotek
 * jdou pryč - `![](img_12.jpg)` v cizí konverzaci neznamená nic (I6).
 */
function plainText(note: Note): string {
  const body = stripImageMarkers(note.text).trim();
  const head = note.title.trim();
  return head ? `${head}\n\n${body}` : body;
}

/** Sheet „Možnosti" z horní lišty editoru. */
export function NoteActionsSheet({
  note,
  open,
  onOpenChange,
  onOpenTags,
  onTextEdit,
}: {
  note: Note;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTags: () => void;
  /** Úprava textu přes historii editoru (aby šla vrátit tlačítkem Zpět). */
  onTextEdit: (text: string) => void;
}) {
  const { update, archive, unarchive, trash } = useStore();
  const { trashAfterSync } = usePrefs();
  const { toast } = useToast();
  const undo = useUndo();
  const goUp = useGoUp();
  const [sending, setSending] = React.useState(false);
  // Odeslání jen přihlášenému: nepřihlášenému by tlačítko jen svítilo a po
  // ťuknutí hlásilo chybu. Klient Supabase se bez adresy nesmí ani vytvořit (I15).
  const [canSend, setCanSend] = React.useState(false);

  React.useEffect(() => {
    if (!open || !isSupabaseConfigured()) return;
    let cancelled = false;
    void currentAccount().then((acc) => !cancelled && setCanSend(acc !== null));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const tasks = taskStats(note.text);

  const share = async () => {
    const text = plainText(note);
    try {
      if (isNative()) await Share.share({ title: noteTitle(note), text });
      else if (navigator.share) await navigator.share({ title: noteTitle(note), text });
      else {
        await navigator.clipboard.writeText(text);
        toast({ tone: "info", title: "Zkopírováno" });
      }
    } catch {
      // Zrušené sdílení není chyba, kterou by uživatel potřeboval vidět.
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainText(note));
      toast({ tone: "info", title: "Zkopírováno" });
    } catch {
      toast({ tone: "warn", title: "Do schránky se nepovedlo zapsat" });
    }
  };

  const send = async () => {
    setSending(true);
    const res = await sendNote(note);
    setSending(false);
    if (!res.ok) {
      haptic("error");
      toast({ tone: "warn", title: "Odeslání selhalo", description: res.message });
      return;
    }
    haptic("success");
    toast({
      tone: "success",
      title: "Odesláno do počítače",
      description: res.images > 0 ? `Včetně ${res.images} fotek.` : undefined,
    });
    if (trashAfterSync) {
      trash(note.id);
      goUp("/");
    }
  };

  const ids = [note.id];
  const items: ActionItem[] = [
    { id: "tags", label: "Štítky", icon: <Tags />, onSelect: onOpenTags },
  ];
  if (tasks.done > 0) {
    items.push(
      {
        id: "uncheck",
        label: "Odškrtnout vše",
        icon: <ListRestart />,
        onSelect: () => onTextEdit(uncheckAll(note.text)),
      },
      {
        id: "remove-done",
        label: "Smazat hotové",
        icon: <ListX />,
        onSelect: () =>
          undo({
            message: "Hotové úkoly smazány",
            ids,
            run: () => onTextEdit(removeChecked(note.text)),
          }),
      },
    );
  }
  items.push(
    { id: "share", label: "Sdílet", icon: <Share2 />, onSelect: () => void share() },
    { id: "copy", label: "Kopírovat text", icon: <Copy />, onSelect: () => void copy() },
    note.archivedAt
      ? {
          id: "unarchive",
          label: "Vrátit z archivu",
          icon: <ArchiveRestore />,
          onSelect: () => undo({ message: "Vráceno z archivu", ids, run: () => unarchive(note.id) }),
        }
      : {
          id: "archive",
          label: "Archivovat",
          icon: <Archive />,
          onSelect: () => {
            goUp("/");
            undo({ message: "Archivováno", ids, run: () => archive(note.id) });
          },
        },
  );
  if (canSend) {
    items.push({
      id: "send",
      label: sending ? "Odesílám…" : "Odeslat do počítače",
      icon: <Send />,
      disabled: sending || isEmptyNote(note),
      onSelect: () => void send(),
    });
  }
  items.push({
    id: "delete",
    label: "Smazat",
    icon: <Trash2 />,
    destructive: true,
    onSelect: () => {
      goUp("/");
      undo({ message: "Přesunuto do koše", ids, run: () => trash(note.id) });
    },
  });

  // Sheet se po výběru zavře sám - akce pak běží nad zavřeným oknem.
  const closing = items.map((item) => ({
    ...item,
    onSelect: () => {
      onOpenChange(false);
      item.onSelect();
    },
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Možnosti">
      <div className="flex flex-col gap-4">
        <TonePicker
          value={note.tone}
          onChange={(tone) => {
            haptic("select");
            update(note.id, { tone });
          }}
        />
        <ActionList items={closing} />
      </div>
    </Dialog>
  );
}

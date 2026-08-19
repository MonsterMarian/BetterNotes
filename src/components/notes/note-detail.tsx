"use client";

import * as React from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  Copy,
  ImagePlus,
  Pin,
  PinOff,
  Send,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { Share } from "@capacitor/share";
import { VoiceMode } from "./voice-mode";
import { ImageLightbox } from "./image-lightbox";
import { NoteBody } from "./note-body";
import { NoteThumb } from "./note-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { useStore } from "@/components/providers/store-provider";
import { usePrefs } from "@/components/providers/use-prefs";
import { useGoUp } from "@/components/providers/use-app-back";
import { useToast } from "@/components/providers/toast-provider";
import { capturePhoto, deleteImage } from "@/lib/images";
import {
  insertImageMarker,
  removeImageMarker,
  stripImageMarkers,
  trailingImages,
} from "@/lib/inline-images";
import { isEmptyNote, noteTitle, normalizeTag } from "@/lib/notes";
import { isNative, tapFeedback, winFeedback } from "@/lib/native";
import { currentAccount, sendNote } from "@/lib/sync";
import { isSupabaseConfigured } from "@/lib/supabase";
import { NOTE_TONES, type NoteTone } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Text poznámky tak, jak se hodí do schránky nebo do sdílení. Značky fotek
 * jdou pryč - `![](img_12.jpg)` v cizí konverzaci neznamená nic.
 */
function plainText(title: string, text: string): string {
  const body = stripImageMarkers(text).trim();
  const head = title.trim();
  return head ? `${head}\n\n${body}` : body;
}

export function NoteDetail({ noteId }: { noteId: string }) {
  const { state, hydrated, update, togglePin, addTag, removeTag, trash } = useStore();
  const { trashAfterSync } = usePrefs();
  const { toast } = useToast();
  const goUp = useGoUp();

  const note = state.notes.find((n) => n.id === noteId);

  const [tagDraft, setTagDraft] = React.useState("");
  const [busy, setBusy] = React.useState<"photo" | "send" | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [tonesOpen, setTonesOpen] = React.useState(false);
  /** Otevřená lupa - index do `note.images`; null = zavřená. */
  const [zoom, setZoom] = React.useState<number | null>(null);
  /** Poslední pozice kurzoru v textu - kam se vloží nová fotka. */
  const caret = React.useRef<number | null>(null);
  // Tlačítko „Odeslat" se ukazuje jen přihlášenému. Nepřihlášenému by jen
  // svítilo a po ťuknutí ho poslalo do Nastavení - to je horší než ho nemít.
  const [canSend, setCanSend] = React.useState(false);

  React.useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void currentAccount().then((acc) => setCanSend(acc !== null));
  }, []);

  /*
   * Prázdnou poznámku po odchodu uklidí seznam, ne tahle obrazovka.
   *
   * Úklid v návratové funkci efektu vypadá logicky, ale je to past: React
   * ve `StrictMode` efekt namountuje, odmountuje a namountuje znovu, takže
   * "odchod" nastane hned po otevření a čerstvě založená poznámka zmizí
   * pod rukama. Seznam ví, že se právě needituje nic, a tam je ten úklid
   * jednoznačný.
   */

  if (!hydrated) {
    return <div className="h-64 animate-pulse rounded-xl border bg-muted/40" />;
  }

  if (!note) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
        <p className="text-sm text-muted-foreground">Tahle poznámka už neexistuje.</p>
        <Button variant="secondary" size="sm" onClick={() => goUp("/")}>
          <ArrowLeft />
          Zpět na seznam
        </Button>
      </div>
    );
  }

  const loose = trailingImages(note.text, note.images);

  const addPhoto = async (source: "camera" | "gallery") => {
    setBusy("photo");
    try {
      const name = await capturePhoto(source);
      if (!name) return;
      void tapFeedback();
      // Fotka sedne tam, kde je kurzor - proto se s ní do textu zapíše značka.
      // Bez ní by skončila na konci, i kdyby patřila k odstavci uprostřed.
      update(note.id, {
        images: [...note.images, name],
        text: insertImageMarker(note.text, name, caret.current ?? undefined),
      });
    } catch (e) {
      toast({
        tone: "warn",
        title: "Fotku se nepovedlo přidat",
        description: String(e).slice(0, 120),
      });
    } finally {
      setBusy(null);
    }
  };

  const dropPhoto = (name: string) => {
    update(note.id, {
      images: note.images.filter((n) => n !== name),
      // Značka bez fotky by v textu zůstala jako prázdný rámeček.
      text: removeImageMarker(note.text, name),
    });
    // Soubor pryč hned: sirotky sice po startu uklidí store, ale zbytečně
    // by do té doby zabíral místo v telefonu.
    void deleteImage(name);
  };

  const commitTag = () => {
    const tag = normalizeTag(tagDraft);
    if (!tag) return setTagDraft("");
    addTag(note.id, tag);
    setTagDraft("");
  };

  const send = async () => {
    setBusy("send");
    const res = await sendNote(note);
    setBusy(null);
    if (!res.ok) {
      toast({ tone: "warn", title: "Odeslání selhalo", description: res.message });
      return;
    }
    void winFeedback();
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

  const share = async () => {
    const text = plainText(note.title, note.text);
    try {
      if (isNative()) {
        await Share.share({ title: noteTitle(note), text });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: noteTitle(note), text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast({ tone: "info", title: "Zkopírováno do schránky" });
    } catch {
      // Zrušené sdílení není chyba, kterou by uživatel potřeboval vidět.
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainText(note.title, note.text));
      toast({ tone: "info", title: "Zkopírováno do schránky" });
    } catch {
      toast({ tone: "warn", title: "Do schránky se nepovedlo zapsat" });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Zpět" onClick={() => goUp("/")}>
          <ArrowLeft />
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={note.pinned ? "Odepnout" : "Připnout nahoru"}
            title={note.pinned ? "Odepnout" : "Připnout nahoru"}
            onClick={() => {
              void tapFeedback();
              togglePin(note.id);
            }}
          >
            {note.pinned ? <PinOff className="text-mark" /> : <Pin />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Barva poznámky"
            title="Barva poznámky"
            onClick={() => setTonesOpen(true)}
          >
            <span
              data-tone={note.tone}
              className="size-4 rounded-full border"
              style={{ background: "var(--note-tint, transparent)" }}
            />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Kopírovat text" title="Kopírovat text" onClick={copy}>
            <Copy />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Sdílet" title="Sdílet" onClick={share}>
            <Share2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Smazat"
            title="Smazat"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      </div>

      <div data-tone={note.tone} className="note-stripe relative flex flex-col gap-3 rounded-xl border bg-card p-4 pl-5">
        <input
          value={note.title}
          onChange={(e) => update(note.id, { title: e.target.value })}
          placeholder="Název"
          aria-label="Název poznámky"
          className="w-full bg-transparent text-lg font-semibold tracking-tight outline-none placeholder:font-normal placeholder:text-muted-foreground"
        />
        <NoteBody
          text={note.text}
          caretRef={caret}
          onChange={(text) => update(note.id, { text })}
          onOpenImage={(name) => setZoom(Math.max(0, note.images.indexOf(name)))}
        />
      </div>

      {/*
        Fotky bez značky v textu - starší poznámky a všechno, co se do textu
        nezařadilo. Ty se pořád kreslí pod textem, jako dřív.
      */}
      {loose.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {loose.map((name) => (
            <div key={name} className="relative">
              <button
                type="button"
                aria-label="Zvětšit fotku"
                onClick={() => setZoom(Math.max(0, note.images.indexOf(name)))}
                className="block w-full"
              >
                <NoteThumb name={name} className="aspect-square w-full" />
              </button>
              <button
                type="button"
                aria-label="Odebrat fotku"
                onClick={() => dropPhoto(name)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {note.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pl-3 pr-1 text-xs text-secondary-foreground"
          >
            #{tag}
            <button
              type="button"
              aria-label={`Odebrat štítek ${tag}`}
              onClick={() => removeTag(note.id, tag)}
              className="rounded-full p-0.5 opacity-60 hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <Input
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onBlur={commitTag}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitTag();
            }
          }}
          placeholder="+ štítek"
          aria-label="Přidat štítek"
          enterKeyHint="done"
          className="h-8 w-28 rounded-full text-xs"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={busy !== null}
          onClick={() => void addPhoto("camera")}
        >
          <Camera />
          Vyfotit
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          disabled={busy !== null}
          onClick={() => void addPhoto("gallery")}
        >
          <ImagePlus />
          Z galerie
        </Button>
        <VoiceMode
          text={note.text}
          at={caret.current}
          onChange={(text) => update(note.id, { text })}
        />
      </div>

      {canSend ? (
        <Button
          className="bg-progress text-progress-foreground hover:bg-progress/90"
          disabled={busy !== null || isEmptyNote(note)}
          onClick={() => void send()}
        >
          <Send />
          {busy === "send" ? "Odesílám…" : "Odeslat do počítače"}
        </Button>
      ) : null}

      {zoom !== null && note.images.length > 0 ? (
        <ImageLightbox
          names={note.images}
          index={zoom}
          onIndexChange={setZoom}
          onClose={() => setZoom(null)}
        />
      ) : null}

      <Dialog
        open={tonesOpen}
        onOpenChange={setTonesOpen}
        title="Barva poznámky"
        description="Proužek u hrany karty, ať se poznámka najde v seznamu očima."
      >
        <div className="grid grid-cols-3 gap-2">
          {NOTE_TONES.map((tone) => (
            <button
              key={tone.id}
              type="button"
              data-tone={tone.id}
              aria-pressed={note.tone === tone.id}
              onClick={() => {
                update(note.id, { tone: tone.id as NoteTone });
                setTonesOpen(false);
              }}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-3 text-left text-xs transition-colors hover:bg-accent",
                note.tone === tone.id && "ring-2 ring-ring",
              )}
            >
              <span
                className="size-4 shrink-0 rounded-full border"
                style={{ background: "var(--note-tint, transparent)" }}
              />
              <span className="min-w-0 flex-1 truncate">{tone.label}</span>
              {note.tone === tone.id ? <Check className="size-3.5 shrink-0" /> : null}
            </button>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Smazat poznámku?"
        description="Přesune se do koše, odkud ji jde vrátit."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmDelete(false);
                trash(note.id);
                goUp("/");
              }}
            >
              <Trash2 />
              Do koše
            </Button>
          </>
        }
      />
    </div>
  );
}

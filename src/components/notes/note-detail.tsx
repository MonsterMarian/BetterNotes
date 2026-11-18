"use client";

import * as React from "react";
import { ArrowLeft, Camera, Check, EllipsisVertical, Folder, ImagePlus, Pin, X } from "lucide-react";
import { VoiceMode, type VoiceModeHandle } from "./voice-mode";
import { ImageLightbox } from "./image-lightbox";
import { NoteBody } from "./note-body";
import { NoteThumb } from "./note-thumb";
import { EditorFooter } from "@/components/editor/editor-footer";
import { FormatToolbar, type WrapMark } from "@/components/editor/format-toolbar";
import { NoteActionsSheet } from "@/components/editor/note-actions-sheet";
import { focusBodyAt } from "@/components/editor/segment-editor";
import { TagsSheet } from "@/components/editor/tags-sheet";
import { ActionList } from "@/components/ui/action-list";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useKeyboardHeight } from "@/components/ui/floating-toolbar";
import { TopBar, useScrolled } from "@/components/ui/top-bar";
import { useStore } from "@/components/providers/store-provider";
import { usePrefs } from "@/components/providers/use-prefs";
import { useGoUp } from "@/components/providers/use-app-back";
import { useToast } from "@/components/providers/toast-provider";
import {
  autoFormat,
  lineRangeAt,
  taskMarkerHit,
  toggleLinePrefix,
  toggleTaskAt,
  wrapSelection,
  type LineKind,
} from "@/lib/checklist";
import { dayTitle } from "@/lib/date";
import { createHistory, recordEdit, redoEdit, undoEdit, type EditSnapshot } from "@/lib/history";
import { capturePhoto, deleteImage, type PhotoSource } from "@/lib/images";
import { imageMarker, insertImageMarker, removeImageMarker, trailingImages } from "@/lib/inline-images";
import { haptic } from "@/lib/native";
import { getPrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";

type Selection = { start: number; end: number };

/**
 * Kurzor na konec přepnutého úkolu. Se „sink" řádek mohl klesnout na konec
 * seznamu, proto se hledá jeho nejbližší výskyt jako celého řádku.
 */
function toggledLineEnd(text: string, next: string, at: number): number {
  const { start, end } = lineRangeAt(text, at);
  const line = text.slice(start, end).replace(/\[( |x|X)\]/, (m) => (m === "[ ]" ? "[x]" : "[ ]"));
  let caret = -1;
  let best = Infinity;
  for (let i = next.indexOf(line); i !== -1; i = next.indexOf(line, i + 1)) {
    const whole = (i === 0 || next[i - 1] === "\n") && (i + line.length === next.length || next[i + line.length] === "\n");
    if (whole && Math.abs(i - start) < best) {
      best = Math.abs(i - start);
      caret = i + line.length;
    }
  }
  return caret < 0 ? Math.min(end, next.length) : caret;
}

export function NoteDetail({
  noteId,
  autoVoice = false,
  autoPhoto = null,
  isNew = false,
}: {
  noteId: string;
  autoVoice?: boolean;
  autoPhoto?: PhotoSource | null;
  isNew?: boolean;
}) {
  const { state, hydrated, update, togglePin, removeTag, toggleTask } = useStore();
  const { editorFont } = usePrefs();
  const { toast } = useToast();
  const goUp = useGoUp();
  const scrolled = useScrolled();
  // WebView se pod klávesnicí nezmenší - bez odsazení by pata a konec textu zůstaly pod ní.
  const keyboard = useKeyboardHeight();

  const note = state.notes.find((n) => n.id === noteId);
  const noteRef = React.useRef(note);
  noteRef.current = note;

  /** null = výchozí režim: nová nebo prázdná poznámka se rovnou píše, ostatní se čtou. */
  const [editingState, setEditing] = React.useState<boolean | null>(null);
  const editing = editingState ?? (isNew || !note?.text.trim());
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [tagsOpen, setTagsOpen] = React.useState(false);
  const [photoOpen, setPhotoOpen] = React.useState(false);
  /** Otevřená lupa - index do `note.images`; null = zavřená. */
  const [zoom, setZoom] = React.useState<number | null>(null);
  const [voiceActive, setVoiceActive] = React.useState(false);
  const [history, setHistory] = React.useState(createHistory);

  /**
   * Poslední pozice kurzoru v celém textu (I11). Přežije rozostření pole:
   * lišta, sheet s fotkou i diktát se ptají, kam vkládat, až po odchodu z pole.
   */
  const caretRef = React.useRef<number | null>(null);
  const selRef = React.useRef<Selection | null>(null);
  /** Výběr, který se má nastavit po příštím vykreslení (nový text, přepnutí do psaní). */
  const pendingSel = React.useRef<Selection | null>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const voiceRef = React.useRef<VoiceModeHandle>(null);
  const photoBusy = React.useRef(false);
  /** Délka textu a místo vložení při startu diktátu - kvůli kurzoru za diktátem. */
  const voiceBase = React.useRef<{ len: number; at: number } | null>(null);

  // Nová poznámka: kurzor rovnou na konec textu (u „Seznamu" za `- [ ] `).
  // Při diktátu a focení ne - klávesnice by jen zakryla, co se děje.
  const autoFocused = React.useRef(false);
  React.useLayoutEffect(() => {
    if (autoFocused.current || !isNew || !note || autoVoice || autoPhoto) return;
    autoFocused.current = true;
    pendingSel.current = { start: note.text.length, end: note.text.length };
  }, [isNew, note, autoVoice, autoPhoto]);

  React.useLayoutEffect(() => {
    const sel = pendingSel.current;
    if (!sel || !editing) return;
    if (focusBodyAt(bodyRef.current, sel.start, sel.end)) pendingSel.current = null;
  });

  const addPhoto = React.useCallback(
    async (source: PhotoSource) => {
      if (photoBusy.current) return;
      photoBusy.current = true;
      try {
        const name = await capturePhoto(source);
        if (!name) return;
        // Poznámka se mohla během focení změnit - bere se ta nejnovější.
        const current = noteRef.current;
        if (!current) return void deleteImage(name);
        haptic("success");
        // Značka + položka v `images` jdou vždycky spolu (I5).
        const text = insertImageMarker(current.text, name, caretRef.current ?? undefined);
        update(current.id, { images: [...current.images, name], text });
        // Historie by uměla vrátit text bez fotky a pak zpět značku bez souboru.
        setHistory(createHistory());
        const marker = imageMarker(name);
        const after = Math.min(text.indexOf(marker) + marker.length + 1, text.length);
        caretRef.current = after;
        selRef.current = null;
        pendingSel.current = { start: after, end: after };
      } catch (e) {
        // Zavřený foťák nebo galerie bez výběru není chyba - uživatel si to rozmyslel.
        if (/cancel/i.test(String(e))) return;
        haptic("error");
        toast({ tone: "warn", title: "Fotku se nepovedlo přidat", description: String(e).slice(0, 120) });
      } finally {
        photoBusy.current = false;
      }
    },
    [update, toast],
  );

  // `?photo=` spustí focení jednou. Pojistka se zapíše až v časovači, aby
  // StrictMode (mount → unmount → mount) start nezablokoval (I9).
  const photoStarted = React.useRef(false);
  React.useEffect(() => {
    if (!autoPhoto || !hydrated || photoStarted.current) return;
    const t = setTimeout(() => {
      photoStarted.current = true;
      void addPhoto(autoPhoto);
    }, 200);
    return () => clearTimeout(t);
  }, [autoPhoto, hydrated, addPhoto]);

  /*
   * Prázdnou poznámku po odchodu uklidí seznam, ne tahle obrazovka (I2).
   * Úklid při odmontování by ve StrictMode smazal čerstvě založenou poznámku.
   */

  if (!hydrated) {
    return <div className="mx-auto mt-24 h-64 max-w-2xl animate-pulse rounded-xl bg-surface-high" />;
  }

  if (!note) {
    return (
      <div className="mw-safe-top flex flex-col items-start gap-3 p-6">
        <p className="text-body-lg text-on-surface-variant">Tahle poznámka už neexistuje.</p>
        <Button variant="tonal" onClick={() => goUp("/")}>
          <ArrowLeft />
          Zpět na seznam
        </Button>
      </div>
    );
  }

  const snapshot = (): EditSnapshot => ({
    title: note.title,
    text: note.text,
    caret: caretRef.current ?? note.text.length,
  });

  /** `step` = samostatný krok (lišta, menu, diktát), nesplyne s psaním těsně před ním. */
  const record = (step = false) => {
    const before = snapshot();
    setHistory((h) => recordEdit(step ? { ...h, lastAt: 0 } : h, before, Date.now()));
  };

  const focusAt = (start: number, end = start) => {
    caretRef.current = start;
    selRef.current = { start, end };
    if (editing && focusBodyAt(bodyRef.current, start, end)) return;
    pendingSel.current = { start, end };
    setEditing(true);
  };

  /** Úprava z lišty nebo menu: jde do historie a kurzor se vrátí na výběr. */
  const applyEdit = (text: string, start: number, end = start) => {
    caretRef.current = start;
    selRef.current = { start, end };
    if (text === note.text) {
      if (editing) focusBodyAt(bodyRef.current, start, end);
      return;
    }
    record(true);
    update(note.id, { text });
    if (editing) pendingSel.current = { start, end };
  };

  /** Psaní v poli. `autoFormat` dopisuje odrážky a úkoly podle rozdílu, ne podle kláves (IME). */
  const typeText = (next: string, selStart: number, selEnd: number) => {
    record();
    const fmt = autoFormat(note.text, next, selStart);
    if (fmt) {
      next = fmt.text;
      selStart = selEnd = fmt.caret;
      pendingSel.current = { start: fmt.caret, end: fmt.caret };
    }
    caretRef.current = selStart;
    selRef.current = { start: selStart, end: selEnd };
    update(note.id, { text: next });
  };

  const selection = (): Selection =>
    selRef.current ?? { start: caretRef.current ?? note.text.length, end: caretRef.current ?? note.text.length };

  const restore = (res: ReturnType<typeof undoEdit>) => {
    if (!res) return;
    setHistory(res.history);
    update(note.id, { title: res.snapshot.title, text: res.snapshot.text });
    const at = Math.min(res.snapshot.caret, res.snapshot.text.length);
    caretRef.current = at;
    selRef.current = null;
    pendingSel.current = { start: at, end: at };
  };

  const heading = () => {
    const { start, end } = selection();
    const line = note.text.slice(lineRangeAt(note.text, start).start);
    const level = /^(#{1,3}) /.exec(line)?.[1].length ?? 0;
    // h1 → h2 → h3 → nic: starý nadpis pryč, pak případně o úroveň menší.
    let r = { text: note.text, start, end };
    if (level > 0) r = toggleLinePrefix(r.text, r.start, r.end, `h${level}` as LineKind);
    if (level < 3) r = toggleLinePrefix(r.text, r.start, r.end, `h${level + 1}` as LineKind);
    applyEdit(r.text, r.start, r.end);
  };

  const wrap = (mark: WrapMark) => {
    const { start, end } = selection();
    const r = wrapSelection(note.text, start, end, mark);
    applyEdit(r.text, r.start, r.end);
  };

  const linePrefix = (kind: LineKind) => {
    const { start, end } = selection();
    const r = toggleLinePrefix(note.text, start, end, kind);
    applyEdit(r.text, r.start, r.end);
  };

  /** Klepnutí do `- [ ]` v režimu psaní přepne úkol a kurzor uteče na konec řádku. */
  const tapCaret = (start: number, end: number) => {
    caretRef.current = start;
    selRef.current = { start, end };
    if (start !== end || voiceActive || !taskMarkerHit(note.text, start)) return;
    const next = toggleTaskAt(note.text, start, getPrefs().sinkChecked);
    haptic("tick");
    applyEdit(next, toggledLineEnd(note.text, next, start));
  };

  const dropPhoto = (name: string) => {
    update(note.id, {
      images: note.images.filter((n) => n !== name),
      // Značka bez fotky by v textu zůstala jako prázdný rámeček.
      text: removeImageMarker(note.text, name),
    });
    // Soubor pryč hned a historie od nuly: undo nesmí vrátit značku bez souboru (I5).
    void deleteImage(name);
    setHistory(createHistory());
    caretRef.current = null;
    selRef.current = null;
  };

  const finishEditing = () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setEditing(false);
  };

  const openImage = (name: string) => setZoom(Math.max(0, note.images.indexOf(name)));
  const loose = trailingImages(note.text, note.images);

  return (
    <div
      data-tone={note.tone}
      style={keyboard ? { paddingBottom: `calc(96px + ${keyboard}px)` } : undefined}
      className={cn(
        "anim-page flex min-h-dvh flex-col pb-[calc(96px+var(--mw-safe-bottom))]",
        note.tone === "none" ? "bg-surface" : "bg-[var(--note-bg)]",
      )}
    >
      <TopBar
        scrolled={scrolled}
        className={cn(!scrolled && "bg-transparent")}
        leading={
          <Button variant="ghost" size="icon" aria-label="Zpět" onClick={() => goUp("/")}>
            <ArrowLeft />
          </Button>
        }
        actions={
          <>
            {/* Kategorie na očích, ne schované v menu - zařazuje se často. */}
            <Button variant="ghost" size="icon" aria-label="Kategorie" onClick={() => setTagsOpen(true)}>
              <Folder />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={note.pinned ? "Odepnout" : "Připnout"}
              aria-pressed={note.pinned}
              onClick={() => {
                haptic("select");
                togglePin(note.id);
              }}
            >
              <Pin className={cn(note.pinned && "fill-current text-[var(--tertiary)]")} />
            </Button>
            {editing ? (
              <Button variant="ghost" size="icon" aria-label="Hotovo" onClick={finishEditing}>
                <Check />
              </Button>
            ) : null}
            <Button variant="ghost" size="icon" aria-label="Možnosti" onClick={() => setMenuOpen(true)}>
              <EllipsisVertical />
            </Button>
          </>
        }
      />

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 px-4">
        <input
          value={note.title}
          onChange={(e) => {
            record();
            update(note.id, { title: e.target.value });
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            focusAt(0);
          }}
          placeholder={note.day ? dayTitle(note.day) : "Nadpis"}
          aria-label="Nadpis poznámky"
          enterKeyHint="next"
          className="emph w-full bg-transparent text-headline-md text-on-surface outline-none placeholder:text-on-surface-variant/60"
        />

        <NoteBody
          ref={bodyRef}
          text={note.text}
          editing={editing}
          readOnly={voiceActive}
          serif={editorFont === "serif"}
          onTextChange={typeText}
          onSelectionChange={(start, end) => {
            caretRef.current = start;
            selRef.current = { start, end };
          }}
          onTapCaret={tapCaret}
          onEnterEdit={(at) => focusAt(at)}
          onToggleTask={(at) => {
            haptic("tick");
            toggleTask(note.id, at);
          }}
          onOpenImage={openImage}
          onRemoveImage={dropPhoto}
        />

        {/* Fotky bez značky v textu - starší poznámky. Kreslí se pod textem, jako dřív. */}
        {loose.length > 0 ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {loose.map((name) => (
              <div key={name} className="relative">
                <button type="button" aria-label="Zvětšit fotku" onClick={() => openImage(name)} className="block w-full">
                  <NoteThumb name={name} className="aspect-square w-full rounded-lg" />
                </button>
                {editing ? (
                  <button
                    type="button"
                    aria-label="Odebrat fotku"
                    onClick={() => dropPhoto(name)}
                    className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-inverse-surface/80 text-inverse-on-surface"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <EditorFooter note={note} onRemoveTag={(tag) => removeTag(note.id, tag)} />
      </div>

      {editing && !voiceActive ? (
        <FormatToolbar
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          onUndo={() => restore(undoEdit(history, snapshot()))}
          onRedo={() => restore(redoEdit(history, snapshot()))}
          onHeading={heading}
          onWrap={wrap}
          onLine={linePrefix}
          onPhoto={() => setPhotoOpen(true)}
          onDictate={() => voiceRef.current?.toggle()}
        />
      ) : null}

      <VoiceMode
        ref={voiceRef}
        text={note.text}
        caretRef={caretRef}
        autoStart={autoVoice}
        onListeningChange={(on) => {
          setVoiceActive(on);
          if (!on) return;
          // Celý diktát jde vrátit jedním Zpět.
          record(true);
          const len = note.text.length;
          voiceBase.current = { len, at: Math.min(caretRef.current ?? len, len) };
        }}
        onChange={(text) => {
          update(note.id, { text });
          // Kurzor jede za diktátem - další diktát nebo fotka navážou za ním, ne před ním.
          const base = voiceBase.current;
          if (base) caretRef.current = base.at + text.length - base.len;
        }}
      />

      <NoteActionsSheet
        note={note}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onOpenTags={() => setTagsOpen(true)}
        onTextEdit={(text) => applyEdit(text, Math.min(caretRef.current ?? text.length, text.length))}
      />
      <TagsSheet note={note} open={tagsOpen} onOpenChange={setTagsOpen} />

      <Dialog open={photoOpen} onOpenChange={setPhotoOpen} title="Fotka">
        <ActionList
          items={(
            [
              { id: "camera", label: "Vyfotit", icon: <Camera /> },
              { id: "gallery", label: "Z galerie", icon: <ImagePlus /> },
            ] as const
          ).map((item) => ({
            ...item,
            onSelect: () => {
              setPhotoOpen(false);
              void addPhoto(item.id);
            },
          }))}
        />
      </Dialog>

      {zoom !== null && note.images.length > 0 ? (
        <ImageLightbox names={note.images} index={zoom} onIndexChange={setZoom} onClose={() => setZoom(null)} />
      ) : null}
    </div>
  );
}

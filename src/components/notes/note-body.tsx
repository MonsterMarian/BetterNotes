"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { NoteThumb } from "./note-thumb";
import { MdRender, caretAtPoint, lineEndAt } from "@/components/editor/md-render";
import { bodyParts, spliceText } from "@/components/editor/body-parts";
import { SegmentEditor } from "@/components/editor/segment-editor";
import { cn } from "@/lib/utils";

/**
 * Tělo poznámky: text a fotky v jednom sledu.
 *
 * Dva režimy jedné plochy. Čtení vykreslí markdown a mezi odstavci fotky na
 * jejich místech; zaškrtávátka jdou odklikat bez klávesnice. Psaní dá každému
 * textovému kusu mezi fotkami vlastní pole, takže značky `![](jméno)` nikdy
 * nejsou vidět a nedají se omylem rozbít.
 *
 * Proč ne `contenteditable`: s ním by appka musela sama spravovat kurzor,
 * schránku i Android klávesnici. Průhledné pole nad zrcadlem píše jako
 * obyčejný input a vypadá jako formátovaný text.
 *
 * Všechny pozice, které odsud odcházejí, jsou globální (do celého `text`).
 */
export function NoteBody({
  text,
  editing,
  readOnly,
  serif,
  onTextChange,
  onSelectionChange,
  onTapCaret,
  onEnterEdit,
  onToggleTask,
  onOpenImage,
  onRemoveImage,
  ref,
}: {
  text: string;
  editing: boolean;
  /** Během diktování: text píše mikrofon, ne prsty. */
  readOnly?: boolean;
  serif?: boolean;
  onTextChange: (next: string, selStart: number, selEnd: number) => void;
  onSelectionChange: (selStart: number, selEnd: number) => void;
  /** Klepnutí do pole v režimu psaní (kvůli zaškrtnutí přes `- [ ]`). */
  onTapCaret: (selStart: number, selEnd: number) => void;
  /** Klepnutí na text v režimu čtení - kam posadit kurzor. */
  onEnterEdit: (at: number) => void;
  onToggleTask: (at: number) => void;
  onOpenImage: (name: string) => void;
  onRemoveImage: (name: string) => void;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const router = useRouter();
  const parts = React.useMemo(() => bodyParts(text), [text]);
  const openTag = React.useCallback(
    (tag: string) => router.push(`/?tag=${encodeURIComponent(tag)}`),
    [router],
  );

  const image = (name: string, alt: string, key: string) => (
    <div key={key} className="relative">
      <button
        type="button"
        onClick={() => onOpenImage(name)}
        aria-label="Zvětšit fotku"
        className="block w-full overflow-hidden rounded-lg"
      >
        <NoteThumb name={name} alt={alt || "Fotka v poznámce"} className="w-full rounded-lg !object-contain" />
      </button>
      {editing ? (
        <button
          type="button"
          aria-label="Odebrat fotku"
          onClick={() => onRemoveImage(name)}
          className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-inverse-surface/80 text-inverse-on-surface"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );

  if (editing) {
    const firstText = parts.find((p) => p.kind === "text");
    return (
      <div ref={ref} className={cn("prose-note flex min-h-[45vh] flex-1 flex-col gap-3", serif && "serif")}>
        {parts.map((part, i) => {
          if (part.kind === "image") return image(part.name, part.alt, `i${i}`);
          const value = text.slice(part.start, part.end);
          // Globální pozice: poprvé napsaný znak může přinést oddělovač `pre`.
          const global = (local: number, next: string) => spliceText(text, part, next).offset + local;
          return (
            <SegmentEditor
              // Klíč podle pořadí: pole zůstane stejné, i když se text nad ním posune.
              key={`t${i}`}
              value={value}
              start={part.start}
              readOnly={readOnly}
              placeholder={part === firstText && !text.trim() ? "Piš…" : undefined}
              onEdit={(next, s, e) => onTextChange(spliceText(text, part, next).text, global(s, next), global(e, next))}
              onSelect={(s, e) => onSelectionChange(global(s, value), global(e, value))}
              onTap={(s, e) => onTapCaret(global(s, value), global(e, value))}
            />
          );
        })}
        {/* Prázdné místo pod textem: klepnutí pokračuje v psaní na konci. */}
        <div aria-hidden className="min-h-16 flex-1" onClick={() => onEnterEdit(text.length)} />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn("prose-note flex min-h-[45vh] flex-1 cursor-text flex-col gap-3", serif && "serif")}
      onClick={(e) => onEnterEdit(caretAtPoint(e.clientX, e.clientY) ?? lineEndAt(e.target) ?? text.length)}
    >
      {parts.map((part, i) => {
        if (part.kind === "image") {
          return (
            // Fotka si klepnutí nechá pro sebe, do psaní nepřepíná.
            <div key={`i${i}`} onClick={(e) => e.stopPropagation()}>
              {image(part.name, part.alt, `i${i}`)}
            </div>
          );
        }
        const value = text.slice(part.start, part.end);
        if (!value.trim()) return null;
        return (
          <MdRender
            key={`t${i}`}
            text={value}
            base={part.start}
            onToggleTask={onToggleTask}
            onOpenTag={openTag}
          />
        );
      })}
      {/* Klepnutí pod poslední blok pokračuje v psaní na konci, jako v editoru. */}
      <div aria-hidden className="min-h-16 flex-1" />
    </div>
  );
}

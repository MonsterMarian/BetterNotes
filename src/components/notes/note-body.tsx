"use client";

import * as React from "react";
import { NoteThumb } from "./note-thumb";
import { splitNoteBody } from "@/lib/inline-images";

/**
 * Tělo poznámky: text a fotky v jednom sledu, jako v Google Docs.
 *
 * Dva režimy jedné plochy. Když se needituje, vykreslí se odstavce a mezi nimi
 * fotky na svých místech. Klepnutí přepne na obyčejné textové pole, kde jsou
 * vidět syrové značky `![](jméno)` - značka se dá smazat, přesunout, cokoliv.
 *
 * Proč ne fotky přímo v editoru: to by znamenalo `contenteditable`, a s ním
 * vlastní správu kurzoru, schránky a Android klávesnice. Textové pole psaní
 * nijak nemění a fotka je vidět hned, jak se od poznámky odejde.
 */
export function NoteBody({
  text,
  onChange,
  onOpenImage,
  caretRef,
}: {
  text: string;
  onChange: (text: string) => void;
  /** Klepnutí na fotku v textu - otevře lupu. */
  onOpenImage: (name: string) => void;
  /**
   * Poslední známá pozice kurzoru. Drží se i po odchodu z pole: tlačítko
   * „Vyfotit" pole nejdřív rozostří a teprve pak se ptá, kam fotku vložit.
   */
  caretRef?: React.MutableRefObject<number | null>;
}) {
  const [editing, setEditing] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  /** Kam posadit kurzor po přepnutí do psaní; null = na konec. */
  const caret = React.useRef<number | null>(null);

  const blocks = React.useMemo(() => splitNoteBody(text), [text]);

  React.useEffect(() => {
    if (!editing) return;
    const field = ref.current;
    if (!field) return;
    const at = caret.current ?? field.value.length;
    field.focus();
    field.setSelectionRange(at, at);
    caret.current = null;
  }, [editing]);

  const edit = (at: number | null) => {
    caret.current = at;
    if (caretRef) caretRef.current = at;
    setEditing(true);
  };

  const rememberCaret = () => {
    if (caretRef && ref.current) caretRef.current = ref.current.selectionStart;
  };

  if (editing || blocks.length === 0) {
    return (
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => {
          onChange(e.target.value);
          rememberCaret();
        }}
        onSelect={rememberCaret}
        onBlur={() => {
          rememberCaret();
          setEditing(false);
        }}
        placeholder="Piš…"
        aria-label="Text poznámky"
        // Vysoké pole schválně: poznámka se píše na celou obrazovku,
        // ne do řádku, který se rozrůstá pod prstem.
        className="min-h-[45vh] w-full resize-none bg-transparent text-[0.95rem] leading-relaxed outline-none placeholder:text-muted-foreground"
      />
    );
  }

  return (
    <div className="flex min-h-[45vh] flex-col gap-3">
      {blocks.map((block, i) =>
        block.kind === "text" ? (
          <div
            key={`t${block.at}`}
            role="textbox"
            tabIndex={0}
            aria-label="Text poznámky"
            // Kurzor sedne na začátek klepnutého odstavce, ne na konec
            // poznámky - jinak by oprava překlepu nahoře znamenala projet
            // půl obrazovky zpátky.
            onClick={() => edit(block.at)}
            onFocus={() => edit(block.at)}
            className="whitespace-pre-wrap break-words text-[0.95rem] leading-relaxed outline-none"
          >
            {block.text}
          </div>
        ) : (
          <button
            key={`i${block.at}${i}`}
            type="button"
            onClick={() => onOpenImage(block.name)}
            aria-label="Zvětšit fotku"
            className="block w-full overflow-hidden rounded-lg border"
          >
            <NoteThumb name={block.name} alt={block.alt || "Fotka v poznámce"} className="w-full !object-contain" />
          </button>
        ),
      )}

      {/* Klepnutí pod poslední blok pokračuje v psaní na konci, jako v editoru. */}
      <div
        onClick={() => edit(null)}
        aria-hidden
        className="min-h-16 flex-1 cursor-text"
      />
    </div>
  );
}

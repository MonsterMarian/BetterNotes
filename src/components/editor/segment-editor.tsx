"use client";

import * as React from "react";
import { highlightLine } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/**
 * Posadí kurzor na globální pozici: do pole, jehož rozsah ji obsahuje, nebo
 * do nejbližšího dalšího. Pole nesou svůj začátek v `data-start`.
 */
export function focusBodyAt(root: HTMLElement | null, start: number, end = start): boolean {
  if (!root) return false;
  const fields = [...root.querySelectorAll<HTMLTextAreaElement>("textarea[data-start]")];
  if (fields.length === 0) return false;
  const field =
    fields.find((f) => start <= Number(f.dataset.start) + f.value.length) ?? fields[fields.length - 1];
  const base = Number(field.dataset.start);
  const clamp = (n: number) => Math.min(Math.max(n - base, 0), field.value.length);
  field.focus();
  field.setSelectionRange(clamp(start), clamp(end));
  return true;
}

/**
 * Editor jednoho textového kusu: průhledné `<textarea>` nad zrcadlem, které
 * kreslí tentýž text se ztlumenou markdown syntaxí.
 *
 * Zarovnání kurzoru stojí na tom, že obě vrstvy mají totožné písmo, odsazení
 * i zalamování - to drží `.ed-stack` v globals.css. Zrcadlo smí měnit jen
 * barvu a dekoraci, nikdy šířku znaku. Kontrolované pole navíc neztrácí
 * napsaný text: Android klávesnice s ním počítá jako s obyčejným inputem.
 */
export function SegmentEditor({
  value,
  start,
  readOnly,
  placeholder,
  onEdit,
  onSelect,
  onTap,
}: {
  value: string;
  /** Globální pozice prvního znaku - kvůli `focusBodyAt`. */
  start: number;
  readOnly?: boolean;
  placeholder?: string;
  /** Lokální pozice výběru po úpravě. */
  onEdit: (value: string, selStart: number, selEnd: number) => void;
  onSelect: (selStart: number, selEnd: number) => void;
  onTap: (selStart: number, selEnd: number) => void;
}) {
  const mirror = React.useMemo(
    () =>
      value.split("\n").map((line, i) => (
        <React.Fragment key={i}>
          {i > 0 ? "\n" : null}
          {highlightLine(line).map((piece, j) =>
            piece.cls ? (
              <span key={j} className={piece.cls}>
                {piece.text}
              </span>
            ) : (
              <React.Fragment key={j}>{piece.text}</React.Fragment>
            ),
          )}
        </React.Fragment>
      )),
    [value],
  );

  return (
    <div className="ed-stack grid-cols-1">
      <div className="ed-mirror" aria-hidden>
        {mirror}
        {/* Nulová mezera: prázdný poslední řádek musí mít v zrcadle výšku jako v poli. */}
        {"​"}
      </div>
      <textarea
        data-start={start}
        value={value}
        rows={1}
        readOnly={readOnly}
        placeholder={placeholder}
        aria-label="Text poznámky"
        autoCapitalize="sentences"
        onChange={(e) => onEdit(e.target.value, e.target.selectionStart, e.target.selectionEnd)}
        onSelect={(e) => onSelect(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)}
        onClick={(e) => onTap(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)}
        className={cn("ed-input w-full self-stretch placeholder:text-on-surface-variant", readOnly && "cursor-default")}
      />
    </div>
  );
}

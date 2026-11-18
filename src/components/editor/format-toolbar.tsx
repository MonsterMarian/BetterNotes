"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  Bold,
  Camera,
  Heading,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Mic,
  Quote,
  Redo2,
  Strikethrough,
  Type,
  Undo2,
} from "lucide-react";
import { FloatingToolbar, ToolbarButton } from "@/components/ui/floating-toolbar";
import type { LineKind } from "@/lib/checklist";

export type WrapMark = "**" | "_" | "~~" | "`";

/**
 * Lišta formátování nad klávesnicí. Tlačítka nesebírají fokus (`ToolbarButton`
 * ruší `pointerdown`), takže pole píše dál a akce míří na poslední kurzor.
 * Lišta je fixní, proto jde přes portál - předek s `transform` (animace
 * stránky) by ji jinak přišpendlil k sobě místo k oknu.
 */
export function FormatToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onHeading,
  onWrap,
  onLine,
  onPhoto,
  onDictate,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onHeading: () => void;
  onWrap: (mark: WrapMark) => void;
  onLine: (kind: LineKind) => void;
  onPhoto: () => void;
  onDictate: () => void;
}) {
  const [mounted, setMounted] = React.useState(false);
  const [format, setFormat] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  // Na 360px se do řádku vejde šest tlačítek - víc by se muselo posouvat do boku.
  // Denní věci jsou v řádku vždycky, formátování se rozbalí nad ním.
  return createPortal(
    <FloatingToolbar className={format ? "h-auto flex-col items-stretch rounded-[28px] py-2" : undefined}>
      {format ? (
        <div className="grid grid-cols-4 justify-items-center gap-1 border-b border-current/15 pb-2">
          <ToolbarButton icon={<Heading />} label="Nadpis" onClick={onHeading} />
          <ToolbarButton icon={<Bold />} label="Tučně" onClick={() => onWrap("**")} />
          <ToolbarButton icon={<Italic />} label="Kurzíva" onClick={() => onWrap("_")} />
          <ToolbarButton icon={<Strikethrough />} label="Přeškrtnout" onClick={() => onWrap("~~")} />
          <ToolbarButton icon={<List />} label="Odrážky" onClick={() => onLine("bullet")} />
          <ToolbarButton icon={<ListOrdered />} label="Číslování" onClick={() => onLine("ordered")} />
          <ToolbarButton icon={<Quote />} label="Citace" onClick={() => onLine("quote")} />
        </div>
      ) : null}
      <div className="flex items-center gap-1">
        <ToolbarButton icon={<ListChecks />} label="Úkol" onClick={() => onLine("task")} />
        <ToolbarButton icon={<Mic />} label="Diktovat" onClick={onDictate} />
        <ToolbarButton icon={<Camera />} label="Fotka" onClick={onPhoto} />
        <ToolbarButton icon={<Undo2 />} label="Vrátit úpravu" disabled={!canUndo} onClick={onUndo} />
        <ToolbarButton icon={<Redo2 />} label="Znovu" disabled={!canRedo} onClick={onRedo} />
        <ToolbarButton icon={<Type />} label="Formát" active={format} onClick={() => setFormat((v) => !v)} />
      </div>
    </FloatingToolbar>,
    document.body,
  );
}

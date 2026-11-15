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
  Undo2,
} from "lucide-react";
import { FloatingToolbar, ToolbarButton, ToolbarDivider } from "@/components/ui/floating-toolbar";
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
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <FloatingToolbar>
      <ToolbarButton icon={<Undo2 />} label="Vrátit úpravu" disabled={!canUndo} onClick={onUndo} />
      <ToolbarButton icon={<Redo2 />} label="Znovu" disabled={!canRedo} onClick={onRedo} />
      <ToolbarDivider />
      {/* Hned na začátku: na 360px je vidět jen prvních ~6 tlačítek a diktování je hlavní tah appky. */}
      <ToolbarButton icon={<Mic />} label="Diktovat" onClick={onDictate} />
      <ToolbarButton icon={<Camera />} label="Fotka" onClick={onPhoto} />
      <ToolbarDivider />
      <ToolbarButton icon={<Heading />} label="Nadpis" onClick={onHeading} />
      <ToolbarDivider />
      <ToolbarButton icon={<Bold />} label="Tučně" onClick={() => onWrap("**")} />
      <ToolbarButton icon={<Italic />} label="Kurzíva" onClick={() => onWrap("_")} />
      <ToolbarButton icon={<Strikethrough />} label="Přeškrtnout" onClick={() => onWrap("~~")} />
      <ToolbarDivider />
      <ToolbarButton icon={<List />} label="Odrážky" onClick={() => onLine("bullet")} />
      <ToolbarButton icon={<ListOrdered />} label="Číslování" onClick={() => onLine("ordered")} />
      <ToolbarButton icon={<ListChecks />} label="Úkol" onClick={() => onLine("task")} />
      <ToolbarButton icon={<Quote />} label="Citace" onClick={() => onLine("quote")} />
    </FloatingToolbar>,
    document.body,
  );
}

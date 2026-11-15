"use client";

import * as React from "react";
import { parseInline, parseMarkdown, type MdBlock } from "@/lib/markdown";
import { stripImageMarkers } from "@/lib/inline-images";
import { highlightRanges, searchSnippet } from "@/lib/search";
import { cn } from "@/lib/utils";
import type { Note } from "@/lib/types";

/** Text s označenými nálezy hledání. Bez dotazu jen text. */
export function Marked({ text, query }: { text: string; query: string }) {
  const ranges = query.trim() ? highlightRanges(text, query) : [];
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([from, to], i) => {
    if (from > at) parts.push(text.slice(at, from));
    parts.push(
      <mark key={i} className="hl">
        {text.slice(from, to)}
      </mark>,
    );
    at = to;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

/** Řádek bez markdownových značek, jen s tučným a spol. - náhled se nečte, jen poznává. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((t) => {
        if (t.type === "bold") return <strong key={t.from} className="font-semibold">{t.text}</strong>;
        if (t.type === "italic") return <em key={t.from}>{t.text}</em>;
        if (t.type === "strike") return <s key={t.from}>{t.text}</s>;
        return <React.Fragment key={t.from}>{t.text}</React.Fragment>;
      })}
    </>
  );
}

function PreviewLine({ block }: { block: MdBlock }) {
  switch (block.type) {
    case "heading":
      return (
        <p className="line-clamp-1 font-semibold text-on-surface">
          <Inline text={block.text} />
        </p>
      );
    case "task":
      return (
        <p className="flex items-start gap-2">
          <span
            className={cn(
              "mt-[3px] size-3.5 shrink-0 rounded-[4px] border-2",
              block.done ? "border-primary bg-primary" : "border-on-surface-variant",
            )}
          />
          <span className={cn("line-clamp-2 min-w-0", block.done && "line-through opacity-55")}>
            <Inline text={block.text} />
          </span>
        </p>
      );
    case "bullet":
    case "ordered":
      return (
        <p className="flex items-start gap-2">
          <span className="shrink-0 text-[var(--note-accent)]">{block.type === "bullet" ? "•" : `${block.n}.`}</span>
          <span className="line-clamp-2 min-w-0">
            <Inline text={block.text} />
          </span>
        </p>
      );
    case "quote":
      return (
        <p className="line-clamp-2 border-l-2 border-[var(--note-accent)] pl-2 italic">
          <Inline text={block.text} />
        </p>
      );
    case "hr":
      return <hr className="my-1 border-outline-variant" />;
    case "blank":
      return null;
    default:
      return (
        <p className="line-clamp-3 break-words">
          <Inline text={block.text} />
        </p>
      );
  }
}

/**
 * Náhled obsahu v kartě: prvních pár řádků tak, jak vypadají v poznámce -
 * úkoly s políčkem, odrážky s tečkou. Při hledání místo toho úryvek kolem
 * nálezu, ať je vidět, proč tu poznámka je.
 */
export function CardPreview({ note, query, lines }: { note: Note; query: string; lines: number }) {
  if (query.trim()) {
    const snippet = searchSnippet(note, query);
    if (!snippet) return null;
    return (
      <p className="line-clamp-4 break-words text-body-md text-on-surface-variant">
        <Marked text={snippet} query={query} />
      </p>
    );
  }

  let blocks = parseMarkdown(stripImageMarkers(note.text)).filter((b) => b.type !== "blank");
  // První řádek už je nadpisem karty, dvakrát pod sebou ho ukazovat nemá smysl.
  if (!note.title.trim() && !note.day) blocks = blocks.slice(1);
  if (blocks.length === 0) return null;
  const shown = blocks.slice(0, lines);

  return (
    // Bez `cn`: twMerge bere `text-body-md` za barvu a vedle `text-on-surface-variant` by ho zahodil.
    <div
      className={`flex flex-col gap-0.5 break-words text-body-md text-on-surface-variant ${blocks.length > lines ? "fade-mask-b" : ""}`}
    >
      {shown.map((b) => (
        <PreviewLine key={b.at} block={b} />
      ))}
    </div>
  );
}

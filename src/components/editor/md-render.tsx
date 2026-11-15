"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { parseInline, parseMarkdown, type MdBlock } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/**
 * Pozice ve zdrojovém textu pod prstem.
 *
 * Každý kus textu nese `data-from` - kde ve zdroji začíná jeho první viditelný
 * znak. Posun uvnitř textového uzlu se k němu jen přičte, takže kurzor sedne
 * přesně na klepnutý znak i za skrytou syntaxí (`**`, `- [ ] `).
 */
export function caretAtPoint(x: number, y: number): number | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let offset = 0;
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) {
    node = pos.offsetNode;
    offset = pos.offset;
  } else {
    const range = doc.caretRangeFromPoint?.(x, y);
    if (range) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const span = node.parentElement?.closest<HTMLElement>("[data-from]");
  return span ? Number(span.dataset.from) + offset : null;
}

/** Konec řádku pod klepnutím - když prst trefí okraj místo písmena. */
export function lineEndAt(target: EventTarget | null): number | null {
  const line = target instanceof Element ? target.closest<HTMLElement>("[data-end]") : null;
  return line ? Number(line.dataset.end) : null;
}

function Inline({ text, base, onOpenTag }: { text: string; base: number; onOpenTag: (tag: string) => void }) {
  return (
    <>
      {parseInline(text, base).map((t, i) => {
        switch (t.type) {
          case "bold":
            return <strong key={i} data-from={t.from} className="font-semibold">{t.text}</strong>;
          case "italic":
            return <em key={i} data-from={t.from}>{t.text}</em>;
          case "strike":
            return <s key={i} data-from={t.from}>{t.text}</s>;
          case "code":
            return <code key={i} data-from={t.from} className="md-code">{t.text}</code>;
          case "link":
            return (
              <a
                key={i}
                data-from={t.from}
                href={t.href}
                className="md-link"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(t.href, "_blank");
                }}
              >
                {t.text}
              </a>
            );
          case "tag":
            return (
              <button
                key={i}
                type="button"
                data-from={t.from}
                className="md-tag"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTag(t.tag);
                }}
              >
                {t.text}
              </button>
            );
          default:
            // text i `[[odkaz]]` - odkazy mezi poznámkami přijdou až v P1
            return <span key={i} data-from={t.from}>{t.text}</span>;
        }
      })}
    </>
  );
}

/** Odsazení vnořeného seznamu: dvě mezery = jedna úroveň. */
function indentStyle(indent: number): React.CSSProperties | undefined {
  const level = Math.floor(indent / 2);
  return level > 0 ? { marginLeft: `${level * 1.25}em` } : undefined;
}

function Block({
  block,
  onToggleTask,
  onOpenTag,
}: {
  block: MdBlock;
  onToggleTask: (at: number) => void;
  onOpenTag: (tag: string) => void;
}) {
  if (block.type === "hr") return <hr className="md-hr" />;
  // Prázdný řádek = mezera mezi odstavci, ne celý řádek vzduchu.
  if (block.type === "blank") return <div data-end={block.at} className="h-[0.75em]" />;

  const end = block.contentAt + block.text.length;
  const inline = <Inline text={block.text} base={block.contentAt} onOpenTag={onOpenTag} />;

  switch (block.type) {
    case "heading":
      return <div data-end={end} className={`md-h${block.level}`}>{inline}</div>;
    case "quote":
      return <div data-end={end} className="md-quote">{inline}</div>;
    case "task":
      return (
        <div data-end={end} className="md-task" style={indentStyle(block.indent)}>
          <button
            type="button"
            role="checkbox"
            aria-checked={block.done}
            aria-label={block.done ? "Odškrtnout" : "Zaškrtnout"}
            onClick={(e) => {
              // Zaškrtnutí nesmí přepnout do psaní ani vytáhnout klávesnici.
              e.stopPropagation();
              onToggleTask(block.at);
            }}
            className="md-check"
          >
            {block.done ? <Check className="anim-pop" /> : null}
          </button>
          <span className={cn("min-w-0 flex-1", block.done && "md-task-done")}>{inline}</span>
        </div>
      );
    case "bullet":
    case "ordered":
      // Tečku nebo číslo kreslí `.md-li::before`, odsazení řídí `--md-level`.
      return (
        <div
          data-end={end}
          data-n={block.type === "ordered" ? block.n : undefined}
          className="md-li"
          style={{ "--md-level": Math.floor(block.indent / 2) + 1 } as React.CSSProperties}
        >
          {inline}
        </div>
      );
    default:
      return <div data-end={end}>{inline}</div>;
  }
}

/**
 * Čtecí podoba jednoho textového kusu poznámky. Syntaxe se nekreslí, jen
 * její výsledek; zdroj zůstává v `text` beze změny (export 1:1).
 */
export function MdRender({
  text,
  base,
  onToggleTask,
  onOpenTag,
}: {
  text: string;
  /** Globální pozice začátku kusu - offsety bloků jsou pak absolutní. */
  base: number;
  onToggleTask: (at: number) => void;
  onOpenTag: (tag: string) => void;
}) {
  const blocks = React.useMemo(() => parseMarkdown(text, base), [text, base]);
  return (
    <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">
      {blocks.map((block) => (
        <Block key={block.at} block={block} onToggleTask={onToggleTask} onOpenTag={onOpenTag} />
      ))}
    </div>
  );
}

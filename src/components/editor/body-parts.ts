import { splitNoteBody } from "@/lib/inline-images";

/**
 * Kus těla poznámky: text mezi fotkami, nebo fotka sama.
 *
 * Textový kus nese přesný rozsah ve zdrojovém textu (`start`..`end`), aby se
 * úprava dala vrátit na své místo. Oddělovací `\n` kolem značky fotky do
 * rozsahu nepatří - značka `![](jméno)` musí zůstat na vlastním řádku (I6)
 * a v poli se nesmí dát smazat. Když oddělovač chybí (text začíná fotkou,
 * dvě fotky pod sebou), doplní ho `pre`/`post` při prvním napsaném znaku.
 *
 * Čisté funkce, žádný React - viz `body-parts.test.ts`.
 */
export type BodyPart =
  | { kind: "text"; start: number; end: number; pre: string; post: string }
  | { kind: "image"; name: string; alt: string; at: number };

export type TextPart = Extract<BodyPart, { kind: "text" }>;

export function bodyParts(text: string): BodyPart[] {
  const out: BodyPart[] = [];
  let cursor = 0;
  let afterImage = false;

  const gap = (until: number, beforeImage: boolean) => {
    let start = cursor;
    let end = until;
    let pre = "";
    let post = "";
    if (afterImage) {
      if (text[start] === "\n") start += 1;
      else pre = "\n";
    }
    if (beforeImage) {
      if (end > start && text[end - 1] === "\n") end -= 1;
      else post = "\n";
    }
    out.push({ kind: "text", start, end: Math.max(start, end), pre, post });
  };

  for (const block of splitNoteBody(text)) {
    if (block.kind !== "image") continue;
    gap(block.at, true);
    out.push({ kind: "image", name: block.name, alt: block.alt, at: block.at });
    // `![alt](name)` = 5 znaků obalu + alt + jméno.
    cursor = block.at + 5 + block.alt.length + block.name.length;
    afterImage = true;
  }
  gap(text.length, false);
  return out;
}

/** Vrátí upravený kus do celého textu. `offset` = posun lokálních pozic na globální. */
export function spliceText(text: string, part: TextPart, value: string): { text: string; offset: number } {
  const pre = value ? part.pre : "";
  const post = value ? part.post : "";
  return {
    text: `${text.slice(0, part.start)}${pre}${value}${post}${text.slice(part.end)}`,
    offset: part.start + pre.length,
  };
}

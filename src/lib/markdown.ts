/**
 * Markdown-lite: to málo markdownu, které se dá psát palcem.
 *
 * Text se dělí po řádcích, každý řádek je jeden blok - žádné víceřádkové
 * konstrukce, takže pozice v textu se dají přepočítat bez stromu. Každý
 * blok i kus textu nese absolutní pozici ve zdroji: ťuknutí do vykresleného
 * textu tak trefí kurzorem přesně ten znak, na který prst mířil.
 *
 * Čisté funkce, žádný React (viz `markdown.test.ts`).
 */
import { parseTask } from "./checklist";
import { normalizeTag } from "./notes";

export type MdBlock =
  | { type: "heading"; level: 1 | 2 | 3; at: number; contentAt: number; text: string }
  | { type: "task"; done: boolean; indent: number; at: number; contentAt: number; text: string }
  | { type: "bullet"; indent: number; at: number; contentAt: number; text: string }
  | { type: "ordered"; n: number; indent: number; at: number; contentAt: number; text: string }
  | { type: "quote"; at: number; contentAt: number; text: string }
  | { type: "hr"; at: number }
  | { type: "blank"; at: number }
  | { type: "paragraph"; at: number; contentAt: number; text: string };

function parseLine(line: string, at: number): MdBlock {
  if (!line.trim()) return { type: "blank", at };
  if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return { type: "hr", at };

  const heading = /^(#{1,3}) (.*)$/.exec(line);
  if (heading) {
    const level = heading[1].length as 1 | 2 | 3;
    return { type: "heading", level, at, contentAt: at + level + 1, text: heading[2] };
  }

  const task = parseTask(line);
  if (task) {
    const contentAt = at + line.length - task.body.length;
    return { type: "task", done: task.done, indent: task.indent, at, contentAt, text: task.body };
  }

  const bullet = /^(\s*)[-*] (.*)$/.exec(line);
  if (bullet) {
    const contentAt = at + line.length - bullet[2].length;
    return { type: "bullet", indent: bullet[1].length, at, contentAt, text: bullet[2] };
  }

  const ordered = /^(\s*)(\d+)\. (.*)$/.exec(line);
  if (ordered) {
    const contentAt = at + line.length - ordered[3].length;
    return { type: "ordered", n: Number(ordered[2]), indent: ordered[1].length, at, contentAt, text: ordered[3] };
  }

  const quote = /^\s*> ?(.*)$/.exec(line);
  if (quote) return { type: "quote", at, contentAt: at + line.length - quote[1].length, text: quote[1] };

  return { type: "paragraph", at, contentAt: at, text: line };
}

/** Jeden blok na řádek; `at` a `contentAt` jsou `base` + pozice v `text`. */
export function parseMarkdown(text: string, base = 0): MdBlock[] {
  const out: MdBlock[] = [];
  let at = base;
  for (const line of text.split("\n")) {
    out.push(parseLine(line, at));
    at += line.length + 1;
  }
  return out;
}

// --- uvnitř řádku -----------------------------------------------------------

export type MdInline =
  | { type: "text" | "bold" | "italic" | "strike" | "code"; text: string; from: number }
  | { type: "link"; text: string; href: string; from: number }
  | { type: "tag"; text: string; tag: string; from: number }
  | { type: "wikilink"; text: string; title: string; from: number };

/** Kus řádku i se značkami: `start..end` je celý zdroj, `from` první viditelný znak. */
type Span = MdInline & { start: number; end: number };

const PAIRS: { mark: string; type: "bold" | "strike" | "code" | "italic" }[] = [
  { mark: "`", type: "code" },
  { mark: "**", type: "bold" },
  { mark: "~~", type: "strike" },
  { mark: "_", type: "italic" },
];

const WORD = /[\p{L}\p{N}]/u;
// Lepkavé (`y`): hledají přesně od `lastIndex`, bez kopírování zbytku řádku.
const TAG = /#(\p{L}[\p{L}\p{N}_/-]*)/uy;
const URL = /https?:\/\/\S+/y;

function stickyExec(re: RegExp, text: string, at: number): RegExpExecArray | null {
  re.lastIndex = at;
  return re.exec(text);
}

/**
 * Rozseká řádek na souvislé kusy - jejich zdroje dají dohromady přesně
 * vstup. Značky se nevnořují: tučný text uvnitř je prostý text. Neuzavřená
 * značka (`**bez konce`) zůstane obyčejným textem.
 */
function spans(text: string, base: number): Span[] {
  const out: Span[] = [];
  let plainStart = 0;
  let i = 0;

  const flush = (until: number) => {
    if (until > plainStart) {
      out.push({ type: "text", text: text.slice(plainStart, until), from: base + plainStart, start: plainStart, end: until });
    }
  };
  const push = (span: Span) => {
    flush(span.start);
    out.push(span);
    i = plainStart = span.end;
  };

  while (i < text.length) {
    const prev = i > 0 ? text[i - 1] : "";

    if (text.startsWith("[[", i)) {
      const close = text.indexOf("]]", i + 2);
      if (close > i + 2) {
        const title = text.slice(i + 2, close);
        push({ type: "wikilink", text: title, title, from: base + i + 2, start: i, end: close + 2 });
        continue;
      }
    }

    if (!WORD.test(prev)) {
      const url = stickyExec(URL, text, i);
      if (url) {
        const href = url[0].replace(/[.,;:!?)]+$/, "");
        push({ type: "link", text: href, href, from: base + i, start: i, end: i + href.length });
        continue;
      }
    }

    if (text[i] === "#" && (prev === "" || /[\s(]/.test(prev))) {
      const tag = stickyExec(TAG, text, i);
      if (tag) {
        push({ type: "tag", text: tag[0], tag: normalizeTag(tag[1]), from: base + i, start: i, end: i + tag[0].length });
        continue;
      }
    }

    const pair = PAIRS.find((p) => text.startsWith(p.mark, i));
    // "_" uprostřed slova (snake_case) kurzívu nezačíná.
    if (pair && !(pair.type === "italic" && WORD.test(prev))) {
      const m = pair.mark.length;
      const close = text.indexOf(pair.mark, i + m);
      const after = text[close + m] ?? "";
      if (close > i + m && !(pair.type === "italic" && WORD.test(after))) {
        push({ type: pair.type, text: text.slice(i + m, close), from: base + i + m, start: i, end: close + m });
        continue;
      }
    }
    i++;
  }
  flush(text.length);
  return out;
}

/** Kusy řádku pro vykreslení; `from` je absolutní pozice prvního viditelného znaku. */
export function parseInline(text: string, base = 0): MdInline[] {
  return spans(text, base).map(({ start: _s, end: _e, ...token }) => token as MdInline);
}

// --- obarvení v editoru -----------------------------------------------------

export type EdClass =
  | ""
  | "ed-marker"
  | "ed-heading"
  | "ed-done"
  | "ed-tag"
  | "ed-link"
  | "ed-bold"
  | "ed-italic"
  | "ed-code"
  | "ed-quote";

const INLINE_CLASS: Record<MdInline["type"], EdClass> = {
  text: "",
  bold: "ed-bold",
  italic: "ed-italic",
  strike: "ed-done",
  code: "ed-code",
  link: "ed-link",
  tag: "ed-tag",
  wikilink: "",
};

/**
 * Řádek rozdělený na kusy s třídou pro zrcadlo pod textovým polem. Spojené
 * kusy dají přesně původní řádek - jinak by se zrcadlo a kurzor rozjely.
 */
export function highlightLine(line: string): { text: string; cls: EdClass }[] {
  const out: { text: string; cls: EdClass }[] = [];
  const add = (text: string, cls: EdClass) => {
    if (text) out.push({ text, cls });
  };
  const inline = (text: string, plain: EdClass) => {
    for (const s of spans(text, 0)) {
      const visibleEnd = s.from + s.text.length;
      add(text.slice(s.start, s.from), "ed-marker");
      add(s.text, s.type === "text" ? plain : INLINE_CLASS[s.type]);
      add(text.slice(visibleEnd, s.end), "ed-marker");
    }
  };

  const block = parseLine(line, 0);
  switch (block.type) {
    case "blank":
      add(line, "");
      break;
    case "hr":
      add(line, "ed-marker");
      break;
    case "heading":
      add(line.slice(0, block.contentAt), "ed-marker");
      add(block.text, "ed-heading");
      break;
    case "task":
      add(line.slice(0, block.indent), "");
      add(line.slice(block.indent, block.contentAt), "ed-marker");
      if (block.done) add(block.text, "ed-done");
      else inline(block.text, "");
      break;
    case "bullet":
    case "ordered":
      add(line.slice(0, block.indent), "");
      add(line.slice(block.indent, block.contentAt), "ed-marker");
      inline(block.text, "");
      break;
    case "quote":
      add(line.slice(0, block.contentAt), "ed-marker");
      inline(block.text, "ed-quote");
      break;
    default:
      inline(line, "");
  }
  return out;
}

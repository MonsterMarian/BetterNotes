/**
 * Úkoly a formátování uvnitř textu poznámky.
 *
 * Seznam není zvláštní typ poznámky: úkol je obyčejný řádek `- [ ] mléko`
 * a hotový `- [x] mléko`. Text tak zůstává jediným zdrojem pravdy, export
 * je markdown jedna ku jedné a poznámka může míchat odstavce s úkoly.
 *
 * Čisté funkce nad textem a pozicemi v něm - žádný React, žádný DOM.
 */

export interface TaskLine {
  indent: number;
  done: boolean;
  body: string;
}

const TASK = /^(\s*)[-*] \[( |x|X)\] ?(.*)$/;

export function parseTask(line: string): TaskLine | null {
  const m = TASK.exec(line);
  return m ? { indent: m[1].length, done: m[2] !== " ", body: m[3] } : null;
}

/** Začátek a konec řádku, na kterém leží pozice (bez znaku konce řádku). */
export function lineRangeAt(text: string, offset: number): { start: number; end: number } {
  const at = Math.max(0, Math.min(offset, text.length));
  const start = text.lastIndexOf("\n", at - 1) + 1;
  const next = text.indexOf("\n", at);
  return { start, end: next === -1 ? text.length : next };
}

/** Index řádku, na kterém leží pozice. */
function lineIndexAt(text: string, offset: number): number {
  return text.slice(0, lineRangeAt(text, offset).start).split("\n").length - 1;
}

/**
 * Zaškrtne nebo odškrtne úkol na řádku s pozicí `offset`.
 *
 * S `sink` hotový úkol sjede na konec souvislého bloku úkolů (stejné
 * odsazení) a odškrtnutý se vrátí nad první hotový - nákupní seznam tak má
 * nahoře pořád to, co ještě chybí.
 */
export function toggleTaskAt(text: string, offset: number, sink: boolean): string {
  const lines = text.split("\n");
  const index = lineIndexAt(text, offset);
  const task = parseTask(lines[index]);
  if (!task) return text;

  const toggled = lines[index].replace(/\[( |x|X)\]/, task.done ? "[ ]" : "[x]");
  lines[index] = toggled;
  if (!sink) return lines.join("\n");

  const sameRun = (i: number) => parseTask(lines[i] ?? "")?.indent === task.indent;
  let first = index;
  while (first > 0 && sameRun(first - 1)) first--;
  let last = index;
  while (last < lines.length - 1 && sameRun(last + 1)) last++;

  const run = lines.slice(first, last + 1);
  run.splice(index - first, 1);
  // Hotový jde na konec; vrácený těsně před první hotový (nebo na konec).
  const firstDone = run.findIndex((l) => parseTask(l)?.done);
  const target = !task.done || firstDone === -1 ? run.length : firstDone;
  run.splice(target, 0, toggled);
  lines.splice(first, run.length, ...run);
  return lines.join("\n");
}

export function taskStats(text: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const line of text.split("\n")) {
    const task = parseTask(line);
    if (!task) continue;
    total++;
    if (task.done) done++;
  }
  return { done, total };
}

export function uncheckAll(text: string): string {
  return text
    .split("\n")
    .map((line) => (parseTask(line)?.done ? line.replace(/\[(x|X)\]/, "[ ]") : line))
    .join("\n");
}

export function removeChecked(text: string): string {
  return text
    .split("\n")
    .filter((line) => !parseTask(line)?.done)
    .join("\n");
}

// --- formátování při psaní --------------------------------------------------

/** Odsazení, značka seznamu a zbytek řádku. */
const LIST_ITEM = /^(\s*)([-*] \[[ xX]\](?: |$)|[-*] |\d+\. |> ?)(.*)$/;

/** Značka, kterou pokračuje další řádek seznamu. */
function nextMarker(marker: string): string {
  if (marker.includes("[")) return `${marker[0]} [ ] `;
  const n = /^(\d+)\./.exec(marker);
  if (n) return `${Number(n[1]) + 1}. `;
  if (marker.startsWith(">")) return "> ";
  return marker;
}

/**
 * Formátování po každé úpravě textu. Pracuje z rozdílu starého a nového
 * textu, ne z kláves - Android klávesnice s našeptávačem (IME) keydown
 * neposílá spolehlivě.
 *
 * (a) Enter za položkou seznamu přidá další položku stejného druhu.
 * (b) Enter za prázdnou položkou seznam ukončí - značka zmizí.
 * (c) Řádek "[] " nebo "[ ] " se změní na úkol, "* " na odrážku.
 */
export function autoFormat(
  prev: string,
  next: string,
  caret: number,
): { text: string; caret: number } | null {
  if (next.length !== prev.length + 1 || caret < 1) return null;
  const inserted = next[caret - 1];
  // Jen když jde opravdu o jeden vložený znak na místě kurzoru.
  if (next.slice(0, caret - 1) !== prev.slice(0, caret - 1) || next.slice(caret) !== prev.slice(caret - 1)) {
    return null;
  }

  const lineStart = next.lastIndexOf("\n", caret - 2) + 1;

  if (inserted === "\n") {
    const m = LIST_ITEM.exec(next.slice(lineStart, caret - 1));
    if (!m) return null;
    const [, indent, marker, body] = m;
    const restEnd = next.indexOf("\n", caret);
    const rest = next.slice(caret, restEnd === -1 ? next.length : restEnd);
    if (!body.trim() && !rest.trim()) {
      // Prázdná položka: pryč se značkou i s novým řádkem, kurzor zůstává.
      return { text: next.slice(0, lineStart) + next.slice(caret), caret: lineStart };
    }
    const prefix = indent + nextMarker(marker);
    return { text: next.slice(0, caret) + prefix + next.slice(caret), caret: caret + prefix.length };
  }

  if (inserted === " ") {
    const head = next.slice(lineStart, caret);
    const m = /^(\s*)(\[ ?\]|\*) $/.exec(head);
    if (!m) return null;
    const prefix = m[1] + (m[2] === "*" ? "- " : "- [ ] ");
    return { text: next.slice(0, lineStart) + prefix + next.slice(caret), caret: lineStart + prefix.length };
  }
  return null;
}

// --- tlačítka lišty ---------------------------------------------------------

export type LineKind = "task" | "bullet" | "ordered" | "quote" | "h1" | "h2" | "h3";

const LINE_PREFIX = /^(\s*)([-*] \[[ xX]\](?: |$)|[-*] |\d+\. |> ?|#{1,3} )?/;

function prefixKind(prefix: string | undefined): LineKind | null {
  if (!prefix) return null;
  if (prefix.includes("[")) return "task";
  if (prefix[0] === "-" || prefix[0] === "*") return "bullet";
  if (prefix[0] === ">") return "quote";
  if (prefix[0] === "#") return `h${prefix.trim().length}` as LineKind;
  return "ordered";
}

function makePrefix(kind: LineKind, n: number): string {
  switch (kind) {
    case "task":
      return "- [ ] ";
    case "bullet":
      return "- ";
    case "ordered":
      return `${n}. `;
    case "quote":
      return "> ";
    default:
      return `${"#".repeat(Number(kind[1]))} `;
  }
}

/**
 * Přepne druh řádku u všech řádků výběru. Když už ho mají všechny, sundá ho;
 * jinak ho nasadí a cizí značku (odrážka -> úkol) nahradí.
 */
export function toggleLinePrefix(
  text: string,
  start: number,
  end: number,
  kind: LineKind,
): { text: string; start: number; end: number } {
  const from = lineRangeAt(text, start).start;
  const to = lineRangeAt(text, end).end;
  const lines = text.slice(from, to).split("\n");
  // Ve víceřádkovém výběru prázdné řádky nedostanou značku, ať se nerozbije odstavec.
  const skip = (l: string) => lines.length > 1 && !l.trim();
  const parsed = lines.map((l) => {
    const m = LINE_PREFIX.exec(l)!;
    return { indent: m[1], prefix: m[2] ?? "", rest: l.slice(m[0].length) };
  });
  const off = parsed.every((p, i) => skip(lines[i]) || prefixKind(p.prefix) === kind);

  let n = 0;
  const out = parsed.map((p, i) => {
    if (skip(lines[i])) return lines[i];
    n++;
    return p.indent + (off ? "" : makePrefix(kind, n)) + p.rest;
  });

  const firstDelta = out[0].length - lines[0].length;
  const totalDelta = out.join("\n").length - (to - from);
  const nextStart = Math.max(from, start + firstDelta);
  return {
    text: text.slice(0, from) + out.join("\n") + text.slice(to),
    start: nextStart,
    end: Math.max(nextStart, end + totalDelta),
  };
}

/**
 * Obalí výběr značkou (tučně, kurzíva, ...). Prázdný výběr vloží pár značek
 * s kurzorem mezi nimi; už obalený výběr se naopak rozbalí.
 */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  mark: "**" | "_" | "~~" | "`",
): { text: string; start: number; end: number } {
  const m = mark.length;
  const selected = text.slice(start, end);
  const outside = text.slice(start - m, start) === mark && text.slice(end, end + m) === mark;

  if (start > end || (start === end && !outside)) {
    const at = Math.min(start, end);
    return { text: text.slice(0, at) + mark + mark + text.slice(at), start: at + m, end: at + m };
  }
  if (outside) {
    return {
      text: text.slice(0, start - m) + selected + text.slice(end + m),
      start: start - m,
      end: end - m,
    };
  }
  if (selected.length >= 2 * m && selected.startsWith(mark) && selected.endsWith(mark)) {
    return {
      text: text.slice(0, start) + selected.slice(m, -m) + text.slice(end),
      start,
      end: end - 2 * m,
    };
  }
  return {
    text: text.slice(0, start) + mark + selected + mark + text.slice(end),
    start: start + m,
    end: end + m,
  };
}

/** Ťuknutí v editoru dopadlo do "- [ ]" úkolu - má se zaškrtnout, ne psát. */
export function taskMarkerHit(text: string, offset: number): boolean {
  const { start, end } = lineRangeAt(text, offset);
  const task = parseTask(text.slice(start, end));
  if (!task) return false;
  const markerStart = start + task.indent;
  return offset >= markerStart && offset <= markerStart + 5;
}

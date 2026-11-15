/**
 * Hledání: rozbor dotazu, řazení výsledků a zvýraznění nálezů.
 *
 * Vše bez diakritiky a bez ohledu na velikost ("zlut" najde "Žluťoučký"),
 * ale zvýraznění se vrací v pozicích PŮVODNÍHO textu - jinak by `<mark>`
 * v textu s háčky ujížděl.
 */
import { stripImageMarkers } from "./inline-images";
import { fold, normalizeTag, noteTags, noteTitle } from "./notes";
import type { Note } from "./types";

export interface ParsedQuery {
  words: string[];
  tags: string[];
}

/** "#nakup mleko" -> slova ["mleko"], štítky ["nakup"]; obojí složené přes `fold`. */
export function parseQuery(q: string): ParsedQuery {
  const words: string[] = [];
  const tags: string[] = [];
  for (const token of q.split(/\s+/)) {
    if (!token) continue;
    if (token.startsWith("#")) {
      const tag = fold(normalizeTag(token));
      if (tag) tags.push(tag);
    } else {
      words.push(stem(fold(token)));
    }
  }
  return { words, tags };
}

/**
 * Hrubý český kmen: čeština skloňuje koncovkou, takže "maslo" musí najít
 * "máslem" a "rohliky" "rohlík". Delší slovo přijde o koncovku, krátké
 * zůstane celé - z "pes" by "pe" našlo půl slovníku.
 */
function stem(word: string): string {
  if (word.length >= 8) return word.slice(0, -2);
  if (word.length >= 5) return word.slice(0, -1);
  return word;
}

/** Text poznámky bez značek fotek a bez značek seznamů - jen to, co člověk čte. */
function plainBody(text: string): string {
  return stripImageMarkers(text)
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*] \[[ xX]\] ?|[-*] |\d+\. |> ?|#{1,3} )/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pořadí výsledků: slovo v titulku váží 3, ve štítku 2, v textu 1. Při
 * shodě vyhrává čerstvější poznámka.
 */
export function rankNotes(notes: Note[], query: string): Note[] {
  const { words } = parseQuery(query);
  const score = (n: Note): number => {
    const title = fold(noteTitle(n));
    const tags = fold(noteTags(n).join(" "));
    const body = fold(stripImageMarkers(n.text));
    return words.reduce(
      (sum, w) => sum + (title.includes(w) ? 3 : 0) + (tags.includes(w) ? 2 : 0) + (body.includes(w) ? 1 : 0),
      0,
    );
  };
  const scored = notes.map((n) => ({ n, s: score(n) }));
  scored.sort((a, b) => b.s - a.s || b.n.updatedAt.localeCompare(a.n.updatedAt));
  return scored.map((x) => x.n);
}

/** Složený text a ke každému jeho znaku pozice v originále. */
function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    const f = fold(ch);
    folded += f;
    for (let k = 0; k < f.length; k++) map.push(i);
    i += ch.length;
  }
  map.push(i);
  return { folded, map };
}

/** Rozsahy `[od, do)` nálezů slov dotazu v originálním textu, seřazené a sloučené. */
export function highlightRanges(text: string, query: string): [number, number][] {
  const { words } = parseQuery(query);
  if (words.length === 0) return [];
  const { folded, map } = foldWithMap(text);
  const ranges: [number, number][] = [];
  for (const w of words) {
    for (let at = folded.indexOf(w); at !== -1; at = folded.indexOf(w, at + 1)) {
      // Konec = začátek znaku za nálezem, ať se složený znak nerozpůlí.
      ranges.push([map[at], map[at + w.length]]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/**
 * Úryvek textu kolem prvního nálezu, se "…" tam, kde je text uříznutý.
 * Když se slovo našlo jen v titulku nebo štítku, je to začátek textu.
 */
export function searchSnippet(note: Note, query: string, radius = 40): string {
  // Bez titulku je první řádek názvem karty - v úryvku by se opakoval dvakrát.
  const text = note.title.trim() || note.day ? note.text : note.text.replace(/^\s*[^\n]*\n?/, "");
  const body = plainBody(text);
  const first = highlightRanges(body, query)[0];
  const [hitStart, hitEnd] = first ?? [0, 0];
  const start = first ? Math.max(0, hitStart - radius) : 0;
  const end = Math.min(body.length, first ? hitEnd + radius : radius * 2);
  return `${start > 0 ? "…" : ""}${body.slice(start, end).trim()}${end < body.length ? "…" : ""}`;
}

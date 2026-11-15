/**
 * Pravidla zápisníku. Čisté funkce nad stavem - žádný React, žádné úložiště,
 * takže se dají otestovat bez prohlížeče (viz `notes.test.ts`).
 *
 * Každá změna vrací nový stav. Poznámky se nikdy nemění na místě, jinak by
 * React neviděl, že se něco stalo.
 */
import { taskStats } from "./checklist";
import { dayTitle } from "./date";
import { stripImageMarkers } from "./inline-images";
import { parseQuery, rankNotes } from "./search";
import { createId } from "./utils";
import {
  EMPTY_STATE,
  type BetterNotesState,
  type ISODate,
  type ISOStamp,
  type Note,
  type NoteTone,
} from "./types";

export function nowStamp(now: Date = new Date()): ISOStamp {
  return now.toISOString();
}

// --- čtení ------------------------------------------------------------------

export function findNote(state: BetterNotesState, id: string): Note | undefined {
  return state.notes.find((n) => n.id === id);
}

/** Poznámky mimo koš. Skoro všechno v appce pracuje s tímhle. */
export function liveNotes(state: BetterNotesState): Note[] {
  return state.notes.filter((n) => !n.deletedAt);
}

export function trashedNotes(state: BetterNotesState): Note[] {
  return state.notes.filter((n) => n.deletedAt);
}

/** Hlavní obrazovka: mimo koš a mimo archiv. */
export function activeNotes(state: BetterNotesState): Note[] {
  return state.notes.filter((n) => !n.deletedAt && !n.archivedAt);
}

export function archivedNotes(state: BetterNotesState): Note[] {
  return state.notes.filter((n) => !n.deletedAt && n.archivedAt);
}

/** Denní poznámka pro daný den - jedna na den, i když leží v archivu. */
export function findDailyNote(state: BetterNotesState, day: ISODate): Note | undefined {
  return liveNotes(state).find((n) => n.day === day);
}

/** Značka seznamu nebo nadpisu na začátku řádku - do titulku nepatří. */
const LINE_MARKUP = /^\s*(?:[-*] \[[ xX]\]|[-*]|\d+\.|>|#{1,3})(?:\s+|$)/;

/** "**tučně** a _kurzíva_" -> "tučně a kurzíva": titulek karty se kreslí jako prostý text. */
function stripInlineMarkup(line: string): string {
  return line
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/(^|[^\p{L}\p{N}])[*_](?=\S)(.+?)(?<=\S)[*_](?![\p{L}\p{N}])/gu, "$1$2");
}

/**
 * Jméno poznámky do seznamu. Prázdný titulek nahradí první neprázdný řádek
 * textu - poznámku psanou ve spěchu tak jde v seznamu poznat.
 */
export function noteTitle(note: Note): string {
  const title = note.title.trim();
  if (title) return title;
  if (note.day) return dayTitle(note.day);
  // Značka fotky není text poznámky - jako název by z ní bylo "![](img_3.jpg)".
  // Stejně tak "- [ ]" před první položkou nákupu.
  const firstLine = stripImageMarkers(note.text)
    .split("\n")
    .map((l) => stripInlineMarkup(l.replace(LINE_MARKUP, "")).trim())
    .find((l) => l.length > 0);
  if (firstLine) return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
  return note.images.length > 0 ? "Fotka" : "Bez názvu";
}

/**
 * Náhled do seznamu. Vynechává řádek, který si vzal titulek, aby se text
 * v kartě neopakoval dvakrát pod sebou.
 */
export function noteExcerpt(note: Note, limit = 140): string {
  const lines = stripImageMarkers(note.text)
    .split("\n")
    .map((l) => stripInlineMarkup(l.replace(LINE_MARKUP, "")).trim());
  const skipFirst = !note.title.trim() && !note.day;
  const body = (skipFirst ? lines.slice(lines.findIndex((l) => l.length > 0) + 1) : lines)
    .filter((l) => l.length > 0)
    .join(" ");
  return body.length > limit ? `${body.slice(0, limit)}…` : body;
}

/**
 * Prázdná = nic napsaného. Osamělá značka seznamu ("- [ ] " z rychlého
 * založení seznamu) se za obsah nepočítá - opuštěný seznam se zahodí.
 */
export function isEmptyNote(note: Note): boolean {
  const blank = note.text
    .split("\n")
    .every((l) => /^\s*(?:[-*](?: \[[ xX]\])?|\d+\.|>|#{1,3})?\s*$/.test(l));
  return !note.title.trim() && blank && note.images.length === 0;
}

// --- štítky -----------------------------------------------------------------

/** "#Nákup " -> "nakup". Prázdný výsledek znamená, že štítek nevznikne. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 24);
}

/**
 * `#štítky` napsané přímo v textu. Nadpis "# Nadpis" (mezera za mřížkou)
 * ani kotva v odkazu (`/#sekce`, bez mezery před mřížkou) štítek nejsou.
 */
export function extractHashtags(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(^|[\s(])#(\p{L}[\p{L}\p{N}_\/-]*)/gu)) {
    const tag = normalizeTag(m[2]);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

/** Štítky poznámky: přidané ručně a pak ty z textu, bez opakování. */
export function noteTags(note: Note): string[] {
  return [...new Set([...note.tags, ...extractHashtags(note.text)])];
}

/** Filtr "prace" sedí i na vnořený "prace/projekt". */
export function tagMatches(noteTag: string, filter: string): boolean {
  return noteTag === filter || noteTag.startsWith(`${filter}/`);
}

/** Všechny štítky v appce s počtem použití, od nejčastějšího. */
export function tagCounts(state: BetterNotesState): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const note of liveNotes(state)) {
    for (const tag of noteTags(note)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "cs"));
}

// --- hledání a řazení -------------------------------------------------------

/** Hledá se bez diakritiky a bez ohledu na velikost - "zitra" najde "Zítra". */
export function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Dotaz se rozpadne na slova a poznámka musí sedět na všechna. Hledá se
 * v titulku, textu i štítcích, takže "nakup mleko" najde poznámku se
 * štítkem `nakup` a slovem "mléko" v textu. Slovo s mřížkou (`#prace`)
 * hledá jen mezi štítky.
 */
export function matchesQuery(note: Note, query: string): boolean {
  const { words, tags } = parseQuery(query);
  if (words.length === 0 && tags.length === 0) return true;
  const own = noteTags(note).map(fold);
  if (!tags.every((t) => own.some((o) => tagMatches(o, t)))) return false;
  // Jména souborů se nehledají - "img" by jinak našlo každou poznámku s fotkou.
  const haystack = fold(`${noteTitle(note)} ${stripImageMarkers(note.text)}`) + ` ${own.join(" ")}`;
  return words.every((w) => haystack.includes(w));
}

export type SortOrder = "updated" | "created" | "title";

export const SORT_ORDERS: { id: SortOrder; label: string }[] = [
  { id: "updated", label: "Naposledy upravené" },
  { id: "created", label: "Nejnovější" },
  { id: "title", label: "Podle názvu" },
];

/**
 * Připnuté poznámky jdou vždycky nahoru, uvnitř skupin platí zvolené řazení.
 * Kdyby se připnutí jen zvýrazňovalo, na dlouhém seznamu by nebylo k ničemu.
 */
export function sortNotes(notes: Note[], order: SortOrder): Note[] {
  const by = (a: Note, b: Note): number => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (order === "title") return noteTitle(a).localeCompare(noteTitle(b), "cs");
    if (order === "created") return b.createdAt.localeCompare(a.createdAt);
    return b.updatedAt.localeCompare(a.updatedAt);
  };
  return [...notes].sort(by);
}

export type QuickFilter = "all" | "pinned" | "todo" | "photos" | "untagged";

export const QUICK_FILTERS: { id: QuickFilter; label: string }[] = [
  { id: "all", label: "Vše" },
  { id: "pinned", label: "Připnuté" },
  { id: "todo", label: "Úkoly" },
  { id: "photos", label: "S fotkou" },
  { id: "untagged", label: "Bez štítku" },
];

const QUICK: Record<QuickFilter, (n: Note) => boolean> = {
  all: () => true,
  pinned: (n) => n.pinned,
  todo: (n) => {
    const { done, total } = taskStats(n.text);
    return done < total;
  },
  photos: (n) => n.images.length > 0,
  untagged: (n) => noteTags(n).length === 0,
};

export interface NoteFilter {
  query?: string;
  tag?: string | null;
  order?: SortOrder;
  quick?: QuickFilter;
  tone?: NoteTone | null;
  scope?: "active" | "archive";
}

/**
 * Seznam poznámek pro obrazovku: rozsah, filtry a řazení naráz. Hledání na
 * hlavní obrazovce prohledá i archiv - archivovat nemá znamenat ztratit.
 * S dotazem se řadí podle shody, jinak podle zvoleného řazení.
 */
export function visibleNotes(state: BetterNotesState, filter: NoteFilter = {}): Note[] {
  const { query = "", tag = null, order = "updated", quick = "all", tone = null, scope = "active" } = filter;
  const hasWords = parseQuery(query).words.length > 0;
  const pool =
    scope === "archive" ? archivedNotes(state) : hasWords ? liveNotes(state) : activeNotes(state);
  const found = pool.filter(
    (n) =>
      QUICK[quick](n) &&
      (!tone || n.tone === tone) &&
      (!tag || noteTags(n).some((t) => tagMatches(t, tag))) &&
      matchesQuery(n, query),
  );
  return hasWords ? rankNotes(found, query) : sortNotes(found, order);
}

// --- změny ------------------------------------------------------------------

export function emptyNote(now: Date = new Date()): Note {
  const stamp = nowStamp(now);
  return {
    id: createId("note"),
    title: "",
    text: "",
    images: [],
    tags: [],
    tone: "none",
    pinned: false,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function addNote(
  state: BetterNotesState,
  patch: Partial<Note> = {},
  now: Date = new Date(),
): { state: BetterNotesState; note: Note } {
  const note = { ...emptyNote(now), ...patch };
  return { state: { ...state, notes: [note, ...state.notes] }, note };
}

/**
 * Změna obsahu poznámky. `updatedAt` se posouvá jen u skutečného obsahu -
 * připnutí ani přesun do koše není úprava textu a nemá poznámku vystřelit
 * na začátek seznamu.
 */
export const CONTENT_KEYS = ["title", "text", "images", "tags", "tone"] as const;

export function updateNote(
  state: BetterNotesState,
  id: string,
  patch: Partial<Note>,
  now: Date = new Date(),
): BetterNotesState {
  const touchesContent = CONTENT_KEYS.some((k) => k in patch);
  return {
    ...state,
    notes: state.notes.map((n) =>
      n.id === id
        ? { ...n, ...patch, updatedAt: touchesContent ? nowStamp(now) : n.updatedAt }
        : n,
    ),
  };
}

export function togglePin(state: BetterNotesState, id: string): BetterNotesState {
  const note = findNote(state, id);
  if (!note) return state;
  return updateNote(state, id, { pinned: !note.pinned });
}

export function addTag(state: BetterNotesState, id: string, raw: string): BetterNotesState {
  const tag = normalizeTag(raw);
  const note = findNote(state, id);
  if (!tag || !note || note.tags.includes(tag)) return state;
  return updateNote(state, id, { tags: [...note.tags, tag] });
}

export function removeTag(state: BetterNotesState, id: string, tag: string): BetterNotesState {
  const note = findNote(state, id);
  if (!note) return state;
  return updateNote(state, id, { tags: note.tags.filter((t) => t !== tag) });
}

/** Poznámka bez daného metadata (archiv, koš). Klíč zmizí úplně, ne jako `undefined`. */
function dropKey(state: BetterNotesState, id: string, key: "deletedAt" | "archivedAt"): BetterNotesState {
  return {
    ...state,
    notes: state.notes.map((n) => {
      if (n.id !== id || !(key in n)) return n;
      const { [key]: _dropped, ...rest } = n;
      return rest;
    }),
  };
}

/** Do koše, ne z disku - vrátit se dá do vysypání. Z archivu jde rovnou do koše. */
export function trashNote(
  state: BetterNotesState,
  id: string,
  now: Date = new Date(),
): BetterNotesState {
  return dropKey(updateNote(state, id, { deletedAt: nowStamp(now), pinned: false }), id, "archivedAt");
}

export function restoreNote(state: BetterNotesState, id: string): BetterNotesState {
  return dropKey(state, id, "deletedAt");
}

/** Do archivu: z hlavní obrazovky pryč, hledání ji najde. Odepíná se jako koš. */
export function archiveNote(
  state: BetterNotesState,
  id: string,
  now: Date = new Date(),
): BetterNotesState {
  return updateNote(state, id, { archivedAt: nowStamp(now), pinned: false });
}

export function unarchiveNote(state: BetterNotesState, id: string): BetterNotesState {
  return dropKey(state, id, "archivedAt");
}

/**
 * Vrátí poznámky přesně v podobě ze snímku (Zpět po smazání, archivaci...).
 * Celé objekty včetně razítek - vrácená poznámka nesmí vyskočit nahoru.
 * Poznámka, která ve stavu už není, se vloží na začátek.
 */
export function putNotes(state: BetterNotesState, notes: Note[]): BetterNotesState {
  if (notes.length === 0) return state;
  const byId = new Map(notes.map((n) => [n.id, n]));
  const kept = state.notes.map((n) => byId.get(n.id) ?? n);
  const present = new Set(state.notes.map((n) => n.id));
  const added = notes.filter((n) => !present.has(n.id));
  return { ...state, notes: [...added, ...kept] };
}

/**
 * Zahodí poznámky, do kterých uživatel nic nenapsal.
 *
 * Založit poznámku je jedno ťuknutí a couvnout druhé, takže prázdné skořápky
 * vznikají běžně. Do koše nepatří - tam by z nich byl jen nepořádek, který
 * se musí ručně vysypat. Volá se z obrazovky seznamu, kdy se žádná poznámka
 * needituje a prázdná tedy znamená opuštěná.
 */
export function dropEmptyNotes(state: BetterNotesState): BetterNotesState {
  const kept = state.notes.filter((n) => n.deletedAt || !isEmptyNote(n));
  return kept.length === state.notes.length ? state : { ...state, notes: kept };
}

/** Nenávratné smazání. Vrací i jména fotek, aby po nich volající uklidil. */
export function purgeNote(
  state: BetterNotesState,
  id: string,
): { state: BetterNotesState; images: string[] } {
  const note = findNote(state, id);
  return {
    state: { ...state, notes: state.notes.filter((n) => n.id !== id) },
    images: note?.images ?? [],
  };
}

export function emptyTrash(state: BetterNotesState): {
  state: BetterNotesState;
  images: string[];
} {
  const gone = trashedNotes(state);
  return {
    state: { ...state, notes: liveNotes(state) },
    images: gone.flatMap((n) => n.images),
  };
}

/**
 * Fotky, na které už žádná poznámka neukazuje. Soubory přežijí smazání
 * poznámky i pád appky uprostřed úpravy, takže je musí něco posbírat.
 */
export function orphanImages(state: BetterNotesState, stored: string[]): string[] {
  const used = new Set(state.notes.flatMap((n) => n.images));
  return stored.filter((name) => !used.has(name));
}

export function noteCount(state: BetterNotesState): number {
  return liveNotes(state).length;
}

export { EMPTY_STATE, type BetterNotesState, type Note, type NoteTone };

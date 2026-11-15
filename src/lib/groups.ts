/**
 * Seznam poznámek rozdělený podle času ("Dnes", "Včera", ...) a rozložení
 * mřížky do dvou sloupců bez děr.
 */
import { taskStats } from "./checklist";
import { addDays, toISODate, weekStart } from "./date";
import { noteExcerpt, noteTitle, type SortOrder } from "./notes";
import type { Note } from "./types";

export interface NoteGroup {
  key: string;
  label: string;
  notes: Note[];
}

const MONTHS = [
  "Leden",
  "Únor",
  "Březen",
  "Duben",
  "Květen",
  "Červen",
  "Červenec",
  "Srpen",
  "Září",
  "Říjen",
  "Listopad",
  "Prosinec",
];

/** Skupina podle lokálního dne; budoucí razítko (posunuté hodiny) je "Dnes". */
function dateGroup(stamp: string, now: Date): { key: string; label: string } {
  const d = new Date(stamp);
  const day = toISODate(d);
  const today = toISODate(now);
  if (day >= today) return { key: "today", label: "Dnes" };
  if (day === addDays(today, -1)) return { key: "yesterday", label: "Včera" };
  if (day >= weekStart(today)) return { key: "week", label: "Tento týden" };
  if (day.slice(0, 7) === today.slice(0, 7)) return { key: "month", label: "Tento měsíc" };
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return {
    key: day.slice(0, 7),
    label: year === now.getFullYear() ? month : `${month} ${year}`,
  };
}

/**
 * Skupiny v pořadí, v jakém přišly seřazené poznámky. Připnuté jsou vždy
 * první; řazení podle názvu se podle času nedělí.
 */
export function groupNotes(sorted: Note[], order: SortOrder, now: Date = new Date()): NoteGroup[] {
  const groups = new Map<string, NoteGroup>();
  const put = (key: string, label: string, note: Note) => {
    const group = groups.get(key) ?? { key, label, notes: [] };
    group.notes.push(note);
    groups.set(key, group);
  };

  const pinned = sorted.filter((n) => n.pinned);
  if (pinned.length > 0) groups.set("pinned", { key: "pinned", label: "Připnuté", notes: pinned });

  for (const note of sorted) {
    if (note.pinned) continue;
    if (order === "title") {
      put("all", "Ostatní", note);
      continue;
    }
    const { key, label } = dateGroup(order === "created" ? note.createdAt : note.updatedAt, now);
    put(key, label, note);
  }
  return [...groups.values()];
}

/** Rozdělí položky do sloupců vždy do toho nejkratšího; pořadí v každém sloupci zůstává. */
export function splitColumns<T>(items: T[], weight: (t: T) => number, cols: number): T[][] {
  const columns: T[][] = Array.from({ length: Math.max(1, cols) }, () => []);
  const heights = columns.map(() => 0);
  for (const item of items) {
    const shortest = heights.indexOf(Math.min(...heights));
    columns[shortest].push(item);
    heights[shortest] += weight(item);
  }
  return columns;
}

/** Odhad výšky karty v řádcích - stačí na vyvážení sloupců, nemusí být přesný. */
export function noteWeight(note: Note): number {
  const titleLines = Math.min(2, Math.ceil(noteTitle(note).length / 22));
  const excerpt = Math.min(8, noteExcerpt(note).length / 40);
  const photos = note.images.length > 0 ? 5 : 0;
  const tasks = Math.min(6, taskStats(note.text).total);
  return 2 + titleLines + excerpt + photos + tasks;
}

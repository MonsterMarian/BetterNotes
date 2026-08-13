/**
 * Uložení stavu do localStorage.
 *
 * Čtení je schválně nedůvěřivé: data v telefonu přežijí i verzi appky, která
 * je zapsala. Cokoli neznámého se zahodí a nahradí výchozím - rozbitý záznam
 * nesmí shodit celou appku, protože pak už se uživatel k ostatním poznámkám
 * nedostane.
 */
import { EMPTY_STATE, STATE_VERSION, NOTE_TONES, type BetterNotesState, type Note, type NoteTone } from "./types";
import { createId } from "./utils";

export const STORAGE_KEY = "betternotes:state";

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function tone(value: unknown): NoteTone {
  return NOTE_TONES.some((t) => t.id === value) ? (value as NoteTone) : "none";
}

/** Razítko musí jít porovnat řetězcově - podle toho se řadí seznam. */
function stamp(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const time = Date.parse(value);
  return Number.isNaN(time) ? fallback : new Date(time).toISOString();
}

function parseNote(raw: unknown, fallbackStamp: string): Note | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const created = stamp(r.createdAt, fallbackStamp);
  const note: Note = {
    id: str(r.id) || createId("note"),
    title: str(r.title),
    text: str(r.text),
    images: strArray(r.images),
    // Štítky prošly normalizací při zápisu; tady jen zahodíme duplicity,
    // které mohly vzniknout ruční úpravou zálohy.
    tags: [...new Set(strArray(r.tags))],
    tone: tone(r.tone),
    pinned: r.pinned === true,
    createdAt: created,
    updatedAt: stamp(r.updatedAt, created),
  };
  if (typeof r.deletedAt === "string") note.deletedAt = stamp(r.deletedAt, created);
  return note;
}

export function parseState(raw: unknown): BetterNotesState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Record<string, unknown>;
  const fallbackStamp = new Date(0).toISOString();
  const notes = Array.isArray(r.notes)
    ? r.notes.map((n) => parseNote(n, fallbackStamp)).filter((n): n is Note => n !== null)
    : [];

  // Dvě poznámky se stejným id by se navzájem přepisovaly při každé úpravě.
  const seen = new Set<string>();
  const unique = notes.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });

  return { version: STATE_VERSION, notes: unique };
}

export function loadState(): BetterNotesState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) return EMPTY_STATE;
    return parseState(JSON.parse(text));
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(state: BetterNotesState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    // Plné úložiště nebo soukromý režim. Zápis nemá kam eskalovat - appka
    // běží dál nad tím, co drží v paměti.
    console.error("Poznámky se nepodařilo uložit:", err);
  }
}

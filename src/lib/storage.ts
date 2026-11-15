/**
 * Uložení stavu do localStorage.
 *
 * Čtení je schválně nedůvěřivé: data v telefonu přežijí i verzi appky, která
 * je zapsala. Cokoli neznámého se zahodí a nahradí výchozím - rozbitý záznam
 * nesmí shodit celou appku, protože pak už se uživatel k ostatním poznámkám
 * nedostane.
 *
 * Vedle localStorage leží v telefonu záložní kopie (`MIRROR_FILE`). WebView
 * umí localStorage při nedostatku místa nebo po čištění dat vyprázdnit;
 * soubor v `Directory.Data` to přežije a startem se z něj poznámky vrátí.
 */
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { isNative } from "./native";
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
  if (typeof r.archivedAt === "string") note.archivedAt = stamp(r.archivedAt, created);
  if (typeof r.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.day)) note.day = r.day;
  return note;
}

/**
 * Převede uložený stav libovolné starší verze na aktuální tvar. Jede po
 * krocích, každý case posune data o jednu verzi - nová verze přidá jen
 * svůj krok a staré zůstanou, jak jsou.
 *
 * Novější data, než appka zná (návrat OTA na starší balík a zase zpátky),
 * se nemigrují ani neodmítají: parse je přečte, co zná, a zbytek zahodí.
 * Známý limit: verze 1 neznala `archivedAt`, `day` ani barvu "sand", takže
 * po návratu na v1 se archivované poznámky objeví na hlavní obrazovce
 * a písková barva spadne na žádnou. Text ani fotky se neztratí.
 */
export function migrateState(raw: Record<string, unknown>): Record<string, unknown> {
  let data = { ...raw };
  let version = typeof data.version === "number" ? data.version : 1;
  while (version < STATE_VERSION) {
    switch (version) {
      case 1:
        // 1 -> 2: archiv a denní poznámky jsou nová volitelná pole, poznámky
        // projdou beze změny. Krok tu zůstává kvůli verzi 3.
        data = { ...data, version: 2 };
        break;
      default:
        // Neznámá mezera v číslování (0, 1.5) - dál se nedá, parse to dočte.
        data = { ...data, version: STATE_VERSION };
    }
    version = data.version as number;
  }
  return data;
}

function parse(r: Record<string, unknown>): BetterNotesState {
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

export function parseState(raw: unknown): BetterNotesState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return EMPTY_STATE;
  return parse(migrateState(raw as Record<string, unknown>));
}

/**
 * Kdy se stav naposledy změnil (ms), zapsané vedle poznámek v obou kopiích.
 * WebView ukládá localStorage na disk až s několikavteřinovým zpožděním -
 * když Android appku zabije hned po úpravě, localStorage zůstane starší než
 * kopie v souboru. Podle razítka se při startu pozná, která je čerstvější.
 */
function savedAtOf(raw: unknown): number {
  const v = (raw as { savedAt?: unknown } | null)?.savedAt;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function stamped(state: BetterNotesState, savedAt?: number): string {
  return JSON.stringify(savedAt ? { ...state, savedAt } : state);
}

/** `found: false` = klíč chybí nebo v něm je rozbitý JSON - zkusí se záložní kopie. */
export function loadStateResult(): { state: BetterNotesState; found: boolean; savedAt: number } {
  if (typeof window === "undefined") return { state: EMPTY_STATE, found: false, savedAt: 0 };
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) return { state: EMPTY_STATE, found: false, savedAt: 0 };
    const raw: unknown = JSON.parse(text);
    return { state: parseState(raw), found: true, savedAt: savedAtOf(raw) };
  } catch {
    return { state: EMPTY_STATE, found: false, savedAt: 0 };
  }
}

export function loadState(): BetterNotesState {
  return loadStateResult().state;
}

/** `false` = zápis selhal (plné úložiště, soukromý režim) - obrazovka to ukáže. */
export function saveState(state: BetterNotesState, savedAt?: number): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, stamped(state, savedAt));
    return true;
  } catch (err) {
    console.error("Poznámky se nepodařilo uložit:", err);
    return false;
  }
}

/** Smaže hlavní zápis - jen když je čerstvější záložní kopie (viz StoreProvider). */
export function clearState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // soukromý režim - není co mazat
  }
}

// --- záložní kopie v souboru ------------------------------------------------

export const MIRROR_FILE = "state-mirror.json";
/** Kopie, která se nedala přečíst - další zápis by ji jinak přepsal prázdným stavem. */
export const MIRROR_BAD_FILE = "state-mirror.bad.json";

/** Jen v telefonu; selhání se spolkne - kopie je pojistka, ne hlavní zápis. `true` = zapsáno. */
export async function writeMirror(state: BetterNotesState, savedAt?: number): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await Filesystem.writeFile({
      path: MIRROR_FILE,
      data: stamped(state, savedAt),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return true;
  } catch (err) {
    console.error("Záložní kopii se nepodařilo zapsat:", err);
    return false;
  }
}

/**
 * `null` = kopie není (prohlížeč, první start) nebo se nedá přečíst. Nečitelná
 * kopie se před vrácením odloží do `MIRROR_BAD_FILE`, ať ji první zápis
 * nepřepíše - kopírování běží nativně, takže projde i u souboru, na který
 * nestačila paměť. Když soubor vůbec není, kopírování tiše selže.
 */
export async function readMirror(): Promise<BetterNotesState | null> {
  return (await readMirrorResult())?.state ?? null;
}

/** Jako `readMirror`, navíc s razítkem posledního uložení (0 = kopie bez razítka). */
export async function readMirrorResult(): Promise<{ state: BetterNotesState; savedAt: number } | null> {
  if (!isNative()) return null;
  try {
    const file = await Filesystem.readFile({
      path: MIRROR_FILE,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    if (typeof file.data !== "string") return null;
    const raw: unknown = JSON.parse(file.data);
    return { state: parseState(raw), savedAt: savedAtOf(raw) };
  } catch {
    try {
      await Filesystem.copy({
        from: MIRROR_FILE,
        to: MIRROR_BAD_FILE,
        directory: Directory.Data,
        toDirectory: Directory.Data,
      });
    } catch {
      // kopie neexistuje - není co chránit
    }
    return null;
  }
}

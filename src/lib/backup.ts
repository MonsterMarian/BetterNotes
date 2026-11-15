/**
 * Záloha celého zápisníku.
 *
 * Data jsou jen v telefonu, takže záloha je jediná pojistka proti rozbitému
 * displeji. Fotky jdou dovnitř taky - záloha bez nich by z poloviny poznámek
 * udělala děravý text.
 *
 * Formát je nadmnožina samotného stavu, takže se načte i holý `BetterNotesState`
 * (třeba ručně vytažený z localStorage).
 */
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { readImage, saveImage } from "./images";
import { renameImageMarkers } from "./inline-images";
import { isNative } from "./native";
import { getPrefs, parsePrefs, replacePrefs, setPrefs, THEME_KEY, type Prefs } from "./prefs";
import { parseState } from "./storage";
import { STATE_VERSION, type BetterNotesState } from "./types";

export const BACKUP_FORMAT = "betternotes-backup";
export const BACKUP_VERSION = 1;

export interface BackupSettings {
  theme?: "dark" | "light";
  prefs?: Prefs;
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  backupVersion: number;
  stateVersion: number;
  exportedAt: string;
  settings: BackupSettings;
  state: BetterNotesState;
  /** Jméno souboru -> data URL. Prázdné, když poznámky žádnou fotku nemají. */
  images?: Record<string, string>;
}

export function readSettings(): BackupSettings {
  if (typeof window === "undefined") return {};
  const out: BackupSettings = { prefs: getPrefs() };
  try {
    const theme = window.localStorage.getItem(THEME_KEY);
    if (theme === "dark" || theme === "light") out.theme = theme;
  } catch {
    // soukromý režim - téma se do zálohy nedostane, data ale sedí
  }
  return out;
}

export function applySettings(settings: BackupSettings): void {
  if (typeof window === "undefined") return;

  if (settings.prefs) replacePrefs(parsePrefs(settings.prefs));
  if (!settings.theme) return;

  try {
    window.localStorage.setItem(THEME_KEY, settings.theme);
  } catch {
    // soukromý režim - téma se nezapamatuje, data ale sedí
  }
  document.documentElement.classList.toggle("dark", settings.theme === "dark");
}

/** Fotky ze všech poznámek jako data URL. Chybějící soubory se přeskočí. */
async function collectImages(state: BetterNotesState): Promise<Record<string, string>> {
  const names = [...new Set(state.notes.flatMap((n) => n.images))];
  const out: Record<string, string> = {};
  for (const name of names) {
    const data = await readImage(name);
    if (data) out[name] = data;
  }
  return out;
}

export async function buildBackup(state: BetterNotesState): Promise<Backup> {
  return {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    stateVersion: STATE_VERSION,
    exportedAt: new Date().toISOString(),
    settings: readSettings(),
    state,
    images: await collectImages(state),
  };
}

export async function serializeBackup(state: BetterNotesState): Promise<string> {
  return JSON.stringify(await buildBackup(state), null, 2);
}

export function backupFileName(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return `betternotes-${stamp}.json`;
}

// --- načtení ----------------------------------------------------------------

export interface RestoredBackup {
  state: BetterNotesState;
  settings: BackupSettings;
  /** Kolik fotek se ze zálohy povedlo uložit zpátky. */
  images: number;
}

/** Záloha rozebraná, ale ještě nic neuložila - fotky jsou pořád data URL. */
export interface ParsedBackup {
  state: BetterNotesState;
  settings: BackupSettings;
  images: Record<string, string>;
}

/**
 * Rozebere text zálohy. Bere celou zálohu (`betternotes-backup`) i holý stav
 * vytažený z localStorage - stav pozná podle toho, že nemá `state`. Starší
 * verze stavu projdou migrací v `parseState`.
 *
 * Soubor bez seznamu poznámek se odmítne: obnovení přepisuje všechno, takže
 * omylem vybraný cizí JSON by jinak tiše smazal celý zápisník.
 */
export function parseBackup(text: string): ParsedBackup {
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== "object" || raw === null) throw new Error("Soubor není záloha BetterNotes.");
  const r = raw as Record<string, unknown>;
  const body = typeof r.state === "object" && r.state !== null ? (r.state as Record<string, unknown>) : r;
  if (!Array.isArray(body.notes)) throw new Error("Soubor není záloha BetterNotes.");

  const settings =
    typeof r.settings === "object" && r.settings !== null
      ? { ...(r.settings as BackupSettings), prefs: parsePrefs((r.settings as BackupSettings).prefs) }
      : {};

  const images: Record<string, string> = {};
  if (typeof r.images === "object" && r.images !== null) {
    for (const [name, dataUrl] of Object.entries(r.images)) {
      if (typeof dataUrl === "string" && dataUrl.startsWith("data:")) images[name] = dataUrl;
    }
  }
  return { state: parseState(body), settings, images };
}

/**
 * Přejmenuje fotky ve stavu podle mapy starý -> nový: v `images` i ve
 * značkách v textu. Fotka, která se neuložila, si nechá staré jméno: když
 * soubor v telefonu pořád leží (obnova na stejném telefonu), úklid ho nesmaže;
 * když neleží, značka se ukáže jako chybějící fotka, text kolem nezmizí.
 */
export function remapImages(state: BetterNotesState, renamed: Map<string, string>): BetterNotesState {
  return {
    ...state,
    notes: state.notes.map((n) => ({
      ...n,
      text: renameImageMarkers(n.text, renamed),
      images: n.images.map((name) => renamed.get(name) ?? name),
    })),
  };
}

/**
 * Přečte zálohu a fotky z ní uloží pod novými jmény - stará jména se mohou
 * krýt s tím, co už v telefonu leží. Jména v poznámkách se přepíšou na nová.
 */
export async function restoreBackup(text: string): Promise<RestoredBackup> {
  const { state, settings, images } = parseBackup(text);

  const renamed = new Map<string, string>();
  for (const [oldName, dataUrl] of Object.entries(images)) {
    try {
      renamed.set(oldName, await saveImage(dataUrl));
    } catch {
      // Plné úložiště - poznámka se načte bez téhle fotky.
    }
  }

  return { state: remapImages(state, renamed), settings, images: renamed.size };
}

/**
 * Připomínka zálohy: má smysl, až je co ztratit (5+ poznámek), záloha je
 * starší než 14 dní a uživatel ji neodložil v posledních 7 dnech.
 */
export function needsBackupNudge(prefs: Prefs, noteCount: number, now: Date = new Date()): boolean {
  const DAY = 86_400_000;
  const olderThan = (iso: string, days: number) => !iso || now.getTime() - Date.parse(iso) > days * DAY;
  return noteCount >= 5 && olderThan(prefs.lastBackupAt, 14) && olderThan(prefs.backupNudgeDismissedAt, 7);
}

// --- export ven -------------------------------------------------------------

/**
 * V telefonu soubor do cache a nabídka sdílení (Disk, e-mail, Files),
 * v prohlížeči obyčejné stažení. Přímý zápis do Downloads by na Androidu 11+
 * chtěl oprávnění navíc, které by appka jinak nepotřebovala.
 */
export async function exportBackup(state: BetterNotesState): Promise<void> {
  const text = await serializeBackup(state);
  const name = backupFileName();

  if (isNative()) {
    await Filesystem.writeFile({
      path: name,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    await Share.share({ title: "Záloha BetterNotes", url: uri });
    setPrefs({ lastBackupAt: new Date().toISOString() });
    return;
  }

  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setPrefs({ lastBackupAt: new Date().toISOString() });
  // Odvolat hned by stahování v některých prohlížečích uřízlo.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Otevře výběr souboru a vrátí jeho obsah. `null` = uživatel to zrušil. */
export function pickBackupFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    let picked = false;
    input.onchange = () => {
      picked = true;
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    // Zrušený dialog neohlásí nic. Velký soubor se ale čte déle než 800 ms,
    // takže pojistka platí jen, když `onchange` nepřišel vůbec.
    window.addEventListener("focus", () => setTimeout(() => !picked && resolve(null), 800), { once: true });
    input.click();
  });
}

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
import { isNative } from "./native";
import { getPrefs, parsePrefs, replacePrefs, THEME_KEY, type Prefs } from "./prefs";
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

/**
 * Přečte zálohu a fotky z ní uloží pod novými jmény - stará jména se mohou
 * krýt s tím, co už v telefonu leží. Jména v poznámkách se přepíšou na nová.
 */
export async function restoreBackup(text: string): Promise<RestoredBackup> {
  const raw = JSON.parse(text) as Record<string, unknown>;
  // Holý stav i celá záloha: stav pozná podle toho, že nemá `state`.
  const body = (typeof raw.state === "object" && raw.state !== null ? raw.state : raw) as unknown;
  const state = parseState(body);

  const settings =
    typeof raw.settings === "object" && raw.settings !== null
      ? { ...(raw.settings as BackupSettings), prefs: parsePrefs((raw.settings as BackupSettings).prefs) }
      : {};

  const images = (typeof raw.images === "object" && raw.images !== null ? raw.images : {}) as Record<
    string,
    unknown
  >;

  const renamed = new Map<string, string>();
  for (const [oldName, dataUrl] of Object.entries(images)) {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) continue;
    try {
      renamed.set(oldName, await saveImage(dataUrl));
    } catch {
      // Plné úložiště - poznámka se načte bez téhle fotky.
    }
  }

  return {
    state: {
      ...state,
      notes: state.notes.map((n) => ({
        ...n,
        images: n.images.map((name) => renamed.get(name)).filter((n2): n2 is string => !!n2),
      })),
    },
    settings,
    images: renamed.size,
  };
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
    return;
  }

  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Odvolat hned by stahování v některých prohlížečích uřízlo.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Otevře výběr souboru a vrátí jeho obsah. `null` = uživatel to zrušil. */
export function pickBackupFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    window.addEventListener("focus", () => setTimeout(() => resolve(null), 800), { once: true });
    input.click();
  });
}

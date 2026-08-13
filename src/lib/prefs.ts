/**
 * Nastavení appky - věci, které nepatří k poznámkám, ale mají přežít zavření.
 * Bydlí mimo `BetterNotesState`, protože s nimi nepočítá žádná doménová
 * logika; do zálohy se přidávají zvlášť (viz `backup.ts`).
 *
 * Malý vlastní store místo contextu: mění se párkrát za rok, ale číst ho
 * potřebuje pár komponent naráz. `useSyncExternalStore` si na něj sedne bez
 * dalšího providera.
 */
import type { SortOrder } from "./notes";

/** Podoba seznamu poznámek. */
export type ListView = "list" | "grid";

export const LIST_VIEWS: { id: ListView; label: string; hint: string }[] = [
  { id: "list", label: "Seznam", hint: "širší karty s náhledem textu" },
  { id: "grid", label: "Mřížka", hint: "dva sloupce, víc poznámek na obrazovku" },
];

export interface Prefs {
  view: ListView;
  order: SortOrder;
  /** Po odeslání poznámku rovnou uklidit do koše. */
  trashAfterSync: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  view: "list",
  order: "updated",
  trashAfterSync: false,
};

export const PREFS_KEY = "betternotes:prefs";

const ORDERS: SortOrder[] = ["updated", "created", "title"];

function isView(value: unknown): value is ListView {
  return LIST_VIEWS.some((v) => v.id === value);
}

function isOrder(value: unknown): value is SortOrder {
  return ORDERS.includes(value as SortOrder);
}

/**
 * Z uložených dat bere jen to, co zná - zbytek nechává na výchozím. Díky tomu
 * projdou i starší zálohy: zrušené volby se tiše zahodí.
 */
export function parsePrefs(raw: unknown): Prefs {
  if (typeof raw !== "object" || raw === null) return DEFAULT_PREFS;
  const r = raw as Record<string, unknown>;
  return {
    view: isView(r.view) ? r.view : DEFAULT_PREFS.view,
    order: isOrder(r.order) ? r.order : DEFAULT_PREFS.order,
    trashAfterSync: r.trashAfterSync === true,
  };
}

let cache: Prefs | null = null;
const listeners = new Set<() => void>();

/**
 * Snímek pro `useSyncExternalStore` - musí mít stálou identitu, dokud se nic
 * nezmění, jinak by React překresloval při každém renderu.
 */
export function getPrefs(): Prefs {
  if (cache) return cache;
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    cache = raw ? parsePrefs(JSON.parse(raw)) : DEFAULT_PREFS;
  } catch {
    cache = DEFAULT_PREFS;
  }
  return cache;
}

/** Snímek pro server/prerender - localStorage tam není. */
export function getDefaultPrefs(): Prefs {
  return DEFAULT_PREFS;
}

export function setPrefs(patch: Partial<Prefs>): void {
  const next = { ...getPrefs(), ...patch };
  cache = next;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // soukromý režim - volba vydrží aspoň do zavření appky
  }
  for (const fn of listeners) fn();
}

export function subscribePrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Přepíše nastavení načtené ze zálohy. */
export function replacePrefs(prefs: Prefs): void {
  cache = null;
  setPrefs(prefs);
}

// --- téma -------------------------------------------------------------------

export const THEME_KEY = "betternotes:theme";

export type Theme = "dark" | "light";

/** Skript v `layout.tsx` nasazuje téma před prvním paintem; tohle je jen zápis. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // soukromý režim - téma vydrží do zavření appky
  }
}

export function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

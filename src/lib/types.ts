/**
 * Datový model zápisníku.
 *
 * Všechno leží v jednom objektu, který se celý ukládá do localStorage. Fotky
 * jsou výjimka: v poznámce jsou jen jejich jména, samotné bajty bydlí
 * v souborech telefonu (viz `images.ts`). Obrázek v base64 uvnitř stavu by
 * úložiště přeplnil po pár fotkách.
 */

/** YYYY-MM-DD v lokálním čase uživatele. */
export type ISODate = string;

/** Úplné razítko včetně času - u poznámek záleží i na hodině. */
export type ISOStamp = string;

/**
 * Barevný proužek poznámky. Ne libovolná barva, ale malý pevný seznam:
 * volných barev by byl seznam poznámek nečitelný a v tmavém režimu půlka
 * z nich mizí. Barvy samotné kreslí CSS podle `data-tone`.
 */
export type NoteTone = "none" | "amber" | "green" | "blue" | "rose" | "violet";

export const NOTE_TONES: { id: NoteTone; label: string }[] = [
  { id: "none", label: "Bez barvy" },
  { id: "amber", label: "Jantarová" },
  { id: "green", label: "Zelená" },
  { id: "blue", label: "Modrá" },
  { id: "rose", label: "Růžová" },
  { id: "violet", label: "Fialová" },
];

export interface Note {
  id: string;
  /** Prázdný titulek je v pořádku - seznam si vezme první řádek textu. */
  title: string;
  text: string;
  /** Jména souborů z `images.ts`, ne obsah. */
  images: string[];
  /** Malá písmena bez mřížky ("nakup"), ať se stejný štítek nerozdvojí. */
  tags: string[];
  tone: NoteTone;
  pinned: boolean;
  createdAt: ISOStamp;
  updatedAt: ISOStamp;
  /**
   * Vyplněné = v koši. Poznámky se nemažou hned: smazat rozepsanou myšlenku
   * jedním ťuknutím na telefonu je moc snadné.
   */
  deletedAt?: ISOStamp;
}

export interface BetterNotesState {
  version: number;
  notes: Note[];
}

/** Zvedá se, když se změní tvar dat a je potřeba migrace v `storage.ts`. */
export const STATE_VERSION = 1;

export const EMPTY_STATE: BetterNotesState = {
  version: STATE_VERSION,
  notes: [],
};

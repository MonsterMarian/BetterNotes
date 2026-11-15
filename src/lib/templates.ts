/**
 * Šablony pro nové poznámky - ať první poznámka nezačíná prázdnou stránkou.
 */
import type { ISODate, Note, NoteTone } from "./types";

export interface NoteTemplate {
  id: string;
  label: string;
  title: string;
  text: string;
  tone: NoteTone;
  tags: string[];
}

export const TEMPLATES: NoteTemplate[] = [
  { id: "nakup", label: "Nákupní seznam", title: "Nákup", text: "- [ ] ", tone: "green", tags: ["nakup"] },
  {
    id: "schuzka",
    label: "Schůzka",
    title: "Schůzka",
    text: "**Kdo:** \n**Kdy:** \n\n## Body\n- \n\n## Úkoly\n- [ ] ",
    tone: "blue",
    tags: [],
  },
  {
    id: "recept",
    label: "Recept",
    title: "",
    text: "## Suroviny\n- [ ] \n\n## Postup\n1. ",
    tone: "amber",
    tags: ["recepty"],
  },
  {
    id: "denik",
    label: "Deník",
    title: "",
    text: "## Za co jsem vděčný\n- \n\n## Co se dnes povedlo\n- \n\n## Na co se těším\n- ",
    tone: "violet",
    tags: ["denik"],
  },
  { id: "ukoly", label: "Úkoly na dnes", title: "Dnes udělat", text: "- [ ] ", tone: "none", tags: [] },
  {
    id: "cesta",
    label: "Cesta",
    title: "Cesta",
    text: "## Sbalit\n- [ ] Doklady\n- [ ] Nabíječka\n- [ ] Léky\n\n## Plán\n- ",
    tone: "sand",
    tags: ["cesta"],
  },
];

/** Obsah nové poznámky ze šablony. Štítky jako kopie - poznámka si je bude měnit. */
export function templatePatch(t: NoteTemplate): Partial<Note> {
  return { title: t.title, text: t.text, tone: t.tone, tags: [...t.tags] };
}

/**
 * Denní poznámka nese jen svůj den; titulek dopočítá `noteTitle`. Nedotčená
 * zůstane prázdná a seznam ji zahodí jako každou jinou.
 */
export function dailyPatch(day: ISODate): Partial<Note> {
  return { day };
}

import { describe, expect, it } from "vitest";
import {
  addNote,
  addTag,
  dropEmptyNotes,
  emptyTrash,
  fold,
  isEmptyNote,
  liveNotes,
  matchesQuery,
  normalizeTag,
  noteExcerpt,
  noteTitle,
  orphanImages,
  purgeNote,
  removeTag,
  restoreNote,
  sortNotes,
  tagCounts,
  togglePin,
  trashNote,
  trashedNotes,
  updateNote,
  visibleNotes,
} from "./notes";
import { EMPTY_STATE, type BetterNotesState, type Note } from "./types";

/** Poznámka s pevnými razítky - testy nesmí záviset na tom, kdy běží. */
function note(patch: Partial<Note> = {}): Note {
  return {
    id: "n1",
    title: "",
    text: "",
    images: [],
    tags: [],
    tone: "none",
    pinned: false,
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z",
    ...patch,
  };
}

function stateWith(...notes: Note[]): BetterNotesState {
  return { ...EMPTY_STATE, notes };
}

describe("noteTitle", () => {
  it("vezme vyplněný titulek", () => {
    expect(noteTitle(note({ title: "  Nákup  ", text: "mléko" }))).toBe("Nákup");
  });

  it("bez titulku sáhne po prvním neprázdném řádku", () => {
    expect(noteTitle(note({ text: "\n\n  Zavolat Petrovi\nzítra" }))).toBe("Zavolat Petrovi");
  });

  it("dlouhý první řádek zkrátí", () => {
    const long = "a".repeat(80);
    expect(noteTitle(note({ text: long })).length).toBe(61);
  });

  it("poznámku jen s fotkou pojmenuje", () => {
    expect(noteTitle(note({ images: ["img_1.jpg"] }))).toBe("Fotka");
  });

  it("úplně prázdná poznámka má náhradní jméno", () => {
    expect(noteTitle(note())).toBe("Bez názvu");
  });
});

describe("noteExcerpt", () => {
  it("vynechá řádek, který si vzal titulek", () => {
    expect(noteExcerpt(note({ text: "Nákup\nmléko\nchleba" }))).toBe("mléko chleba");
  });

  it("s vyplněným titulkem ukazuje text celý", () => {
    expect(noteExcerpt(note({ title: "Nákup", text: "mléko\nchleba" }))).toBe("mléko chleba");
  });

  it("dlouhý text zkrátí", () => {
    expect(noteExcerpt(note({ title: "T", text: "x".repeat(200) }), 20)).toBe(`${"x".repeat(20)}…`);
  });
});

describe("normalizeTag", () => {
  it("shodí mřížku, velikost i mezery", () => {
    expect(normalizeTag(" #Nákup Týdne ")).toBe("nákup-týdne");
  });

  it("prázdný vstup nedá štítek", () => {
    expect(normalizeTag("  ##  ")).toBe("");
  });

  it("nepustí přes limit délky", () => {
    expect(normalizeTag("a".repeat(50)).length).toBe(24);
  });
});

describe("hledání", () => {
  it("ignoruje diakritiku a velikost písmen", () => {
    expect(fold("Zítra Přijít")).toBe("zitra prijit");
    expect(matchesQuery(note({ text: "Zítra přijít" }), "zitra")).toBe(true);
  });

  it("všechna slova dotazu musí sedět", () => {
    const n = note({ title: "Nákup", text: "mléko a chleba" });
    expect(matchesQuery(n, "nakup mleko")).toBe(true);
    expect(matchesQuery(n, "nakup maslo")).toBe(false);
  });

  it("hledá i ve štítcích", () => {
    expect(matchesQuery(note({ tags: ["prace"] }), "prace")).toBe(true);
  });

  it("prázdný dotaz sedí na všechno", () => {
    expect(matchesQuery(note(), "   ")).toBe(true);
  });
});

describe("sortNotes", () => {
  const older = note({ id: "a", title: "B", updatedAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" });
  const newer = note({ id: "b", title: "A", updatedAt: "2026-02-01T00:00:00.000Z", createdAt: "2026-02-01T00:00:00.000Z" });

  it("výchozí řazení dává nahoru naposledy upravené", () => {
    expect(sortNotes([older, newer], "updated").map((n) => n.id)).toEqual(["b", "a"]);
  });

  it("řazení podle názvu je české", () => {
    expect(sortNotes([older, newer], "title").map((n) => n.id)).toEqual(["b", "a"]);
  });

  it("připnuté jdou nahoru bez ohledu na řazení", () => {
    const pinned = { ...older, pinned: true };
    expect(sortNotes([newer, pinned], "updated").map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("nemění vstupní pole", () => {
    const input = [older, newer];
    sortNotes(input, "title");
    expect(input.map((n) => n.id)).toEqual(["a", "b"]);
  });
});

describe("visibleNotes", () => {
  const state = stateWith(
    note({ id: "a", title: "Nákup", tags: ["dum"] }),
    note({ id: "b", title: "Porada", tags: ["prace"] }),
    note({ id: "c", title: "Smazaná", deletedAt: "2026-03-01T00:00:00.000Z" }),
  );

  it("koš do seznamu nepatří", () => {
    expect(visibleNotes(state).map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("filtruje podle štítku", () => {
    expect(visibleNotes(state, { tag: "prace" }).map((n) => n.id)).toEqual(["b"]);
  });

  it("filtruje podle dotazu", () => {
    expect(visibleNotes(state, { query: "nakup" }).map((n) => n.id)).toEqual(["a"]);
  });
});

describe("tagCounts", () => {
  it("počítá jen živé poznámky a řadí od nejčastějšího", () => {
    const state = stateWith(
      note({ id: "a", tags: ["prace", "dum"] }),
      note({ id: "b", tags: ["prace"] }),
      note({ id: "c", tags: ["kos"], deletedAt: "2026-03-01T00:00:00.000Z" }),
    );
    expect(tagCounts(state)).toEqual([
      { tag: "prace", count: 2 },
      { tag: "dum", count: 1 },
    ]);
  });
});

describe("změny", () => {
  it("nová poznámka jde na začátek", () => {
    const { state, note: created } = addNote(stateWith(note({ id: "a" })), { title: "Nová" });
    expect(state.notes[0].id).toBe(created.id);
    expect(state.notes).toHaveLength(2);
  });

  it("úprava obsahu posune updatedAt", () => {
    const before = stateWith(note({ id: "a" }));
    const after = updateNote(before, "a", { text: "něco" }, new Date("2026-05-05T08:00:00.000Z"));
    expect(after.notes[0].updatedAt).toBe("2026-05-05T08:00:00.000Z");
  });

  it("připnutí není úprava obsahu, takže updatedAt nechává být", () => {
    const before = stateWith(note({ id: "a" }));
    const after = togglePin(before, "a");
    expect(after.notes[0].pinned).toBe(true);
    expect(after.notes[0].updatedAt).toBe(before.notes[0].updatedAt);
  });

  it("stejný štítek se nepřidá dvakrát", () => {
    let state = stateWith(note({ id: "a" }));
    state = addTag(state, "a", "#Práce");
    state = addTag(state, "a", "  práce  ");
    expect(state.notes[0].tags).toEqual(["práce"]);
  });

  it("prázdný štítek se zahodí", () => {
    const state = addTag(stateWith(note({ id: "a" })), "a", "###");
    expect(state.notes[0].tags).toEqual([]);
  });

  it("štítek jde odebrat", () => {
    const state = removeTag(stateWith(note({ id: "a", tags: ["x", "y"] })), "a", "x");
    expect(state.notes[0].tags).toEqual(["y"]);
  });

  it("úprava neznámého id nic nerozbije", () => {
    const before = stateWith(note({ id: "a" }));
    expect(updateNote(before, "nope", { text: "x" }).notes).toEqual(before.notes);
  });
});

describe("koš", () => {
  it("smazání poznámku schová a odepne ji", () => {
    const state = trashNote(stateWith(note({ id: "a", pinned: true })), "a");
    expect(liveNotes(state)).toHaveLength(0);
    expect(trashedNotes(state)).toHaveLength(1);
    expect(state.notes[0].pinned).toBe(false);
  });

  it("obnovení vrátí poznámku do seznamu", () => {
    let state = trashNote(stateWith(note({ id: "a" })), "a");
    state = restoreNote(state, "a");
    expect(liveNotes(state)).toHaveLength(1);
    expect(state.notes[0].deletedAt).toBeUndefined();
  });

  it("nenávratné smazání ohlásí fotky k úklidu", () => {
    const res = purgeNote(stateWith(note({ id: "a", images: ["i1.jpg", "i2.jpg"] })), "a");
    expect(res.state.notes).toHaveLength(0);
    expect(res.images).toEqual(["i1.jpg", "i2.jpg"]);
  });

  it("vysypání koše nechá živé poznámky být", () => {
    const state = stateWith(
      note({ id: "a" }),
      note({ id: "b", images: ["i.jpg"], deletedAt: "2026-03-01T00:00:00.000Z" }),
    );
    const res = emptyTrash(state);
    expect(res.state.notes.map((n) => n.id)).toEqual(["a"]);
    expect(res.images).toEqual(["i.jpg"]);
  });
});

describe("dropEmptyNotes", () => {
  it("zahodí skořápky, do kterých se nic nenapsalo", () => {
    const state = stateWith(
      note({ id: "prazdna" }),
      note({ id: "text", text: "něco" }),
      note({ id: "titulek", title: "něco" }),
      note({ id: "fotka", images: ["i.jpg"] }),
    );
    expect(dropEmptyNotes(state).notes.map((n) => n.id)).toEqual(["text", "titulek", "fotka"]);
  });

  it("prázdné poznámky v koši nechává být", () => {
    const state = stateWith(note({ id: "a", deletedAt: "2026-03-01T00:00:00.000Z" }));
    expect(dropEmptyNotes(state).notes.map((n) => n.id)).toEqual(["a"]);
  });

  it("když není co zahodit, vrátí tentýž stav", () => {
    const state = stateWith(note({ id: "a", text: "x" }));
    expect(dropEmptyNotes(state)).toBe(state);
  });
});

describe("orphanImages", () => {
  it("najde soubory, na které nikdo neukazuje", () => {
    const state = stateWith(note({ id: "a", images: ["pouzita.jpg"] }));
    expect(orphanImages(state, ["pouzita.jpg", "zapomenuta.jpg"])).toEqual(["zapomenuta.jpg"]);
  });

  it("fotky v koši se za sirotky nepovažují", () => {
    const state = stateWith(note({ id: "a", images: ["i.jpg"], deletedAt: "2026-03-01T00:00:00.000Z" }));
    expect(orphanImages(state, ["i.jpg"])).toEqual([]);
  });
});

describe("isEmptyNote", () => {
  it("pozná poznámku, kterou nemá smysl ukládat", () => {
    expect(isEmptyNote(note({ title: "  ", text: "\n" }))).toBe(true);
    expect(isEmptyNote(note({ images: ["i.jpg"] }))).toBe(false);
    expect(isEmptyNote(note({ text: "x" }))).toBe(false);
  });
});

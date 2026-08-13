import { describe, expect, it } from "vitest";
import { noteToRow } from "./sync";
import type { Note } from "./types";

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
    updatedAt: "2026-02-01T12:00:00.000Z",
    ...patch,
  };
}

describe("noteToRow", () => {
  it("přenese obsah i časy z telefonu", () => {
    const row = noteToRow(note({ title: "Nákup", text: "mléko", tags: ["dum"] }), []);
    expect(row).toEqual({
      title: "Nákup",
      body: "mléko",
      tags: ["dum"],
      images: [],
      note_created_at: "2026-01-01T10:00:00.000Z",
      note_updated_at: "2026-02-01T12:00:00.000Z",
    });
  });

  it("poznámce bez titulku ho odvodí z textu, ať má složka v počítači jméno", () => {
    expect(noteToRow(note({ text: "Zavolat Petrovi\nzítra" }), []).title).toBe("Zavolat Petrovi");
  });

  it("úplně prázdná poznámka dostane náhradní jméno, ne prázdné", () => {
    expect(noteToRow(note(), []).title).toBe("Bez názvu");
  });

  it("bere cesty fotek z úložiště, ne jména ze zápisníku", () => {
    const row = noteToRow(note({ images: ["img_local.jpg"] }), ["uid/n1/img_local.jpg"]);
    expect(row.images).toEqual(["uid/n1/img_local.jpg"]);
  });

  it("fotka, která se nenahrála, se do řádku nedostane", () => {
    // uploadImages chybějící soubory přeskočí - řádek pak nesmí odkazovat
    // na něco, co v úložišti není.
    expect(noteToRow(note({ images: ["a.jpg", "b.jpg"] }), ["uid/n1/a.jpg"]).images).toEqual([
      "uid/n1/a.jpg",
    ]);
  });
});

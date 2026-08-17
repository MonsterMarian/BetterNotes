import { beforeEach, describe, expect, it, vi } from "vitest";
import { noteToRow, sendAllNotes, sendNote } from "./sync";
import type { Note } from "./types";

/*
 * Databáze se nahrazuje atrapou: hromadné odesílání je o pořadí a o tom, co
 * se stane, když jedna poznámka selže - a to jde ověřit bez sítě.
 */
interface FakeRow {
  title: string;
  note_id?: string;
  pulled_at?: string | null;
  sent_at?: string;
}

const inserted: FakeRow[] = [];
const conflicts: (string | undefined)[] = [];
let failOn: string | null = null;
/** Databáze bez migrace: `upsert` na `note_id` v ní ještě nemá o co se opřít. */
let missingNoteId = false;

vi.mock("./images", () => ({ imageBlob: async () => null }));

/**
 * Atrapa fronty. `upsert` se chová jako databáze s unikátním indexem:
 * řádek se stejným `note_id` ten původní přepíše, jinak přibude.
 */
vi.mock("./supabase", () => ({
  NOTES_TABLE: "notes_outbox",
  IMAGES_BUCKET: "note-images",
  friendlyError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  supabase: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    from: () => ({
      insert: async (row: FakeRow) => {
        if (row.title === failOn) return { error: new Error("Server odmítl řádek.") };
        inserted.push(row);
        return { error: null };
      },
      upsert: async (row: FakeRow, options?: { onConflict?: string }) => {
        if (missingNoteId) return { error: { code: "42703", message: "column note_id" } };
        if (row.title === failOn) return { error: new Error("Server odmítl řádek.") };
        conflicts.push(options?.onConflict);
        const at = inserted.findIndex((r) => r.note_id === row.note_id);
        if (at === -1) inserted.push(row);
        else inserted[at] = row;
        return { error: null };
      },
    }),
  }),
}));

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

const SENT_AT = new Date("2026-03-01T08:00:00.000Z");

describe("noteToRow", () => {
  it("přenese obsah i časy z telefonu", () => {
    const row = noteToRow(note({ title: "Nákup", text: "mléko", tags: ["dum"] }), [], SENT_AT);
    expect(row).toEqual({
      note_id: "n1",
      title: "Nákup",
      body: "mléko",
      tags: ["dum"],
      images: [],
      tone: "none",
      note_created_at: "2026-01-01T10:00:00.000Z",
      note_updated_at: "2026-02-01T12:00:00.000Z",
      sent_at: "2026-03-01T08:00:00.000Z",
      pulled_at: null,
    });
  });

  /* Přepsaný řádek se musí tvářit jako čerstvý, jinak by si počítač novou
     podobu poznámky nestáhl - tu starou už má odbytou. */
  it("řádek jde vždycky do fronty jako nevyzvednutý", () => {
    expect(noteToRow(note(), []).pulled_at).toBe(null);
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

/*
 * Poznámka odeslaná podruhé nemá ve frontě ležet dvakrát - přepíše svůj řádek.
 * Pozná se podle `note_id`, které se přes úpravy poznámky nemění.
 */
describe("opakované odeslání téže poznámky", () => {
  beforeEach(() => {
    inserted.length = 0;
    conflicts.length = 0;
    failOn = null;
    missingNoteId = false;
  });

  it("druhé odeslání přepíše řádek, nezaloží druhý", async () => {
    await sendNote(note({ id: "n1", title: "Nákup", text: "mléko" }));
    await sendNote(note({ id: "n1", title: "Nákup", text: "mléko, chleba" }));

    expect(inserted).toHaveLength(1);
    expect(inserted[0].title).toBe("Nákup");
    expect((inserted[0] as unknown as { body: string }).body).toBe("mléko, chleba");
  });

  it("dvě různé poznámky zůstanou dvě", async () => {
    await sendNote(note({ id: "a", title: "První" }));
    await sendNote(note({ id: "b", title: "Druhá" }));

    expect(inserted.map((r) => r.title)).toEqual(["První", "Druhá"]);
  });

  it("shodu hledá podle uživatele a id poznámky", async () => {
    await sendNote(note());
    expect(conflicts).toEqual(["user_id,note_id"]);
  });

  /* Databáze, kde se ještě nepustil `supabase/schema.sql`, `note_id` nezná.
     Poznámku je pořád lepší poslat postaru než ji neposlat vůbec. */
  it("databáze bez migrace poznámku spolkne jako nový řádek", async () => {
    missingNoteId = true;
    const res = await sendNote(note({ id: "n1", title: "Nákup" }));

    expect(res.ok).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].note_id).toBeUndefined();
    expect(inserted[0].pulled_at).toBeUndefined();
  });
});

describe("sendAllNotes", () => {
  beforeEach(() => {
    inserted.length = 0;
    conflicts.length = 0;
    failOn = null;
    missingNoteId = false;
  });

  it("odešle celý zápisník a vrátí id, která prošla", async () => {
    const notes = [note({ id: "a", title: "A" }), note({ id: "b", title: "B" })];
    const res = await sendAllNotes(notes);

    expect(res).toMatchObject({ sent: 2, failed: 0, sentIds: ["a", "b"] });
    expect(inserted.map((r) => r.title)).toEqual(["A", "B"]);
  });

  it("zachová pořadí zápisníku - fronta v počítači pak sedí", async () => {
    await sendAllNotes([note({ id: "1", title: "prvni" }), note({ id: "2", title: "druha" })]);
    expect(inserted.map((r) => r.title)).toEqual(["prvni", "druha"]);
  });

  it("neúspěch jedné poznámky zbytek nezastaví", async () => {
    failOn = "rozbita";
    const res = await sendAllNotes([
      note({ id: "a", title: "prvni" }),
      note({ id: "b", title: "rozbita" }),
      note({ id: "c", title: "treti" }),
    ]);

    expect(res.sent).toBe(2);
    expect(res.failed).toBe(1);
    // Do koše smí jen to, co opravdu odešlo.
    expect(res.sentIds).toEqual(["a", "c"]);
    expect(res.message).toBe("Server odmítl řádek.");
  });

  it("hlásí postup po každé poznámce, ať tlačítko nestojí němé", async () => {
    const seen: string[] = [];
    await sendAllNotes([note({ id: "a" }), note({ id: "b" }), note({ id: "c" })], (done, total) =>
      seen.push(`${done}/${total}`),
    );
    expect(seen).toEqual(["1/3", "2/3", "3/3"]);
  });

  it("prázdný zápisník nic neodešle a neselže", async () => {
    expect(await sendAllNotes([])).toMatchObject({ sent: 0, failed: 0, sentIds: [] });
    expect(inserted).toHaveLength(0);
  });
});

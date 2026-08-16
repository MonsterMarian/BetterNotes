import { beforeEach, describe, expect, it, vi } from "vitest";
import { noteToRow, sendAllNotes } from "./sync";
import type { Note } from "./types";

/*
 * Databáze se nahrazuje atrapou: hromadné odesílání je o pořadí a o tom, co
 * se stane, když jedna poznámka selže - a to jde ověřit bez sítě.
 */
const inserted: { title: string }[] = [];
let failOn: string | null = null;

vi.mock("./images", () => ({ imageBlob: async () => null }));

vi.mock("./supabase", () => ({
  NOTES_TABLE: "notes_outbox",
  IMAGES_BUCKET: "note-images",
  friendlyError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  supabase: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    from: () => ({
      insert: async (row: { title: string }) => {
        if (row.title === failOn) return { error: new Error("Server odmítl řádek.") };
        inserted.push(row);
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

describe("noteToRow", () => {
  it("přenese obsah i časy z telefonu", () => {
    const row = noteToRow(note({ title: "Nákup", text: "mléko", tags: ["dum"] }), []);
    expect(row).toEqual({
      title: "Nákup",
      body: "mléko",
      tags: ["dum"],
      images: [],
      tone: "none",
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

describe("sendAllNotes", () => {
  beforeEach(() => {
    inserted.length = 0;
    failOn = null;
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

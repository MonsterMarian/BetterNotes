import { describe, expect, it, vi } from "vitest";

const fs = vi.hoisted(() => ({ readFile: vi.fn(), copy: vi.fn(async () => ({})) }));
vi.mock("./native", () => ({ isNative: () => true }));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Encoding: { UTF8: "utf8" },
  Filesystem: fs,
}));

import {
  loadStateResult,
  MIRROR_BAD_FILE,
  MIRROR_FILE,
  migrateState,
  parseState,
  readMirror,
  readMirrorResult,
  saveState,
  STORAGE_KEY,
} from "./storage";
import { STATE_VERSION } from "./types";

describe("readMirror", () => {
  it("nečitelnou kopii odloží stranou, ať ji první zápis nepřepíše", async () => {
    fs.readFile.mockResolvedValueOnce({ data: '{"notes":[{"id":"a"' });
    expect(await readMirror()).toBeNull();
    expect(fs.copy).toHaveBeenCalledWith(expect.objectContaining({ from: MIRROR_FILE, to: MIRROR_BAD_FILE }));
  });

  it("čitelnou kopii vrátí a nic nekopíruje", async () => {
    fs.copy.mockClear();
    fs.readFile.mockResolvedValueOnce({ data: '{"notes":[{"id":"a"}]}' });
    expect((await readMirror())?.notes[0].id).toBe("a");
    expect(fs.copy).not.toHaveBeenCalled();
  });

  it("vrátí razítko uložení a do stavu ho nepustí", async () => {
    fs.readFile.mockResolvedValueOnce({ data: '{"version":2,"savedAt":1700,"notes":[{"id":"a"}]}' });
    const res = await readMirrorResult();
    expect(res?.savedAt).toBe(1700);
    expect(res?.state).not.toHaveProperty("savedAt");
    fs.readFile.mockResolvedValueOnce({ data: '{"notes":[{"id":"a"}]}' });
    expect((await readMirrorResult())?.savedAt).toBe(0);
  });
});

describe("saveState / loadStateResult", () => {
  it("razítko projde zápisem i čtením, starý zápis bez něj má 0", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
    expect(saveState(parseState({ notes: [{ id: "a" }] }), 4242)).toBe(true);
    const res = loadStateResult();
    expect(res).toMatchObject({ found: true, savedAt: 4242 });
    expect(res.state).not.toHaveProperty("savedAt");
    store.set(STORAGE_KEY, '{"version":1,"notes":[]}');
    expect(loadStateResult().savedAt).toBe(0);
    vi.unstubAllGlobals();
  });
});

/**
 * Data v telefonu přežijí verzi appky, která je zapsala, a projdou i ruční
 * úpravou zálohy. Čtení proto nesmí věřit ničemu.
 */
describe("parseState", () => {
  it("nesmysl místo stavu vrátí prázdný zápisník", () => {
    for (const junk of [null, 42, "text", [], undefined]) {
      expect(parseState(junk).notes).toEqual([]);
    }
  });

  it("načte poznámku a doplní, co chybí", () => {
    const state = parseState({
      notes: [{ id: "a", title: "Nákup", createdAt: "2026-01-01T10:00:00.000Z" }],
    });
    expect(state.notes[0]).toMatchObject({
      id: "a",
      title: "Nákup",
      text: "",
      images: [],
      tags: [],
      tone: "none",
      pinned: false,
      // Bez updatedAt platí čas vzniku - poznámka se tím nevyhoupne nahoru.
      updatedAt: "2026-01-01T10:00:00.000Z",
    });
    expect(state.version).toBe(STATE_VERSION);
  });

  it("zahodí rozbité položky, ostatní nechá", () => {
    const state = parseState({ notes: [{ id: "a" }, null, "x", 7, { id: "b" }] });
    expect(state.notes.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("poznámka bez id ho dostane, aby se nedala přepsat jinou", () => {
    const state = parseState({ notes: [{ title: "x" }, { title: "y" }] });
    expect(state.notes).toHaveLength(2);
    expect(state.notes[0].id).not.toBe(state.notes[1].id);
  });

  it("dvě poznámky se stejným id přežije jen první", () => {
    const state = parseState({ notes: [{ id: "a", title: "první" }, { id: "a", title: "druhá" }] });
    expect(state.notes).toHaveLength(1);
    expect(state.notes[0].title).toBe("první");
  });

  it("neznámou barvu shodí na výchozí", () => {
    expect(parseState({ notes: [{ id: "a", tone: "duhová" }] }).notes[0].tone).toBe("none");
  });

  it("z fotek nechá jen jména, ne čísla a prázdné řetězce", () => {
    const state = parseState({ notes: [{ id: "a", images: ["i.jpg", 3, "", null] }] });
    expect(state.notes[0].images).toEqual(["i.jpg"]);
  });

  it("duplicitní štítky sloučí", () => {
    expect(parseState({ notes: [{ id: "a", tags: ["x", "x", "y"] }] }).notes[0].tags).toEqual([
      "x",
      "y",
    ]);
  });

  it("nesmyslné razítko nahradí, ať se dá seznam seřadit", () => {
    const state = parseState({ notes: [{ id: "a", createdAt: "včera", updatedAt: "taky včera" }] });
    expect(Number.isNaN(Date.parse(state.notes[0].createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(state.notes[0].updatedAt))).toBe(false);
  });

  it("koš se pozná podle deletedAt", () => {
    const state = parseState({
      notes: [{ id: "a", deletedAt: "2026-03-01T00:00:00.000Z" }, { id: "b" }],
    });
    expect(state.notes[0].deletedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(state.notes[1].deletedAt).toBeUndefined();
  });
});

/**
 * Stav, jak ho zapisuje produkční verze 1. Nemá `version` vůbec (zapisovala
 * ho až pozdější v1) a nese všechno, co se v telefonech reálně najde.
 */
const V1_FIXTURE = {
  notes: [
    {
      id: "note_a",
      title: "Nákup",
      text: "mléko\n![](img_1.jpg)\nchleba",
      images: ["img_1.jpg"],
      tags: ["nakup"],
      tone: "amber",
      pinned: true,
      createdAt: "2026-01-01T10:00:00.000Z",
      updatedAt: "2026-01-02T10:00:00.000Z",
    },
    { id: "note_b", title: "", text: "stará poznámka bez značek", images: ["img_2.jpg"], tags: [], tone: "teal", pinned: false, createdAt: "2026-01-03T10:00:00.000Z", updatedAt: "2026-01-03T10:00:00.000Z" },
    { id: "note_a", title: "duplicita", text: "", images: [], tags: [], tone: "none", pinned: false, createdAt: "2026-01-04T10:00:00.000Z", updatedAt: "2026-01-04T10:00:00.000Z" },
    { id: "note_c", title: "Koš", text: "x", images: [], tags: [], tone: "rose", pinned: false, createdAt: "rozbité", updatedAt: "taky rozbité", deletedAt: "2026-02-01T00:00:00.000Z" },
  ],
};

describe("migrace v1 -> v2", () => {
  it("stav bez verze se načte celý a dostane verzi 2", () => {
    const state = parseState(JSON.parse(JSON.stringify(V1_FIXTURE)));
    expect(state.version).toBe(2);
    expect(state.notes.map((n) => n.id)).toEqual(["note_a", "note_b", "note_c"]);
    // Všechna pole první poznámky beze změny.
    expect(state.notes[0]).toEqual(V1_FIXTURE.notes[0]);
    // Stará poznámka s fotkou pod textem (bez značky) zůstává, jak byla.
    expect(state.notes[1]).toMatchObject({ text: "stará poznámka bez značek", images: ["img_2.jpg"], tone: "none" });
    // Rozbité razítko dostane náhradní, koš zůstává košem.
    expect(Number.isNaN(Date.parse(state.notes[2].createdAt))).toBe(false);
    expect(state.notes[2].deletedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(state.notes[0].archivedAt).toBeUndefined();
    expect(state.notes[0].day).toBeUndefined();
  });

  it("migrateState verzi 1 posune na 2 a poznámky nechá být", () => {
    const raw = { version: 1, notes: [{ id: "a" }] };
    expect(migrateState(raw)).toEqual({ version: 2, notes: [{ id: "a" }] });
    expect(migrateState({ notes: [] }).version).toBe(2);
    expect(migrateState({ version: "1", notes: [] }).version).toBe(2);
  });

  it("archivedAt a day se načtou, nesmyslný den zahodí", () => {
    const state = parseState({
      version: 2,
      notes: [
        { id: "a", archivedAt: "2026-03-01T00:00:00.000Z", day: "2026-11-13", tone: "sand" },
        { id: "b", day: "13. 11. 2026", archivedAt: 5 },
      ],
    });
    expect(state.notes[0]).toMatchObject({ archivedAt: "2026-03-01T00:00:00.000Z", day: "2026-11-13", tone: "sand" });
    expect(state.notes[1].day).toBeUndefined();
    expect(state.notes[1].archivedAt).toBeUndefined();
  });

  it("stav v2 projde tam a zpátky beze změny", () => {
    const state = parseState({
      version: 2,
      notes: [
        {
          id: "a",
          title: "Dnes",
          text: "- [ ] mléko\n- [x] chleba",
          images: [],
          tags: ["nakup"],
          tone: "sand",
          pinned: false,
          createdAt: "2026-11-13T08:00:00.000Z",
          updatedAt: "2026-11-13T09:00:00.000Z",
          archivedAt: "2026-11-13T10:00:00.000Z",
          day: "2026-11-13",
        },
      ],
    });
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("novější verze (návrat OTA) se přečte bez pádu, neznámá pole zahodí", () => {
    const state = parseState({
      version: 99,
      future: { x: 1 },
      notes: [{ id: "a", title: "z budoucnosti", blocks: [1, 2], archivedAt: "2026-01-01T00:00:00.000Z" }],
    });
    expect(state.version).toBe(2);
    expect(state.notes[0]).toMatchObject({ id: "a", title: "z budoucnosti" });
    expect("blocks" in state.notes[0]).toBe(false);
  });
});
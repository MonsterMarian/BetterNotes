import { describe, expect, it } from "vitest";
import { parseState } from "./storage";
import { STATE_VERSION } from "./types";

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

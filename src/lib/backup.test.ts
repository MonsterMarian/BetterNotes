import { describe, expect, it, vi } from "vitest";

// Ukládání fotek potřebuje telefon nebo IndexedDB; tady jen vrátí nové jméno.
vi.mock("./images", () => ({
  readImage: vi.fn(async () => null),
  saveImage: vi.fn(async (dataUrl: string) => `new_${dataUrl.slice(-5)}.jpg`),
}));

import { needsBackupNudge, parseBackup, remapImages, restoreBackup } from "./backup";
import { DEFAULT_PREFS } from "./prefs";
import type { BetterNotesState, Note } from "./types";

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

/** Záloha, jak ji zapisovala verze 1 (stateVersion 1, stav bez archivu). */
const V1_BACKUP = {
  format: "betternotes-backup",
  backupVersion: 1,
  stateVersion: 1,
  exportedAt: "2026-09-01T10:00:00.000Z",
  settings: { theme: "dark", prefs: { view: "grid", order: "title", trashAfterSync: false, supabaseUrl: "" } },
  state: {
    version: 1,
    notes: [
      {
        id: "a",
        title: "Účtenka",
        text: "za oběd\n![](img_old1.jpg)\n180 Kč",
        images: ["img_old1.jpg", "img_old2.jpg"],
        tags: [],
        tone: "blue",
        pinned: false,
        createdAt: "2026-08-01T10:00:00.000Z",
        updatedAt: "2026-08-01T10:00:00.000Z",
      },
    ],
  },
  images: { "img_old1.jpg": "data:image/jpeg;base64,AAAAone11", "img_old2.jpg": "data:image/jpeg;base64,AAAAtwo22" },
};

describe("remapImages", () => {
  it("přepíše jména v images i ve značkách v textu", () => {
    const state: BetterNotesState = {
      version: 2,
      notes: [note({ text: "a\n![](old.jpg)\nb\n![](lost.jpg)", images: ["old.jpg", "lost.jpg"] })],
    };
    const out = remapImages(state, new Map([["old.jpg", "new.jpg"]]));
    // Neuložená fotka si nechá staré jméno, ať ji úklid nesmaže, když v telefonu leží.
    expect(out.notes[0].images).toEqual(["new.jpg", "lost.jpg"]);
    // Značka zůstává (bez souboru se ukáže jako chybějící), text nezmizí.
    expect(out.notes[0].text).toBe("a\n![](new.jpg)\nb\n![](lost.jpg)");
  });
});

describe("parseBackup", () => {
  it("přečte starou zálohu verze 1", () => {
    const res = parseBackup(JSON.stringify(V1_BACKUP));
    expect(res.state.version).toBe(2);
    expect(res.state.notes[0]).toMatchObject({ id: "a", title: "Účtenka", tone: "blue" });
    expect(res.settings.theme).toBe("dark");
    expect(res.settings.prefs).toMatchObject({ view: "grid", order: "title", haptics: true });
    expect(Object.keys(res.images)).toEqual(["img_old1.jpg", "img_old2.jpg"]);
  });

  it("přečte holý stav vytažený z localStorage", () => {
    const res = parseBackup(JSON.stringify({ notes: [{ id: "x", title: "holý" }] }));
    expect(res.state.notes.map((n) => n.title)).toEqual(["holý"]);
    expect(res.settings).toEqual({});
    expect(res.images).toEqual({});
  });

  it("cizí JSON odmítne, ať obnovení nesmaže zápisník", () => {
    expect(() => parseBackup(JSON.stringify({ foo: 1 }))).toThrow();
    expect(() => parseBackup("null")).toThrow();
  });
});

describe("restoreBackup", () => {
  it("stará záloha s fotkami se obnoví i se značkami na nové fotky", async () => {
    const res = await restoreBackup(JSON.stringify(V1_BACKUP));
    const restored = res.state.notes[0];
    expect(res.images).toBe(2);
    expect(restored.images).toEqual(["new_one11.jpg", "new_two22.jpg"]);
    expect(restored.text).toBe("za oběd\n![](new_one11.jpg)\n180 Kč");
  });
});

describe("needsBackupNudge", () => {
  const now = new Date("2026-11-13T12:00:00.000Z");

  it("připomíná, až je co ztratit a záloha je stará", () => {
    expect(needsBackupNudge(DEFAULT_PREFS, 5, now)).toBe(true);
    expect(needsBackupNudge(DEFAULT_PREFS, 4, now)).toBe(false);
  });

  it("čerstvá záloha nebo odložení připomínku schová", () => {
    expect(needsBackupNudge({ ...DEFAULT_PREFS, lastBackupAt: "2026-11-01T12:00:00.000Z" }, 9, now)).toBe(false);
    expect(needsBackupNudge({ ...DEFAULT_PREFS, lastBackupAt: "2026-10-01T12:00:00.000Z" }, 9, now)).toBe(true);
    expect(needsBackupNudge({ ...DEFAULT_PREFS, backupNudgeDismissedAt: "2026-11-10T12:00:00.000Z" }, 9, now)).toBe(false);
    expect(needsBackupNudge({ ...DEFAULT_PREFS, backupNudgeDismissedAt: "2026-11-01T12:00:00.000Z" }, 9, now)).toBe(true);
  });
});

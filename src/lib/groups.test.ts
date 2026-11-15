import { describe, expect, it } from "vitest";
import { groupNotes, noteWeight, splitColumns } from "./groups";
import type { Note } from "./types";

/** Pátek 13. 11. 2026 odpoledne, lokální čas. */
const NOW = new Date(2026, 10, 13, 15, 0);

function at(id: string, y: number, m: number, d: number, patch: Partial<Note> = {}): Note {
  const stamp = new Date(y, m - 1, d, 10, 0).toISOString();
  return {
    id,
    title: id,
    text: "",
    images: [],
    tags: [],
    tone: "none",
    pinned: false,
    createdAt: stamp,
    updatedAt: stamp,
    ...patch,
  };
}

describe("groupNotes", () => {
  it("dělí podle dne s hranicemi týdne a měsíce", () => {
    const sorted = [
      at("dnes", 2026, 11, 13),
      at("vcera", 2026, 11, 12),
      at("pondeli", 2026, 11, 9),
      at("nedele", 2026, 11, 8),
      at("prvniho", 2026, 11, 1),
      at("rijen", 2026, 10, 31),
      at("lonsky", 2025, 11, 20),
    ];
    const groups = groupNotes(sorted, "updated", NOW);
    expect(groups.map((g) => [g.label, g.notes.map((n) => n.id)])).toEqual([
      ["Dnes", ["dnes"]],
      ["Včera", ["vcera"]],
      ["Tento týden", ["pondeli"]],
      ["Tento měsíc", ["nedele", "prvniho"]],
      ["Říjen", ["rijen"]],
      ["Listopad 2025", ["lonsky"]],
    ]);
  });

  it("připnuté jdou první, řazení podle názvu se nedělí", () => {
    const sorted = [at("a", 2026, 11, 1, { pinned: true }), at("b", 2026, 11, 13), at("c", 2025, 1, 1)];
    expect(groupNotes(sorted, "title", NOW).map((g) => [g.key, g.label, g.notes.length])).toEqual([
      ["pinned", "Připnuté", 1],
      ["all", "Ostatní", 2],
    ]);
  });

  it("řazení podle vzniku dělí podle createdAt", () => {
    const n = at("x", 2026, 11, 13, { createdAt: new Date(2026, 0, 5).toISOString() });
    expect(groupNotes([n], "created", NOW)[0].label).toBe("Leden");
  });
});

describe("splitColumns", () => {
  it("dává do nejkratšího sloupce a drží pořadí", () => {
    const cols = splitColumns([5, 1, 1, 1, 1, 1, 2], (x) => x, 2);
    expect(cols).toEqual([
      [5, 2],
      [1, 1, 1, 1, 1],
    ]);
    const sum = (c: number[]) => c.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum(cols[0]) - sum(cols[1]))).toBeLessThanOrEqual(5);
  });

  it("noteWeight roste s fotkou a úkoly", () => {
    const plain = at("a", 2026, 1, 1);
    expect(noteWeight({ ...plain, images: ["i.jpg"] })).toBeGreaterThan(noteWeight(plain));
    expect(noteWeight({ ...plain, text: "- [ ] a\n- [ ] b" })).toBeGreaterThan(noteWeight(plain));
  });
});

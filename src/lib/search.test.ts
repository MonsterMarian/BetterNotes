import { describe, expect, it } from "vitest";
import { highlightRanges, parseQuery, rankNotes, searchSnippet } from "./search";
import { matchesQuery } from "./notes";
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
    updatedAt: "2026-01-01T10:00:00.000Z",
    ...patch,
  };
}

describe("parseQuery", () => {
  it("rozdělí slova a štítky, složí diakritiku", () => {
    expect(parseQuery("  Mléko #Nákup  # ")).toEqual({ words: ["mlek"], tags: ["nakup"] });
  });
});

describe("rankNotes", () => {
  it("titulek > štítek > text, při shodě čerstvější", () => {
    const body = note({ id: "body", title: "Jiné", text: "mléko", updatedAt: "2026-05-01T00:00:00.000Z" });
    const tag = note({ id: "tag", title: "Jiné", tags: ["mleko"] });
    const title = note({ id: "title", title: "Mléko" });
    const bodyOld = note({ id: "old", title: "Jiné", text: "mléko", updatedAt: "2026-01-01T00:00:00.000Z" });
    expect(rankNotes([bodyOld, body, tag, title], "mleko").map((n) => n.id)).toEqual([
      "title",
      "tag",
      "body",
      "old",
    ]);
  });
});

describe("#štítek v dotazu", () => {
  it("filtruje podle štítku včetně vnořených a štítků v textu", () => {
    expect(matchesQuery(note({ tags: ["nákup"] }), "#nakup")).toBe(true);
    expect(matchesQuery(note({ text: "porada #prace/projekt" }), "#prace")).toBe(true);
    expect(matchesQuery(note({ text: "prace" }), "#prace")).toBe(false);
    expect(matchesQuery(note({ tags: ["prace"], text: "porada" }), "#prace porada")).toBe(true);
  });
});

describe("highlightRanges", () => {
  it("najde bez diakritiky a vrátí pozice v originále", () => {
    const text = "Ten Žluťoučký kůň";
    expect(highlightRanges(text, "zlut")).toEqual([[4, 8]]);
    expect(text.slice(4, 8)).toBe("Žluť");
  });

  it("překrývající se nálezy sloučí", () => {
    expect(highlightRanges("abcd", "abc bcd")).toEqual([[0, 4]]);
    expect(highlightRanges("aa aa", "aa")).toEqual([
      [0, 2],
      [3, 5],
    ]);
    expect(highlightRanges("text", "#tag")).toEqual([]);
  });
});

describe("searchSnippet", () => {
  it("vyřízne okolí prvního nálezu s výpustkami a bez značek", () => {
    const text = `${"začátek ".repeat(10)}\n- [ ] koupit mléko\n![](img.jpg)\n${"konec ".repeat(10)}`;
    const snippet = searchSnippet(note({ title: "Nákup", text }), "mleko", 10);
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet).toContain("koupit mléko");
    expect(snippet).not.toContain("[ ]");
    expect(snippet).not.toContain("img.jpg");
  });

  it("bez titulku vynechá první řádek - je to název karty", () => {
    expect(searchSnippet(note({ text: "Test nákup\n- [ ] mléko" }), "mleka")).toBe("mléko");
  });

  it("bez nálezu v textu vezme začátek", () => {
    expect(searchSnippet(note({ title: "Mléko", text: "krátký text" }), "mleko")).toBe("krátký text");
  });
});

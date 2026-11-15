import { describe, expect, it } from "vitest";
import {
  autoFormat,
  lineRangeAt,
  parseTask,
  removeChecked,
  taskMarkerHit,
  taskStats,
  toggleLinePrefix,
  toggleTaskAt,
  uncheckAll,
  wrapSelection,
} from "./checklist";

/** Simulace psaní: vloží znak na pozici kurzoru a nechá autoFormat zareagovat. */
function type(text: string, caret: number, ch: string) {
  const next = text.slice(0, caret) + ch + text.slice(caret);
  return autoFormat(text, next, caret + ch.length);
}

describe("parseTask a lineRangeAt", () => {
  it("pozná úkol, hotový úkol i odsazení", () => {
    expect(parseTask("- [ ] mléko")).toEqual({ indent: 0, done: false, body: "mléko" });
    expect(parseTask("  * [X] hotovo")).toEqual({ indent: 2, done: true, body: "hotovo" });
    expect(parseTask("- mléko")).toBeNull();
  });

  it("najde řádek kolem pozice", () => {
    expect(lineRangeAt("ab\ncd\nef", 4)).toEqual({ start: 3, end: 5 });
    expect(lineRangeAt("ab\ncd", 0)).toEqual({ start: 0, end: 2 });
  });
});

describe("toggleTaskAt", () => {
  const list = "Nákup\n- [ ] mléko\n- [ ] chleba\n- [x] máslo\nkonec";

  it("bez propadání jen přepne políčko", () => {
    expect(toggleTaskAt(list, 8, false)).toBe("Nákup\n- [x] mléko\n- [ ] chleba\n- [x] máslo\nkonec");
  });

  it("hotový úkol sjede na konec svého bloku", () => {
    expect(toggleTaskAt(list, 8, true)).toBe("Nákup\n- [ ] chleba\n- [x] máslo\n- [x] mléko\nkonec");
  });

  it("odškrtnutý se vrátí nad první hotový", () => {
    const done = "- [ ] a\n- [x] b\n- [x] c";
    expect(toggleTaskAt(done, done.length - 1, true)).toBe("- [ ] a\n- [ ] c\n- [x] b");
  });

  it("řádek, který není úkol, nechá být", () => {
    expect(toggleTaskAt(list, 1, true)).toBe(list);
  });
});

describe("statistika a hromadné úpravy", () => {
  const text = "- [x] a\n- [ ] b\ntext\n  - [X] c";

  it("taskStats", () => {
    expect(taskStats(text)).toEqual({ done: 2, total: 3 });
    expect(taskStats("bez úkolů")).toEqual({ done: 0, total: 0 });
  });

  it("uncheckAll", () => {
    expect(uncheckAll(text)).toBe("- [ ] a\n- [ ] b\ntext\n  - [ ] c");
  });

  it("removeChecked", () => {
    expect(removeChecked(text)).toBe("- [ ] b\ntext");
  });
});

describe("autoFormat", () => {
  it("(a) Enter za úkolem přidá další prázdný úkol", () => {
    expect(type("- [ ] mléko", 11, "\n")).toEqual({ text: "- [ ] mléko\n- [ ] ", caret: 18 });
  });

  it("(a) hotový úkol pokračuje nezaškrtnutým, odrážka odrážkou, citace citací", () => {
    expect(type("- [x] a", 7, "\n")?.text).toBe("- [x] a\n- [ ] ");
    expect(type("- a", 3, "\n")?.text).toBe("- a\n- ");
    expect(type("> a", 3, "\n")?.text).toBe("> a\n> ");
  });

  it("(a) číslování pokračuje dalším číslem a drží odsazení", () => {
    expect(type("1. a\n2. b", 9, "\n")).toEqual({ text: "1. a\n2. b\n3. ", caret: 13 });
    expect(type("  - a", 5, "\n")?.text).toBe("  - a\n  - ");
  });

  it("(b) Enter za prázdnou položkou seznam ukončí", () => {
    expect(type("- [ ] a\n- [ ] ", 14, "\n")).toEqual({ text: "- [ ] a\n", caret: 8 });
    expect(type("- a\n- ", 6, "\n")).toEqual({ text: "- a\n", caret: 4 });
  });

  it("(c) [] a [ ] se změní na úkol, * na odrážku", () => {
    expect(type("[]", 2, " ")).toEqual({ text: "- [ ] ", caret: 6 });
    expect(type("a\n[ ]", 5, " ")).toEqual({ text: "a\n- [ ] ", caret: 8 });
    expect(type("*", 1, " ")).toEqual({ text: "- ", caret: 2 });
  });

  it("[] mléko + Enter dá úkol a další prázdný", () => {
    const first = type("[]", 2, " ")!;
    const typed = `${first.text}mléko`;
    expect(type(typed, typed.length, "\n")?.text).toBe("- [ ] mléko\n- [ ] ");
  });

  it("obyčejné psaní nechá být", () => {
    expect(type("ahoj", 4, "\n")).toBeNull();
    expect(type("ahoj", 4, " ")).toBeNull();
    expect(autoFormat("abc", "ab", 2)).toBeNull();
  });
});

describe("toggleLinePrefix", () => {
  it("nasadí značku na všechny řádky výběru", () => {
    expect(toggleLinePrefix("a\nb", 0, 3, "task")).toEqual({ text: "- [ ] a\n- [ ] b", start: 6, end: 15 });
    expect(toggleLinePrefix("a\nb", 0, 3, "ordered").text).toBe("1. a\n2. b");
  });

  it("když ji mají všechny, sundá ji", () => {
    expect(toggleLinePrefix("- a\n- b", 0, 7, "bullet")).toEqual({ text: "a\nb", start: 0, end: 3 });
  });

  it("cizí značku nahradí", () => {
    expect(toggleLinePrefix("- a\n# b", 0, 7, "h2").text).toBe("## a\n## b");
  });

  it("kurzor na prázdném řádku začne seznam", () => {
    expect(toggleLinePrefix("a\n", 2, 2, "bullet")).toEqual({ text: "a\n- ", start: 4, end: 4 });
  });
});

describe("wrapSelection", () => {
  it("obalí výběr a znovu ho rozbalí", () => {
    const wrapped = wrapSelection("ahoj světe", 5, 10, "**");
    expect(wrapped).toEqual({ text: "ahoj **světe**", start: 7, end: 12 });
    expect(wrapSelection(wrapped.text, wrapped.start, wrapped.end, "**")).toEqual({
      text: "ahoj světe",
      start: 5,
      end: 10,
    });
  });

  it("rozbalí i výběr včetně značek", () => {
    expect(wrapSelection("_a_", 0, 3, "_")).toEqual({ text: "a", start: 0, end: 1 });
  });

  it("prázdný výběr vloží pár a kurzor mezi", () => {
    expect(wrapSelection("ab", 1, 1, "~~")).toEqual({ text: "a~~~~b", start: 3, end: 3 });
    expect(wrapSelection("a``b", 2, 2, "`")).toEqual({ text: "ab", start: 1, end: 1 });
  });
});

describe("taskMarkerHit", () => {
  it("ťuknutí do políčka úkolu, ne do textu", () => {
    const text = "x\n  - [ ] mléko";
    expect(taskMarkerHit(text, 4)).toBe(true);
    expect(taskMarkerHit(text, 9)).toBe(true);
    expect(taskMarkerHit(text, 12)).toBe(false);
    expect(taskMarkerHit(text, 1)).toBe(false);
  });
});

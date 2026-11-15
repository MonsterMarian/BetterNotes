import { describe, expect, it } from "vitest";
import { highlightLine, parseInline, parseMarkdown } from "./markdown";
import { formatStats, textStats } from "./text-stats";

describe("parseMarkdown", () => {
  it("pozná každý druh řádku", () => {
    const text = [
      "# Nadpis",
      "## Dva",
      "### Tři",
      "- [ ] úkol",
      "  - [x] hotovo",
      "- odrážka",
      "3. číslo",
      "> citace",
      "---",
      "",
      "odstavec",
    ].join("\n");
    expect(parseMarkdown(text)).toEqual([
      { type: "heading", level: 1, at: 0, contentAt: 2, text: "Nadpis" },
      { type: "heading", level: 2, at: 9, contentAt: 12, text: "Dva" },
      { type: "heading", level: 3, at: 16, contentAt: 20, text: "Tři" },
      { type: "task", done: false, indent: 0, at: 24, contentAt: 30, text: "úkol" },
      { type: "task", done: true, indent: 2, at: 35, contentAt: 43, text: "hotovo" },
      { type: "bullet", indent: 0, at: 50, contentAt: 52, text: "odrážka" },
      { type: "ordered", n: 3, indent: 0, at: 60, contentAt: 63, text: "číslo" },
      { type: "quote", at: 69, contentAt: 71, text: "citace" },
      { type: "hr", at: 78 },
      { type: "blank", at: 82 },
      { type: "paragraph", at: 83, contentAt: 83, text: "odstavec" },
    ]);
  });

  it("pozice jsou absolutní s base", () => {
    expect(parseMarkdown("a\n- b", 100)).toEqual([
      { type: "paragraph", at: 100, contentAt: 100, text: "a" },
      { type: "bullet", indent: 0, at: 102, contentAt: 104, text: "b" },
    ]);
  });

  it("#bez mezery je štítek, ne nadpis", () => {
    expect(parseMarkdown("#nakup")[0].type).toBe("paragraph");
  });
});

describe("parseInline", () => {
  it("rozpozná značky a from ukazuje na první viditelný znak", () => {
    expect(parseInline("a **b** _c_ ~~d~~ `e`", 10)).toEqual([
      { type: "text", text: "a ", from: 10 },
      { type: "bold", text: "b", from: 14 },
      { type: "text", text: " ", from: 17 },
      { type: "italic", text: "c", from: 19 },
      { type: "text", text: " ", from: 21 },
      { type: "strike", text: "d", from: 24 },
      { type: "text", text: " ", from: 27 },
      { type: "code", text: "e", from: 29 },
    ]);
  });

  it("neuzavřené ** zůstane textem", () => {
    expect(parseInline("**bez konce")).toEqual([{ type: "text", text: "**bez konce", from: 0 }]);
  });

  it("odkaz bez tečky na konci věty", () => {
    expect(parseInline("viz https://example.com/a.", 0)).toEqual([
      { type: "text", text: "viz ", from: 0 },
      { type: "link", text: "https://example.com/a", href: "https://example.com/a", from: 4 },
      { type: "text", text: ".", from: 25 },
    ]);
  });

  it("štítek, kotva v odkazu a snake_case", () => {
    expect(parseInline("koupit #Nákup")[1]).toEqual({ type: "tag", text: "#Nákup", tag: "nákup", from: 7 });
    expect(parseInline("a_b_c")).toEqual([{ type: "text", text: "a_b_c", from: 0 }]);
    expect(parseInline("x https://a.cz/#sekce").map((t) => t.type)).toEqual(["text", "link"]);
  });

  it("wikiodkaz", () => {
    expect(parseInline("[[Nákup]]")).toEqual([{ type: "wikilink", text: "Nákup", title: "Nákup", from: 2 }]);
  });

  it("tučné uvnitř nic nevnořuje", () => {
    expect(parseInline("**a _b_**")).toEqual([{ type: "bold", text: "a _b_", from: 2 }]);
  });
});

describe("highlightLine", () => {
  const samples = [
    "",
    "obyčejný text",
    "# Nadpis",
    "### Malý **tučný**",
    "- [ ] úkol s #štítkem",
    "  - [x] hotový **úkol**",
    "- [x]",
    "- odrážka _kurzíva_",
    "12. číslo `kód`",
    "> citace s https://example.com.",
    ">bez mezery",
    "---",
    "**neuzavřené",
    "a_b_c snake_case",
    "~~škrt~~ a ``",
    "[[odkaz]] a [[nedokončený",
    "#nakup #prace/projekt",
    "   ",
    "text (#tag) a#ne",
    "* hvězdička",
  ];

  it("spojené kusy dají přesně původní řádek", () => {
    for (const line of samples) {
      expect(highlightLine(line).map((s) => s.text).join("")).toBe(line);
    }
  });

  it("značky ztlumí, obsah obarví", () => {
    expect(highlightLine("- [x] hotovo")).toEqual([
      { text: "- [x] ", cls: "ed-marker" },
      { text: "hotovo", cls: "ed-done" },
    ]);
    expect(highlightLine("a **b**")).toEqual([
      { text: "a ", cls: "" },
      { text: "**", cls: "ed-marker" },
      { text: "b", cls: "ed-bold" },
      { text: "**", cls: "ed-marker" },
    ]);
  });
});

describe("textStats a formatStats", () => {
  it("počítá slova bez značek", () => {
    expect(textStats("- [ ] mléko\n![](img.jpg)\nchleba").words).toBe(2);
    expect(textStats("- [x] mléko\n- [X] chleba").words).toBe(2);
  });

  it("české tvary 1/3/5/0", () => {
    expect(formatStats(textStats("jedno"))).toBe("1 slovo");
    expect(formatStats(textStats("tři slova tady"))).toBe("3 slova");
    expect(formatStats(textStats("a b c d e"))).toBe("5 slov");
    expect(formatStats(textStats(""))).toBe("0 slov");
  });

  it("doba čtení až od 150 slov", () => {
    expect(formatStats(textStats("slovo ".repeat(312)))).toBe("312 slov · 2 min čtení");
    expect(formatStats(textStats("slovo ".repeat(149)))).toBe("149 slov");
  });
});

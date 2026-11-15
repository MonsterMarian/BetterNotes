import { describe, expect, it } from "vitest";
import { bodyParts, spliceText, type TextPart } from "./body-parts";

const texts = (text: string) => bodyParts(text).filter((p): p is TextPart => p.kind === "text");
const values = (text: string) => texts(text).map((p) => text.slice(p.start, p.end));

describe("bodyParts", () => {
  it("text bez fotek je jeden kus přes celý text", () => {
    expect(bodyParts("a\nb")).toEqual([{ kind: "text", start: 0, end: 3, pre: "", post: "" }]);
    expect(bodyParts("")).toEqual([{ kind: "text", start: 0, end: 0, pre: "", post: "" }]);
  });

  it("oddělovače kolem značky do kusů nepatří", () => {
    const text = "nahoře\n![](a.jpg)\ndole";
    expect(values(text)).toEqual(["nahoře", "dole"]);
    expect(bodyParts(text)[1]).toEqual({ kind: "image", name: "a.jpg", alt: "", at: 7 });
  });

  it("prázdné řádky navíc zůstávají v textu kusu", () => {
    expect(values("x\n\n![](a)\n\ny")).toEqual(["x\n", "\ny"]);
  });

  it("psaní do prázdné mezery doplní chybějící oddělovače", () => {
    for (const text of ["![](a)", "![](a)\n![](b)", "![](a)![](b)"]) {
      for (const part of texts(text)) {
        const next = spliceText(text, part, "x").text;
        // Značky zůstávají na vlastním řádku a nový kus se načte zpátky stejně.
        expect(next).toMatch(/(^|\n)x(\n|$)/);
        expect(values(next)).toContain("x");
      }
    }
  });

  it("úprava se vrátí přesně na své místo a offset míří za `pre`", () => {
    const text = "a\n![](p)\nb";
    const [, second] = texts(text);
    expect(spliceText(text, second, "bc")).toEqual({ text: "a\n![](p)\nbc", offset: 9 });
    const tail = texts("![](p)").at(-1)!;
    expect(spliceText("![](p)", tail, "z")).toEqual({ text: "![](p)\nz", offset: 7 });
  });
});

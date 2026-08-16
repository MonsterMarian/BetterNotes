import { describe, expect, it } from "vitest";
import {
  insertImageMarker,
  referencedImages,
  removeImageMarker,
  splitNoteBody,
  stripImageMarkers,
  trailingImages,
} from "./inline-images";

describe("rozdělení textu na odstavce a fotky", () => {
  it("fotka uprostřed rozdělí text na dva kusy", () => {
    const blocks = splitNoteBody("nahoře\n![](a.jpg)\ndole");

    expect(blocks.map((b) => b.kind)).toEqual(["text", "image", "text"]);
    expect(blocks[0]).toMatchObject({ text: "nahoře" });
    expect(blocks[1]).toMatchObject({ name: "a.jpg" });
    expect(blocks[2]).toMatchObject({ text: "dole" });
  });

  it("text bez značek je jeden kus - stará poznámka vypadá jako dřív", () => {
    expect(splitNoteBody("jen text")).toEqual([{ kind: "text", text: "jen text", at: 0 }]);
  });

  it("prázdný text nemá bloky", () => {
    expect(splitNoteBody("")).toEqual([]);
    expect(splitNoteBody("   \n ")).toEqual([]);
  });

  it("dvě fotky za sebou nedělají prázdný odstavec mezi sebou", () => {
    expect(splitNoteBody("![](a.jpg)\n![](b.jpg)").map((b) => b.kind)).toEqual(["image", "image"]);
  });

  it("popisek ve značce se přenese k fotce", () => {
    expect(splitNoteBody("![účtenka](a.jpg)")[0]).toMatchObject({ alt: "účtenka" });
  });

  it("pozice odstavce sedí na text - kurzor musí trefit klepnutý odstavec", () => {
    const text = "první\n![](a.jpg)\ndruhý";
    const last = splitNoteBody(text).at(-1)!;

    expect(text.slice(last.at).trim()).toBe("druhý");
  });
});

describe("fotky pod textem", () => {
  it("bez značek zůstanou všechny fotky na konci", () => {
    expect(trailingImages("nic", ["a.jpg", "b.jpg"])).toEqual(["a.jpg", "b.jpg"]);
  });

  it("fotka se značkou už pod textem není", () => {
    expect(trailingImages("![](a.jpg)", ["a.jpg", "b.jpg"])).toEqual(["b.jpg"]);
  });

  it("stejná fotka dvakrát se počítá jednou", () => {
    expect(referencedImages("![](a.jpg) a znovu ![](a.jpg)")).toEqual(["a.jpg"]);
  });
});

describe("vkládání a mazání značek", () => {
  it("fotka se vloží na pozici kurzoru a dostane vlastní řádek", () => {
    expect(insertImageMarker("prvnídruhý", "a.jpg", 5)).toBe("první\n![](a.jpg)\ndruhý");
  });

  it("bez kurzoru se fotka připojí na konec", () => {
    expect(insertImageMarker("text", "a.jpg")).toBe("text\n![](a.jpg)\n");
  });

  it("pozice mimo text spadne na konec", () => {
    expect(insertImageMarker("text", "a.jpg", 999)).toBe("text\n![](a.jpg)\n");
  });

  it("smazaná fotka bere svou značku s sebou, cizí zůstane", () => {
    expect(removeImageMarker("a\n![](a.jpg)\n![](b.jpg)\nb", "a.jpg")).toBe("a\n\n![](b.jpg)\nb");
  });
});

describe("text bez značek", () => {
  it("do schránky i do náhledu jde jen text", () => {
    expect(stripImageMarkers("nahoře\n\n![](a.jpg)\n\ndole").trim()).toBe("nahoře\n\ndole");
  });

  it("kulaté závorky v běžném textu se nepletou se značkou", () => {
    const text = "cena (asi 300) a odkaz [web](https://example.com)";
    expect(stripImageMarkers(text)).toBe(text);
  });
});

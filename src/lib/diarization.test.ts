import { describe, expect, it } from "vitest";
import { formatUtterances, utteranceGap } from "./diarization";

describe("formatUtterances", () => {
  it("vrací prázdný výsledek pro prázdný vstup", () => {
    expect(formatUtterances([])).toEqual({ text: "", speakerCount: 0, activeSpeaker: null });
    expect(formatUtterances([{ id: 1, text: "   ", speaker: 1 }])).toEqual({
      text: "",
      speakerCount: 0,
      activeSpeaker: null,
    });
  });

  it("neukazuje Osoba 1, když mluví jen jeden člověk", () => {
    const res = formatUtterances([
      { id: 1, text: "Ahoj, tohle je poznámka.", speaker: 1 },
      { id: 2, text: "A ještě jedna věta.", speaker: 1 },
    ]);
    expect(res).toEqual({
      text: "Ahoj, tohle je poznámka. A ještě jedna věta.",
      speakerCount: 1,
      activeSpeaker: null,
    });
  });

  it("neukazuje Osoba 1, když je diarizace vypnutá (speaker = null)", () => {
    const res = formatUtterances([
      { id: 1, text: "První věta.", speaker: null },
      { id: 2, text: "Druhá věta.", speaker: null },
    ]);
    expect(res).toEqual({
      text: "První věta. Druhá věta.",
      speakerCount: 0,
      activeSpeaker: null,
    });
  });

  it("přepne na Osoba 1 / Osoba 2, jakmile mluví více lidí, a seskupí sousední věty", () => {
    const res = formatUtterances([
      { id: 1, text: "Ahoj, jak se máš?", speaker: 1 },
      { id: 2, text: "Máš dnes čas?", speaker: 1 },
      { id: 3, text: "Jo, po obědě.", speaker: 2 },
      { id: 4, text: "Super, tak ve dvě.", speaker: 1 },
    ]);
    expect(res).toEqual({
      text: "Osoba 1: Ahoj, jak se máš? Máš dnes čas?\nOsoba 2: Jo, po obědě.\nOsoba 1: Super, tak ve dvě.",
      speakerCount: 2,
      activeSpeaker: 1,
    });
  });

  it("přiřadí krátkou neurčenou promluvu (null) předchozímu mluvčímu a normalizuje čísla", () => {
    const res = formatUtterances([
      { id: 1, text: "Začínáme schůzku.", speaker: 4 },
      { id: 2, text: "Jasně.", speaker: null },
      { id: 3, text: "Tady je můj návrh.", speaker: 9 },
    ]);
    expect(res).toEqual({
      text: "Osoba 1: Začínáme schůzku. Jasně.\nOsoba 2: Tady je můj návrh.",
      speakerCount: 2,
      activeSpeaker: 2,
    });
  });
});

describe("utteranceGap", () => {
  it("pro dialog vloží nový řádek, pokud předchozí text nekončí odřádkováním", () => {
    expect(utteranceGap("Poznámka ze schůzky", "Osoba 1: Ahoj", true)).toBe("\n");
    expect(utteranceGap("Poznámka\n", "Osoba 1: Ahoj", true)).toBe("");
    expect(utteranceGap("", "Osoba 1: Ahoj", true)).toBe("");
  });

  it("pro jednoho mluvčího vloží mezeru", () => {
    expect(utteranceGap("Ahoj", "světe", false)).toBe(" ");
    expect(utteranceGap("Ahoj ", "světe", false)).toBe("");
  });
});

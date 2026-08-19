import { describe, expect, it } from "vitest";
import { startsSentence, transcribe, VOICE_COMMAND_HELP } from "./voice-commands";

/** Zkratka - většina testů řeší jen výsledný text. */
function say(spoken: string, sentenceStart = false): string {
  return transcribe(spoken, { sentenceStart }).text;
}

describe("transcribe", () => {
  it("obyčejná slova jen slepí mezerou", () => {
    expect(say("koupit mléko a chleba")).toBe("koupit mléko a chleba");
  });

  it("prázdný přepis nedá nic", () => {
    expect(say("")).toBe("");
    expect(say("   ")).toBe("");
  });

  it("interpunkce se lepí na předchozí slovo", () => {
    expect(say("ahoj čárka jak se máš otazník")).toBe("ahoj, jak se máš?");
  });

  it("po tečce začíná nová věta velkým písmenem", () => {
    expect(say("jdu domů tečka bude pršet")).toBe("jdu domů. Bude pršet");
  });

  it("na začátku věty se první slovo píše velkým", () => {
    expect(say("zítra volat doktorovi", true)).toBe("Zítra volat doktorovi");
    expect(say("zítra volat doktorovi", false)).toBe("zítra volat doktorovi");
  });

  it("hashtag se lepí na následující slovo", () => {
    expect(say("koupit hashtag nákup")).toBe("koupit #nákup");
  });

  it("závorky obalí text bez mezer uvnitř", () => {
    expect(say("sraz závorka u kina konec závorky v osm")).toBe("sraz (u kina) v osm");
  });

  it("uvozovky se střídají - první otevírá, druhé zavírá", () => {
    expect(say("řekl uvozovky ahoj uvozovky a šel")).toBe("řekl „ahoj“ a šel");
  });

  it("nový řádek a odstavec nenechají viset mezeru", () => {
    expect(say("nákup nový řádek mléko")).toBe("nákup\nmléko");
    expect(say("první nový odstavec druhý")).toBe("první\n\ndruhý");
    expect(say("seznam odrážka mléko odrážka chleba")).toBe("seznam\n- mléko\n- chleba");
  });

  it("dva zlomy po sobě neudělají prázdný řádek navíc", () => {
    // Nadiktované "nový řádek odrážka" myslí jeden nový řádek, ne dva.
    expect(say("seznam nový řádek odrážka mléko")).toBe("seznam\n- mléko");
    expect(say("seznam nový odstavec nový řádek mléko")).toBe("seznam\n\nmléko");
  });

  it("zlom na začátku diktátu neodsadí text prázdným řádkem", () => {
    expect(say("odrážka mléko")).toBe("- mléko");
  });

  it("lomítko a podtržítko slepí slova bez mezer", () => {
    expect(say("verze a lomítko b")).toBe("verze a/b");
    expect(say("soubor podtržítko záloha")).toBe("soubor_záloha");
  });

  // Jádro zadání: "když se řekne velkými písmeny, další string bude velkými".
  it("velkými písmeny píše dál velkým, dokud se neřekne malými", () => {
    expect(say("heslo velkými písmeny pozor malými písmeny konec")).toBe("heslo POZOR konec");
  });

  it("velkými písmeny platí i na víc slov a vydrží do konce přepisu", () => {
    expect(say("velkými písmeny nezapomeň zavolat")).toBe("NEZAPOMEŇ ZAVOLAT");
  });

  it("velké písmeno zvedne jen nejbližší slovo", () => {
    expect(say("napiš velké písmeno praha a zpátky")).toBe("napiš Praha a zpátky");
  });

  it("režim velkých písmen si volající odnese s sebou", () => {
    expect(transcribe("velkými písmeny ahoj").caps).toBe("all");
    expect(transcribe("velkými písmeny ahoj malými písmeny").caps).toBe("none");
    expect(transcribe("ahoj").caps).toBe("none");
  });

  it("velká písmena se dají i zdědit z předchozího úseku", () => {
    expect(transcribe("pokračuju", { caps: "all" }).text).toBe("POKRAČUJU");
  });

  it("příkaz projde i bez diakritiky a s velkým písmenem", () => {
    expect(say("ahoj Tecka")).toBe("ahoj.");
    expect(say("ahoj TEČKA")).toBe("ahoj.");
  });

  it("delší fráze má přednost před kratší", () => {
    // "velké písmeno" nesmí spadnout na slovo "velké" a slovo "písmeno".
    expect(say("velké písmeno karel")).toBe("Karel");
  });

  it("příkaz uvnitř slova zůstane slovem", () => {
    expect(say("tečkovaný vzor")).toBe("tečkovaný vzor");
  });

  it("konec diktování zahodí i to, co se řeklo po něm", () => {
    const res = transcribe("hotovo konec diktování ještě něco");
    expect(res.stop).toBe(true);
    expect(res.text).toBe("hotovo");
  });

  it("nadiktované po jednom slově dává průběžně stejný text jako naráz", () => {
    // Diktování hlásí průběžné výsledky pořád dokola; poslední z nich musí
    // sedět na to, co by vzniklo z celé věty naráz.
    const whole = "nákup tečka koupit hashtag mléko";
    const words = whole.split(" ");
    const steps = words.map((_, i) => say(words.slice(0, i + 1).join(" "), true));
    expect(steps[steps.length - 1]).toBe(say(whole, true));
    expect(steps[0]).toBe("Nákup");
  });

  it("nápověda vypisuje každý příkaz právě jednou", () => {
    const said = VOICE_COMMAND_HELP.flatMap((g) => g.items.map((i) => i.say));
    expect(said).toContain("tečka");
    expect(said).toContain("hashtag");
    expect(said).toContain("velkými písmeny");
    expect(new Set(said).size).toBe(said.length);
  });
});

describe("startsSentence", () => {
  it("prázdný text i konec věty znamenají velké písmeno", () => {
    expect(startsSentence("")).toBe(true);
    expect(startsSentence("Hotovo. ")).toBe(true);
    expect(startsSentence("Nákup:\n")).toBe(true);
  });

  it("uprostřed věty se pokračuje malým", () => {
    expect(startsSentence("koupit mléko a")).toBe(false);
  });
});

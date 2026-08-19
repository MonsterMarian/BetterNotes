/**
 * Hlasové příkazy - z nadiktované řeči se stane napsaný text.
 *
 * Rozpoznávač vrací holá slova: "nákupní seznam nový řádek mléko tečka".
 * Tenhle soubor z toho udělá to, co člověk chtěl napsat:
 *
 *     Nákupní seznam
 *     mléko.
 *
 * Dvě pravidla, na kterých stojí zbytek:
 *
 * 1. **Příkaz je celé slovo, ne kus slova.** "tečka" je příkaz, "tečkovaný"
 *    obyčejné slovo. Hledá se přes `fold`, takže projde i přepis bez
 *    diakritiky nebo s velkým písmenem na začátku.
 * 2. **Funkce je čistá a snese pouštění pořád dokola.** Diktování hlásí
 *    průběžné výsledky každou chvíli a pokaždé celý úsek znovu; kdyby si
 *    tohle drželo stav mezi voláními, text v poznámce by se s každým slovem
 *    sesypal. Vstup je vždycky celý přepis od spuštění, výstup celý text.
 */
import { fold } from "./notes";

/** Režim velikosti písmen. `word` platí jen na nejbližší slovo. */
export type CapsMode = "none" | "word" | "all";

export interface VoiceText {
  /** Napsaný text - bez příkazů, s interpunkcí a velkými písmeny. */
  text: string;
  /** Režim, ve kterém přepis skončil. Ukazuje se na liště voice modu. */
  caps: CapsMode;
  /** Řeklo se "konec diktování" - poslouchání má skončit. */
  stop: boolean;
}

export interface VoiceOptions {
  /**
   * Diktuje se na začátku věty (prázdná poznámka, nebo text končí tečkou).
   * První slovo se pak napíše velkým, jako by ho psal člověk.
   */
  sentenceStart?: boolean;
  /** Režim velkých písmen zděděný odjinud. Skoro vždy `none`. */
  caps?: CapsMode;
}

type Command =
  /** Interpunkce - přilepí se k předchozímu slovu. */
  | { kind: "tail"; text: string; endsSentence?: boolean }
  /** Znak, který patří k následujícímu slovu: `#štítek`, `(v závorce`. */
  | { kind: "head"; text: string }
  /** Znak bez mezer na obou stranách: `a/b`, `pracovní_verze`. */
  | { kind: "glue"; text: string }
  /** Znak, který stojí sám mezi mezerami: `2 + 2`. */
  | { kind: "loose"; text: string }
  /** Konec řádku, odstavce, odrážka. */
  | { kind: "break"; text: string }
  /** Uvozovky - první výskyt otevírá, druhý zavírá. */
  | { kind: "quote" }
  | { kind: "caps"; mode: CapsMode }
  | { kind: "stop" };

interface Entry {
  /** Jak se to řekne. První varianta se ukazuje v nápovědě. */
  say: string[];
  command: Command;
  /** Co to napíše - do nápovědy. */
  shows: string;
}

/**
 * Slovník příkazů. Varianty jsou tu proto, že rozpoznávač nepíše vždycky
 * totéž ("hashtag" umí přepsat i jako "hash tag") a člověk to taky pokaždé
 * řekne trochu jinak.
 */
const ENTRIES: { group: string; items: Entry[] }[] = [
  {
    group: "Interpunkce",
    items: [
      { say: ["tečka"], command: { kind: "tail", text: ".", endsSentence: true }, shows: "." },
      { say: ["čárka"], command: { kind: "tail", text: "," }, shows: "," },
      { say: ["otazník"], command: { kind: "tail", text: "?", endsSentence: true }, shows: "?" },
      { say: ["vykřičník"], command: { kind: "tail", text: "!", endsSentence: true }, shows: "!" },
      { say: ["dvojtečka"], command: { kind: "tail", text: ":" }, shows: ":" },
      { say: ["středník"], command: { kind: "tail", text: ";" }, shows: ";" },
      { say: ["tři tečky", "výpustka"], command: { kind: "tail", text: "…" }, shows: "…" },
      { say: ["uvozovky"], command: { kind: "quote" }, shows: "„text“" },
      {
        say: ["závorka", "otevřít závorku", "levá závorka"],
        command: { kind: "head", text: "(" },
        shows: "(",
      },
      {
        say: ["konec závorky", "zavřít závorku", "pravá závorka"],
        command: { kind: "tail", text: ")" },
        shows: ")",
      },
      { say: ["pomlčka"], command: { kind: "loose", text: "–" }, shows: "–" },
      { say: ["spojovník"], command: { kind: "glue", text: "-" }, shows: "-" },
    ],
  },
  {
    group: "Znaky",
    items: [
      {
        say: ["hashtag", "hash tag", "hešteg", "mřížka", "křížek"],
        command: { kind: "head", text: "#" },
        shows: "#štítek",
      },
      { say: ["zavináč"], command: { kind: "glue", text: "@" }, shows: "@" },
      { say: ["lomítko"], command: { kind: "glue", text: "/" }, shows: "/" },
      { say: ["podtržítko"], command: { kind: "glue", text: "_" }, shows: "_" },
      { say: ["procenta", "procento"], command: { kind: "tail", text: "%" }, shows: "%" },
      { say: ["hvězdička"], command: { kind: "loose", text: "*" }, shows: "*" },
      { say: ["plus"], command: { kind: "loose", text: "+" }, shows: "+" },
      { say: ["rovná se", "rovnítko"], command: { kind: "loose", text: "=" }, shows: "=" },
    ],
  },
  {
    group: "Řádky",
    items: [
      {
        say: ["nový řádek", "další řádek", "odřádkovat", "enter"],
        command: { kind: "break", text: "\n" },
        shows: "nový řádek",
      },
      {
        say: ["nový odstavec", "další odstavec"],
        command: { kind: "break", text: "\n\n" },
        shows: "prázdný řádek a nový",
      },
      {
        say: ["odrážka", "nová odrážka"],
        command: { kind: "break", text: "\n- " },
        shows: "- položka seznamu",
      },
    ],
  },
  {
    group: "Velikost písmen",
    items: [
      {
        say: ["velkými písmeny", "velká písmena", "kapitálky"],
        command: { kind: "caps", mode: "all" },
        shows: "VŠECHNO DÁL VELKÝM",
      },
      {
        say: ["malými písmeny", "malá písmena", "konec velkých písmen"],
        command: { kind: "caps", mode: "none" },
        shows: "zase normálně",
      },
      {
        say: ["velké písmeno", "s velkým písmenem"],
        command: { kind: "caps", mode: "word" },
        shows: "Jen další slovo",
      },
    ],
  },
  {
    group: "Konec",
    items: [
      {
        say: ["konec diktování", "konec diktátu", "stop diktování"],
        command: { kind: "stop" },
        shows: "vypne mikrofon",
      },
    ],
  },
];

/** Nápověda ve voice modu - stejný zdroj jako samotné příkazy. */
export const VOICE_COMMAND_HELP = ENTRIES.map(({ group, items }) => ({
  group,
  items: items.map((e) => ({ say: e.say[0], shows: e.shows })),
}));

const COMMANDS = new Map<string, Command>();
let longestPhrase = 1;
for (const { items } of ENTRIES) {
  for (const entry of items) {
    for (const phrase of entry.say) {
      COMMANDS.set(fold(phrase), entry.command);
      longestPhrase = Math.max(longestPhrase, phrase.split(" ").length);
    }
  }
}

/**
 * Klíč do slovníku. Rozpoznávač občas přilepí ke slovu interpunkci
 * ("tečka." na konci úseku) - to by příkaz jinak minul.
 */
function key(tokens: string[]): string {
  return fold(tokens.join(" ")).replace(/[.,;:!?]+$/, "");
}

function upperFirst(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Z nadiktovaných slov napsaný text. Viz komentář na začátku souboru. */
export function transcribe(spoken: string, options: VoiceOptions = {}): VoiceText {
  const tokens = spoken.split(/\s+/).filter(Boolean);

  let out = "";
  let caps: CapsMode = options.caps ?? "none";
  let capitalize = options.sentenceStart ?? false;
  /** Předchozí znak si bere následující slovo k sobě - `#` a spol. */
  let stick = false;
  let quoteOpen = false;
  let stop = false;

  /** `tight` = přilepit dozadu bez mezery (interpunkce). */
  const push = (piece: string, tight: boolean) => {
    const space = !tight && !stick && out !== "" && !/\s$/.test(out);
    out += (space ? " " : "") + piece;
    stick = false;
  };

  for (let i = 0; i < tokens.length && !stop; ) {
    let command: Command | undefined;
    let length = 1;
    // Delší fráze má přednost: "velké písmeno" není "velké" a pak "písmeno".
    for (let n = Math.min(longestPhrase, tokens.length - i); n >= 1; n--) {
      command = COMMANDS.get(key(tokens.slice(i, i + n)));
      if (command) {
        length = n;
        break;
      }
    }
    const word = tokens[i];
    i += length;

    if (!command) {
      if (caps === "all") {
        push(word.toUpperCase(), false);
      } else if (caps === "word" || capitalize) {
        push(upperFirst(word), false);
        if (caps === "word") caps = "none";
      } else {
        push(word, false);
      }
      capitalize = false;
      continue;
    }

    switch (command.kind) {
      case "tail":
        push(command.text, true);
        if (command.endsSentence) capitalize = true;
        break;
      case "head":
        push(command.text, false);
        stick = true;
        break;
      case "glue":
        push(command.text, true);
        stick = true;
        break;
      case "loose":
        push(command.text, false);
        break;
      case "break": {
        // Mezera před koncem řádku by zůstala viset na konci věty.
        const before = out.replace(/[ \t]+$/, "");
        const have = /\n*$/.exec(before)?.[0].length ?? 0;
        const wanted = /^\n*/.exec(command.text)?.[0].length ?? 0;
        // Dva příkazy po sobě ("nový řádek odrážka") dělají jeden zlom, ne dva
        // prázdné řádky. Odsazení zůstává to větší z nich.
        const gap = before === "" ? "" : "\n".repeat(Math.max(0, wanted - have));
        out = before + gap + command.text.slice(wanted);
        stick = false;
        break;
      }
      case "quote":
        if (quoteOpen) {
          push("“", true);
        } else {
          push("„", false);
          stick = true;
        }
        quoteOpen = !quoteOpen;
        break;
      case "caps":
        caps = command.mode;
        break;
      case "stop":
        stop = true;
        break;
    }
  }

  return { text: out, caps, stop };
}

/**
 * Má se první nadiktované slovo napsat velkým? Rozhoduje text před kurzorem:
 * na začátku poznámky a po tečce ano, uprostřed věty ne.
 */
export function startsSentence(before: string): boolean {
  const tail = before.replace(/\s+$/, "");
  return tail === "" || /[.!?:…]$/.test(tail);
}

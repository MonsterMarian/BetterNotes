/**
 * Formátování přepisu promluv s rozlišením mluvčích.
 *
 * Pravidlo:
 * - Dokud mluví jen jeden člověk (0 nebo 1 unikátní mluvčí), výstup je čistý
 *   text bez popisků „Osoba 1:“.
 * - Jakmile v jedné nahrávací relaci promluví 2 a více různých lidí, všechny
 *   promluvy z té relace se přepnou do přehledného dialogu:
 *
 *       Osoba 1: První věta. Druhá věta.
 *       Osoba 2: Odpověď druhé osoby.
 *
 * Čísla mluvčích se normalizují v pořadí prvního výskytu (1, 2, 3…).
 */

export interface Utterance {
  id: number;
  text: string;
  /** 1-based ID mluvčího z nativního pluginu, nebo null (krátká/neurčená promluva). */
  speaker: number | null;
}

export interface FormattedUtterances {
  text: string;
  /** Kolik různých mluvčích bylo v relaci rozpoznáno. */
  speakerCount: number;
  /** Číslo posledního mluvčího (normalizované 1, 2, …) pokud jich je víc než 1. */
  activeSpeaker: number | null;
}

/**
 * Z pole promluv jedné relace složí výsledný text do poznámky.
 * Pokud mluví jen jeden člověk, vrací prostý text spojený mezerou.
 * Pokud mluví více lidí, seskupí sousední promluvy téhož člověka pod „Osoba N:“.
 */
export function formatUtterances(utterances: readonly Utterance[]): FormattedUtterances {
  const clean = utterances
    .map((u) => ({ ...u, text: u.text.trim() }))
    .filter((u) => u.text.length > 0);

  if (clean.length === 0) {
    return { text: "", speakerCount: 0, activeSpeaker: null };
  }

  // Normalizace ID mluvčích v pořadí prvního výskytu (např. [2, 5] -> [1, 2]).
  const orderMap = new Map<number, number>();
  for (const u of clean) {
    if (u.speaker !== null && !orderMap.has(u.speaker)) {
      orderMap.set(u.speaker, orderMap.size + 1);
    }
  }

  const speakerCount = orderMap.size;

  // Jeden člověk (nebo diarizace vypnutá) -> žádný prefix „Osoba 1:“.
  if (speakerCount <= 1) {
    return {
      text: clean.map((u) => u.text).join(" "),
      speakerCount,
      activeSpeaker: null,
    };
  }

  // Více lidí -> seskupit navazující promluvy stejného mluvčího.
  const turns: { speaker: number; parts: string[] }[] = [];
  let lastSpeaker = 1;

  for (const u of clean) {
    const resolved = u.speaker !== null ? (orderMap.get(u.speaker) ?? lastSpeaker) : lastSpeaker;
    lastSpeaker = resolved;

    const prev = turns[turns.length - 1];
    if (prev && prev.speaker === resolved) {
      prev.parts.push(u.text);
    } else {
      turns.push({ speaker: resolved, parts: [u.text] });
    }
  }

  const text = turns.map((t) => `Osoba ${t.speaker}: ${t.parts.join(" ")}`).join("\n");
  const activeSpeaker = turns[turns.length - 1]?.speaker ?? null;

  return { text, speakerCount, activeSpeaker };
}

/**
 * Oddělovač před blokem dialogu, aby „Osoba 1:“ začal na novém řádku,
 * pokud už v poznámce před kurzorem nějaký text byl.
 */
export function utteranceGap(head: string, formatted: string, multiSpeaker: boolean): string {
  if (!head || !formatted) return "";
  if (multiSpeaker) {
    if (head.endsWith("\n")) return "";
    return "\n";
  }
  return /\s$/.test(head) ? "" : " ";
}

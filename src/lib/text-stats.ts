/**
 * Počty do patičky editoru: "312 slov · 2 min čtení".
 */
import { stripImageMarkers } from "./inline-images";
import { plural } from "./utils";

/** Slovo = kus bez mezer, ve kterém je aspoň písmeno nebo číslice ("- [ ]" se nepočítá). */
export function textStats(text: string): { words: number; chars: number; minutes: number } {
  // Políčko úkolu není slovo - jinak by odškrtnutí ("[x]") přidalo slovo.
  const plain = stripImageMarkers(text).replace(/\[[ xX]\]/g, "").trim();
  const words = plain.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return { words, chars: plain.length, minutes: Math.max(1, Math.round(words / 200)) };
}

/** Doba čtení až od 150 slov - u nákupního seznamu by "1 min čtení" působilo směšně. */
export function formatStats(s: { words: number; minutes: number }): string {
  const words = `${s.words} ${plural(s.words, "slovo", "slova", "slov")}`;
  return s.words >= 150 ? `${words} · ${s.minutes} min čtení` : words;
}

/**
 * Fotky uvnitř textu poznámky.
 *
 * Model poznámky zůstává, jaký byl: `text: string` a `images: string[]`. Kdyby
 * se místo toho zavedlo pole bloků, přestal by se číst každý uložený stav
 * v telefonu i každá odeslaná poznámka na počítači. Místo toho umí text nést
 * značku `![](jméno)` - markdown, který už zná i stahovací skript - a ta říká,
 * kam fotka v textu patří.
 *
 * Poznámka bez značek se chová jako dřív: fotky se vykreslí pod textem.
 *
 * Čisté funkce, žádný React - viz `inline-images.test.ts`.
 */

/**
 * `![popis](jméno)`. Jméno nesmí obsahovat `)` ani konec řádku, takže se
 * značka nikdy nerozlije přes odstavec.
 */
const MARKER = /!\[([^\]\n]*)\]\(([^)\n]+)\)/g;

export function imageMarker(name: string): string {
  return `![](${name})`;
}

export type NoteBlock =
  | { kind: "text"; text: string; /** Odkud v textu blok začíná - kvůli kurzoru. */ at: number }
  | { kind: "image"; name: string; alt: string; at: number };

/**
 * Text rozsekaný na odstavce a fotky v pořadí, v jakém jdou za sebou.
 *
 * Prázdné textové kusy se zahazují, aby dvě fotky pod sebou nedělaly mezeru
 * po prázdném odstavci mezi nimi.
 */
export function splitNoteBody(text: string): NoteBlock[] {
  const out: NoteBlock[] = [];
  let cursor = 0;

  for (const match of text.matchAll(MARKER)) {
    const start = match.index;
    const before = text.slice(cursor, start);
    if (before.trim()) out.push({ kind: "text", text: before.replace(/\n+$/, ""), at: cursor });
    out.push({ kind: "image", name: match[2], alt: match[1], at: start });
    cursor = start + match[0].length;
  }

  const rest = text.slice(cursor);
  if (rest.trim()) out.push({ kind: "text", text: rest.replace(/^\n+/, ""), at: cursor });
  return out;
}

/** Jména fotek, na které text ukazuje, v pořadí výskytu a bez opakování. */
export function referencedImages(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(MARKER)) seen.add(match[2]);
  return [...seen];
}

/** Fotky poznámky, které v textu nemají značku - ty patří pod text, jako dřív. */
export function trailingImages(text: string, images: string[]): string[] {
  const inText = new Set(referencedImages(text));
  return images.filter((name) => !inText.has(name));
}

/** Text bez značek - do náhledu v seznamu, do schránky i do sdílení. */
export function stripImageMarkers(text: string): string {
  return text.replace(MARKER, "").replace(/\n{3,}/g, "\n\n");
}

/**
 * Vloží fotku na dané místo v textu.
 *
 * Značka dostane vlastní řádek, ať se text nad ní a pod ní čte dál jako
 * odstavce. `at` je pozice kurzoru; mimo rozsah (nebo bez kurzoru) se fotka
 * připojí na konec.
 */
export function insertImageMarker(text: string, name: string, at?: number): string {
  const marker = imageMarker(name);
  const cut = at === undefined || at < 0 || at > text.length ? text.length : at;

  const head = text.slice(0, cut);
  const tail = text.slice(cut);
  const before = head && !head.endsWith("\n") ? `${head}\n` : head;
  const after = tail.startsWith("\n") ? tail : `\n${tail}`;
  return `${before}${marker}${after}`;
}

/** Odebere všechny značky odkazující na fotku - používá se při jejím smazání. */
export function removeImageMarker(text: string, name: string): string {
  const out = text.replace(MARKER, (whole, _alt: string, target: string) =>
    target === name ? "" : whole,
  );
  return out.replace(/\n{3,}/g, "\n\n");
}

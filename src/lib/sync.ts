/**
 * Odeslání poznámky do počítače.
 *
 * Appka je offline-first: poznámky žijí v telefonu a tohle je jednosměrný
 * doplněk pro chvíli, kdy se s poznámkou má pracovat dál na velké klávesnici.
 * Nic se nesynchronizuje zpátky a odeslání nic v telefonu nemaže - to je na
 * uživateli (viz `trashAfterSync` v nastavení).
 *
 * Přijímací server je pár řádků v `tools/sync-server.mjs`.
 */
import { imageBlob } from "./images";
import type { Note } from "./types";
import { noteTitle } from "./notes";

export type SyncResult =
  | { ok: true; images: number }
  | { ok: false; message: string };

/**
 * Adresa se v nastavení píše ručně, takže sem chodí i "192.168.1.10:3000"
 * nebo adresa bez cesty. Doplníme, co chybí, ať uživatel nehádá formát.
 */
export function normalizeEndpoint(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const withScheme = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.pathname === "/" || url.pathname === "") url.pathname = "/upload";
    return url.toString();
  } catch {
    return withScheme;
  }
}

export function isEndpointUsable(raw: string): boolean {
  return normalizeEndpoint(raw).length > 0;
}

/**
 * Pošle titulek, text, štítky a fotky jako `multipart/form-data`.
 *
 * Hlavičky schválně žádné: vlastní hlavička si vynutí předletový OPTIONS
 * dotaz a doma spuštěný server na něj většinou neodpoví. `FormData` si
 * Content-Type nastaví sám včetně hranice.
 */
export async function sendNote(note: Note, endpoint: string): Promise<SyncResult> {
  const url = normalizeEndpoint(endpoint);
  if (!url) return { ok: false, message: "V nastavení chybí adresa počítače." };

  const body = new FormData();
  body.append("title", noteTitle(note));
  body.append("text", note.text);
  body.append("tags", note.tags.join(","));
  body.append("createdAt", note.createdAt);
  body.append("updatedAt", note.updatedAt);

  let attached = 0;
  for (const name of note.images) {
    const blob = await imageBlob(name);
    // Chybějící fotka nesmí zabít odeslání textu - ten je to podstatné.
    if (!blob) continue;
    body.append("images", blob, name);
    attached += 1;
  }

  try {
    const res = await fetch(url, { method: "POST", body });
    if (!res.ok) return { ok: false, message: `Server odpověděl ${res.status}.` };
    return { ok: true, images: attached };
  } catch (e) {
    // Typicky vypnutý server, jiná síť nebo překlep v adrese. Hláška
    // z prohlížeče ("Failed to fetch") uživateli nic neřekne.
    return {
      ok: false,
      message: `Počítač neodpověděl. Běží server a jsou obě zařízení na stejné Wi-Fi? (${String(e).slice(0, 60)})`,
    };
  }
}

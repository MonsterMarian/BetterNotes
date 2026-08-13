/**
 * Odeslání poznámky do počítače přes Supabase.
 *
 * Appka je offline-first: poznámky žijí v telefonu a tohle je jednosměrný
 * doplněk pro chvíli, kdy se s poznámkou má pracovat dál na velké klávesnici.
 * Nic se nesynchronizuje zpátky a odeslání nic v telefonu nemaže - to je na
 * uživateli (viz `trashAfterSync` v nastavení).
 *
 * Cesta je telefon → databáze → počítač, ne telefon → počítač napřímo.
 * Díky tomu funguje odesílání i na mobilních datech a nikoho nezajímá,
 * jestli je počítač zrovna zapnutý, jakou má adresu a co na něm dělá firewall.
 * Poznámka počká ve frontě, dokud si ji `tools/sync-pull.mjs` nevyzvedne.
 */
import { imageBlob } from "./images";
import { friendlyError, IMAGES_BUCKET, NOTES_TABLE, supabase } from "./supabase";
import type { Note } from "./types";
import { noteTitle } from "./notes";

export type SyncResult =
  | { ok: true; images: number }
  | { ok: false; message: string };

export interface Account {
  email: string;
}

/** Přihlášený uživatel, nebo `null`. */
export async function currentAccount(): Promise<Account | null> {
  const { data } = await supabase().auth.getSession();
  const email = data.session?.user.email;
  return email ? { email } : null;
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
  return error ? friendlyError(error) : null;
}

export async function signUp(email: string, password: string): Promise<string | null> {
  const { error } = await supabase().auth.signUp({ email: email.trim(), password });
  return error ? friendlyError(error) : null;
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut();
}

/**
 * Fotky se nahrávají do složky pojmenované po uživateli. Není to kosmetika:
 * policy v `schema.sql` porovnávají právě první část cesty, takže se tím
 * fotky drží u svého majitele.
 */
async function uploadImages(note: Note, userId: string): Promise<string[]> {
  const db = supabase();
  const paths: string[] = [];

  for (const name of note.images) {
    const blob = await imageBlob(name);
    // Chybějící fotka nesmí zabít odeslání textu - ten je to podstatné.
    if (!blob) continue;

    const path = `${userId}/${note.id}/${name}`;
    const { error } = await db.storage.from(IMAGES_BUCKET).upload(path, blob, {
      contentType: blob.type || "image/jpeg",
      // Opakované odeslání téže poznámky nemá spadnout na "soubor už existuje".
      upsert: true,
    });
    if (error) throw error;
    paths.push(path);
  }

  return paths;
}

/** Řádek fronty tak, jak ho čeká `supabase/schema.sql`. */
export interface OutboxRow {
  title: string;
  body: string;
  tags: string[];
  images: string[];
  note_created_at: string;
  note_updated_at: string;
}

/**
 * Převod poznámky na řádek. Oddělené od zápisu, aby šlo ověřit bez databáze.
 *
 * `title` se schválně nebere holé: poznámka psaná ve spěchu titulek nemá
 * a v počítači by z ní byla složka "poznamka", "poznamka2"... `noteTitle`
 * v takovém případě sáhne po prvním řádku textu.
 */
export function noteToRow(note: Note, images: string[]): OutboxRow {
  return {
    title: noteTitle(note),
    body: note.text,
    tags: note.tags,
    images,
    note_created_at: note.createdAt,
    note_updated_at: note.updatedAt,
  };
}

/**
 * Zapíše poznámku do fronty. Fotky jdou první: kdyby se nahrávání nepovedlo,
 * ať ve frontě nezůstane řádek odkazující na soubory, které tam nejsou.
 */
export async function sendNote(note: Note): Promise<SyncResult> {
  const db = supabase();

  const { data: session } = await db.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return { ok: false, message: "Nejsi přihlášený - přihlas se v Nastavení." };

  try {
    const images = await uploadImages(note, userId);

    const { error } = await db.from(NOTES_TABLE).insert(noteToRow(note, images));
    if (error) throw error;

    return { ok: true, images: images.length };
  } catch (e) {
    return { ok: false, message: friendlyError(e) };
  }
}

/** Kolik poznámek čeká, než si je počítač vyzvedne. */
export async function pendingCount(): Promise<number | null> {
  const { count, error } = await supabase()
    .from(NOTES_TABLE)
    .select("id", { count: "exact", head: true })
    .is("pulled_at", null);
  return error ? null : (count ?? 0);
}

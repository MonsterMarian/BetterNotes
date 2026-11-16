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
import { imageBlob, readImage, storeImage } from "./images";
import { friendlyError, IMAGES_BUCKET, NOTES_TABLE, supabase } from "./supabase";
import type { Note } from "./types";
import { isEmptyNote, noteTitle } from "./notes";

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
  // Záznam o sladění patří účtu. Jiný účet by jinak poznámky nedostal, nebo
  // by mu odešly náhrobky za poznámky, které nikdy neměl.
  try {
    localStorage.removeItem(SENT_KEY);
  } catch {
    // nic
  }
  setStatus(OFF);
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
  /** Id poznámky z telefonu - podle něj se pozná opakované odeslání téže poznámky. */
  note_id: string;
  title: string;
  body: string;
  tags: string[];
  images: string[];
  /** Barva prouzku poznamky (NoteTone). */
  tone: string;
  note_created_at: string;
  note_updated_at: string;
  /** Čas odeslání. U přepsaného řádku se posouvá na teď. */
  sent_at: string;
  /**
   * Vždy `null`: přepsaná poznámka se musí stáhnout znovu, i kdyby si počítač
   * tu původní verzi už vyzvedl. Jinak by v počítači zůstala stará podoba.
   */
  pulled_at: null;
  /** Celá poznámka pro ostatní zařízení (obnova po přeinstalaci, koš, archiv). */
  note: Note;
  deleted: false;
  /** Kdy se změna stala - podle toho ostatní zařízení poznají novější verzi. */
  changed_at: string;
}

/**
 * Text bez prvního řádku, když si ho poznámka bez titulku vzala jako název.
 * Jinak by v počítači stál titulek dvakrát pod sebou ("# slave" a pak "slave").
 */
function bodyWithoutTitle(note: Note, title: string): string {
  if (note.title.trim() || note.day) return note.text;
  const lines = note.text.split("\n");
  const first = lines.findIndex((l) => l.trim().length > 0);
  if (first === -1 || lines[first].replace(/^\s*#{1,3}\s*/, "").trim() !== title) return note.text;
  return lines.slice(first + 1).join("\n").replace(/^\n+/, "");
}

/**
 * Převod poznámky na řádek. Oddělené od zápisu, aby šlo ověřit bez databáze.
 *
 * `title` se schválně nebere holé: poznámka psaná ve spěchu titulek nemá
 * a v počítači by z ní byla složka "poznamka", "poznamka2"... `noteTitle`
 * v takovém případě sáhne po prvním řádku textu.
 */
export function noteToRow(note: Note, images: string[], now: Date = new Date()): OutboxRow {
  const title = noteTitle(note);
  return {
    note_id: note.id,
    title,
    body: bodyWithoutTitle(note, title),
    tags: note.tags,
    images,
    tone: note.tone,
    note_created_at: note.createdAt,
    note_updated_at: note.updatedAt,
    sent_at: now.toISOString(),
    pulled_at: null,
    note,
    deleted: false,
    changed_at: now.toISOString(),
  };
}

/**
 * Chyby, které znamenají "databáze ještě nemá `note_id`".
 *
 * 42703 = neznámý sloupec, 42P10 = není unikátní index, na který by šlo
 * navázat `on conflict`. Obojí se stane přesně jednou: na telefonu s novou
 * appkou proti databázi, kde se ještě nepustil `supabase/schema.sql`.
 */
function needsMigration(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42703" || code === "42P10";
}

/**
 * Zapíše poznámku do fronty. Fotky jdou první: kdyby se nahrávání nepovedlo,
 * ať ve frontě nezůstane řádek odkazující na soubory, které tam nejsou.
 *
 * `upsert`, ne `insert`: poznámka odeslaná podruhé má ve frontě přepsat tu
 * svoji, ne vedle ní přistát znovu. Poznává se podle `note_id`, které se přes
 * úpravy nemění, a přepsaný řádek se tváří jako čerstvě odeslaný (`sent_at`
 * na teď, `pulled_at` zpátky na prázdno), takže si počítač stáhne novou podobu.
 */
export async function sendNote(note: Note, now: Date = new Date()): Promise<SyncResult> {
  const db = supabase();

  const { data: session } = await db.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return { ok: false, message: "Nejsi přihlášený - přihlas se v Nastavení." };

  try {
    const images = await uploadImages(note, userId);
    const row = { ...noteToRow(note, images, now), user_id: userId };

    const { error } = await db.from(NOTES_TABLE).upsert(row, { onConflict: "user_id,note_id" });
    if (!error) return { ok: true, images: images.length };

    // Databáze bez migrace: poznámku je pořád lepší poslat jako nový řádek
    // než ji neposlat vůbec. Duplikát vznikne, dokud se schéma nedoplní.
    if (!needsMigration(error)) throw error;

    const {
      note_id: _dropped,
      pulled_at: _pulled,
      note: _note,
      deleted: _deleted,
      changed_at: _changed,
      ...legacy
    } = row;
    const fallback = await db.from(NOTES_TABLE).insert(legacy);
    if (fallback.error) throw fallback.error;

    return { ok: true, images: images.length };
  } catch (e) {
    return { ok: false, message: friendlyError(e) };
  }
}

export interface BulkResult {
  sent: number;
  failed: number;
  /** Hláška z prvního neúspěchu - víc jich uživateli stejně nepomůže. */
  message?: string;
  /** Id poznámek, které prošly. Volající podle nich uklidí do koše. */
  sentIds: string[];
}

/**
 * Odešle celý zápisník najednou.
 *
 * Kvůli první instalaci: v telefonu leží poznámky, které vznikly, než
 * odesílání existovalo, a proklikat je po jedné je trest. Jede se postupně,
 * ne přes `Promise.all` - deset souběžných uploadů fotek na mobilních datech
 * spolehlivě vytimeoutuje, zatímco fronta jednu po druhé dojede vždycky.
 *
 * Neúspěch jedné poznámky zbytek nezastaví: co projde, to je ve frontě, a na
 * zbytek se dá kliknout znovu. Opakované odeslání nic nezdvojí - řádek si
 * poznámka ve frontě přepíše, viz `sendNote`.
 */
export async function sendAllNotes(
  notes: Note[],
  onProgress?: (done: number, total: number) => void,
): Promise<BulkResult> {
  const result: BulkResult = { sent: 0, failed: 0, sentIds: [] };

  for (const [i, note] of notes.entries()) {
    const res = await sendNote(note);
    if (res.ok) {
      result.sent += 1;
      result.sentIds.push(note.id);
    } else {
      result.failed += 1;
      result.message ??= res.message;
    }
    onProgress?.(i + 1, notes.length);
  }

  return result;
}

// --- obousměrná synchronizace ------------------------------------------------

/** Co databáze o poznámce ví: otisk naposledy sladěné podoby a čas té změny. */
export interface SyncedEntry {
  fp: string;
  at: string;
}
export type SentLog = Record<string, SyncedEntry>;

const SENT_KEY = "betternotes:synced";

/** Otisk poznámky. Klíče seřazené: Postgres v `jsonb` pořadí klíčů přehází. */
export function fingerprint(note: Note): string {
  return JSON.stringify(note, Object.keys(note).sort());
}

/** Poznámky (i v koši a archivu), jejichž aktuální podoba v databázi ještě není. */
export function notesToSend(notes: Note[], sent: SentLog): Note[] {
  return notes.filter((n) => !isEmptyNote(n) && sent[n.id]?.fp !== fingerprint(n));
}

/**
 * Poznámky, které databáze zná, ale v telefonu už nejsou = trvale smazané.
 * Prázdný zápisník je spíš nepovedené načtení než smazání všeho - pak nic.
 */
export function removedIds(notes: Note[], sent: SentLog): string[] {
  if (notes.length === 0) return [];
  const present = new Set(notes.map((n) => n.id));
  return Object.keys(sent).filter((id) => !present.has(id));
}

export interface RemoteRow {
  note_id: string;
  note: Note | null;
  deleted: boolean;
  changed_at: string;
}

export interface PullPlan {
  upsert: Note[];
  remove: string[];
  sent: SentLog;
}

/**
 * Co z databáze propsat do telefonu. Rozhoduje čas změny; poznámka upravená
 * v telefonu a ještě neodeslaná vyhrává (odejde hned potom a přepíše databázi).
 */
export function planPull(local: Note[], sent: SentLog, rows: RemoteRow[]): PullPlan {
  const byId = new Map(local.map((n) => [n.id, n]));
  const next: SentLog = { ...sent };
  const upsert: Note[] = [];
  const remove: string[] = [];

  for (const row of rows) {
    const id = row.note_id;
    const prev = sent[id];
    if (prev && prev.at >= row.changed_at) continue; // tuhle verzi už známe (třeba vlastní)

    const mine = byId.get(id);
    if (mine && row.note && fingerprint(mine) === fingerprint(row.note)) {
      next[id] = { fp: fingerprint(mine), at: row.changed_at };
      continue;
    }
    const dirty = mine !== undefined && (!prev || prev.fp !== fingerprint(mine));
    if (dirty) continue;

    if (row.deleted || !row.note) {
      if (mine) remove.push(id);
      delete next[id];
    } else {
      upsert.push(row.note);
      next[id] = { fp: fingerprint(row.note), at: row.changed_at };
    }
  }
  return { upsert, remove, sent: next };
}

export type SyncStatus =
  | { kind: "off" }
  | { kind: "syncing" }
  | { kind: "ok"; at: string }
  | { kind: "error"; message: string };

const OFF: SyncStatus = { kind: "off" };
let status: SyncStatus = OFF;
const listeners = new Set<() => void>();

function setStatus(next: SyncStatus): void {
  status = next;
  for (const l of listeners) l();
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function getOffStatus(): SyncStatus {
  return OFF;
}

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readSent(): SentLog {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) ?? "{}") as SentLog;
  } catch {
    return {};
  }
}

function writeSent(sent: SentLog): void {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(sent));
  } catch {
    // plný telefon - příště se pošle znovu, upsert nic nezdvojí
  }
}

/** Fotky stažené poznámky, které v telefonu ještě nejsou (nové zařízení, přeinstalace). */
async function downloadImages(note: Note, userId: string): Promise<void> {
  for (const name of note.images) {
    if (await readImage(name)) continue;
    const { data, error } = await supabase()
      .storage.from(IMAGES_BUCKET)
      .download(`${userId}/${note.id}/${name}`);
    if (error || !data) continue; // chybějící fotka nesmí zastavit text
    const bytes = new Uint8Array(await data.arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    await storeImage(name, btoa(binary));
  }
}

let running = false;
let again = false;

/**
 * Sladí telefon s databází: nejdřív stáhne cizí změny, pak pošle svoje
 * (nové, upravené, koš, archiv) a náhrobky trvale smazaných.
 * Nepřihlášený = nic. Souběžné volání se nezahodí, jen doběhne po tom běžícím.
 */
export async function syncNotes(
  getNotes: () => Note[],
  apply: (upsert: Note[], remove: string[]) => void,
): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      await syncOnce(getNotes(), apply);
    } while (again);
  } finally {
    running = false;
  }
}

async function syncOnce(
  local: Note[],
  apply: (upsert: Note[], remove: string[]) => void,
): Promise<void> {
  const db = supabase();
  const { data } = await db.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return setStatus(OFF);

  setStatus({ kind: "syncing" });
  try {
    // shortcut: stahuje se pokaždé celý seznam řádků; při stovkách poznámek přejít na kurzor podle changed_at
    const { data: rows, error } = await db
      .from(NOTES_TABLE)
      .select("note_id, note, deleted, changed_at")
      .not("changed_at", "is", null);
    if (error) throw error;

    const plan = planPull(local, readSent(), (rows ?? []) as RemoteRow[]);
    for (const note of plan.upsert) await downloadImages(note, userId);
    if (plan.upsert.length > 0 || plan.remove.length > 0) apply(plan.upsert, plan.remove);
    const sent = plan.sent;
    writeSent(sent);

    const gone = new Set(plan.remove);
    const fresh = new Map(plan.upsert.map((n) => [n.id, n]));
    const merged = [
      ...plan.upsert.filter((n) => !local.some((l) => l.id === n.id)),
      ...local.filter((n) => !gone.has(n.id)).map((n) => fresh.get(n.id) ?? n),
    ];

    for (const note of notesToSend(merged, sent)) {
      const now = new Date();
      const res = await sendNote(note, now);
      if (!res.ok) throw new Error(res.message);
      sent[note.id] = { fp: fingerprint(note), at: now.toISOString() };
      writeSent(sent);
    }

    for (const id of removedIds(merged, sent)) {
      const now = new Date().toISOString();
      const { error: delError } = await db.from(NOTES_TABLE).upsert(
        {
          user_id: userId,
          note_id: id,
          title: "",
          body: "",
          note: null,
          deleted: true,
          changed_at: now,
          sent_at: now,
          // Počítač náhrobek stahovat nemá.
          pulled_at: now,
        },
        { onConflict: "user_id,note_id" },
      );
      if (delError) throw delError;
      delete sent[id];
      writeSent(sent);
    }

    setStatus({ kind: "ok", at: new Date().toISOString() });
  } catch (e) {
    setStatus({ kind: "error", message: friendlyError(e) });
  }
}


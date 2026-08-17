/**
 * Stahuje poznámky odeslané z telefonu.
 *
 * Přihlásí se stejným účtem jako appka, vybere z fronty vše nestažené, zapíše
 * to na disk a označí to jako vyzvednuté. Nic neposlouchá a nic nevystavuje -
 * jen se ptá ven, takže tomu firewall nemá co zakázat a je jedno, jakou má
 * počítač adresu.
 *
 * Spuštění:
 *   node tools/sync-pull.mjs             stáhne, co čeká, a skončí
 *   node tools/sync-pull.mjs --watch     zůstane běžet a ptá se každou minutu
 *
 * Údaje se berou z `.env.local` (viz `.env.local.example`).
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SAVE_DIR = path.resolve("prijate-poznamky");
const WATCH = process.argv.includes("--watch");
const INTERVAL_MS = 60_000;

/**
 * Vlastní čtení `.env.local` místo balíčku: potřebujeme čtyři hodnoty
 * a jedna závislost navíc kvůli `KLÍČ=hodnota` za to nestojí.
 */
async function loadEnv() {
  try {
    const text = await readFile(".env.local", "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const at = trimmed.indexOf("=");
      if (at === -1) continue;
      const key = trimmed.slice(0, at).trim();
      // Hodnota může být v uvozovkách, když obsahuje mezery.
      const value = trimmed.slice(at + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // Soubor nemusí být - hodnoty můžou přijít z prostředí.
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Chybí ${name}. Vyplň ho v .env.local podle .env.local.example.`);
    process.exit(1);
  }
  return value;
}

/** Z názvu poznámky název složky, do které se dá bezpečně zapsat. */
function safeName(name, fallback) {
  const base = path
    .basename(name ?? "")
    .replace(/[^\w\s.-]/g, "_")
    .trim()
    .slice(0, 40);
  return base && base !== "." && base !== ".." ? base : fallback;
}

function stamp(iso) {
  return new Date(iso).toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

/**
 * Složka, která ještě neexistuje.
 *
 * Razítko je na sekundy a titulek se opakuje, takže hromadné odeslání umí
 * vyrobit dvě poznámky se stejným jménem složky - a druhá tu první přepsala.
 * Kousek id z databáze je krátký, stabilní a jedinečný.
 */
function uniqueDir(base, id) {
  return existsSync(base) ? `${base}_${id.slice(0, 8)}` : base;
}

const INDEX_FILE = path.join(SAVE_DIR, ".stazene.json");

/**
 * Kam se která poznámka stáhla naposledy: `note_id` → složka.
 *
 * Přepsaná poznámka přijde znovu (viz `pulled_at` v appce) a má přepsat svoje
 * staré soubory, ne se vedle nich usadit podruhé. Bez téhle mapy by to nešlo -
 * jméno složky nese čas odeslání, který se mezitím posunul.
 */
async function loadIndex() {
  try {
    const parsed = JSON.parse(await readFile(INDEX_FILE, "utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    // Soubor ještě není, nebo je rozbitý - začne se nanovo.
    return {};
  }
}

async function saveIndex(index) {
  await mkdir(SAVE_DIR, { recursive: true });
  await writeFile(INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

async function pullOnce(db, userId) {
  const { data: rows, error } = await db
    .from("notes_outbox")
    .select("*")
    .is("pulled_at", null)
    .order("sent_at", { ascending: true });

  if (error) {
    console.error("Frontu se nepodařilo načíst:", error.message);
    return 0;
  }
  if (rows.length === 0) return 0;

  const index = await loadIndex();
  let indexChanged = false;

  for (const row of rows) {
    // Poznámka, která už jednou přišla, se přepíše ve své složce. Nová dostane
    // složku podle času odeslání a titulku, jak to bylo vždycky.
    const known = row.note_id ? index[row.note_id] : undefined;
    const dir =
      known && existsSync(known)
        ? known
        : uniqueDir(
            path.join(SAVE_DIR, `${stamp(row.sent_at)}_${safeName(row.title, "poznamka")}`),
            row.id,
          );
    await mkdir(dir, { recursive: true });

    if (row.note_id && index[row.note_id] !== dir) {
      index[row.note_id] = dir;
      indexChanged = true;
    }

    const images = [];
    const body = row.body ?? "";
    for (const [i, storagePath] of (row.images ?? []).entries()) {
      const { data, error: dlError } = await db.storage.from("note-images").download(storagePath);
      if (dlError) {
        console.error(`  fotka ${storagePath}: ${dlError.message}`);
        continue;
      }
      const name = safeName(path.basename(storagePath), `fotka-${i + 1}.jpg`);
      await writeFile(path.join(dir, name), Buffer.from(await data.arrayBuffer()));
      images.push(name);
    }

    // Markdown, ne holý text: titulek a štítky mají kam jít a fotky se dají
    // odkázat, takže se soubor dá rovnou otevřít v čemkoli.
    const lines = [`# ${row.title || "Poznámka"}`, ""];
    if (row.tags?.length) lines.push(`Štítky: ${row.tags.join(", ")}`, "");
    lines.push(body);
    // Fotku, na kterou text sám ukazuje, appka do textu vložila na její místo.
    // Připsat ji ještě jednou na konec by ji v souboru zdvojilo.
    const trailing = images.filter((name) => !body.includes(`](${name})`));
    if (trailing.length) lines.push("", ...trailing.map((name) => `![](${name})`));
    await writeFile(path.join(dir, "poznamka.md"), `${lines.join("\n")}\n`, "utf8");

    // Označit se smí až po zápisu na disk. Kdyby to spadlo dřív, poznámka
    // zůstane ve frontě a příští běh ji zkusí znovu - lepší než ji ztratit.
    const { error: markError } = await db
      .from("notes_outbox")
      .update({ pulled_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("user_id", userId);

    if (markError) {
      console.error(`  označení selhalo (${markError.message}) - přijde znovu příště`);
    }

    const again = known && existsSync(known) ? " (přepsáno)" : "";
    console.log(
      `✓ ${row.title || "Poznámka"}${again} → ${dir}${images.length ? ` (${images.length} fotek)` : ""}`,
    );
  }

  if (indexChanged) await saveIndex(index);

  return rows.length;
}

await loadEnv();

const db = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  { auth: { persistSession: false } },
);

const { data: auth, error: authError } = await db.auth.signInWithPassword({
  email: required("BETTERNOTES_EMAIL"),
  password: required("BETTERNOTES_PASSWORD"),
});

if (authError) {
  console.error("Přihlášení selhalo:", authError.message);
  process.exit(1);
}

await mkdir(SAVE_DIR, { recursive: true });
console.log(`BetterNotes — přihlášen jako ${auth.user.email}`);
console.log(`Poznámky se ukládají do: ${SAVE_DIR}\n`);

const count = await pullOnce(db, auth.user.id);
if (!WATCH) {
  console.log(count === 0 ? "Fronta je prázdná." : `Staženo: ${count}`);
  process.exit(0);
}

console.log(count === 0 ? "Fronta je prázdná, čekám na nové." : `Staženo: ${count}. Čekám na další.`);
console.log("Konec: Ctrl+C");

// Prosté opakování místo realtime odběru: kontrola je jeden levný dotaz
// a nemá smysl kvůli ní držet websocket, který se po výpadku sítě musí
// sám oživovat.
setInterval(() => {
  void pullOnce(db, auth.user.id);
}, INTERVAL_MS);

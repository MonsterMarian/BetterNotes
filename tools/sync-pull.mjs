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

  for (const row of rows) {
    const dir = path.join(SAVE_DIR, `${stamp(row.sent_at)}_${safeName(row.title, "poznamka")}`);
    await mkdir(dir, { recursive: true });

    const images = [];
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
    lines.push(row.body ?? "");
    if (images.length) lines.push("", ...images.map((name) => `![](${name})`));
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

    console.log(`✓ ${row.title || "Poznámka"} → ${dir}${images.length ? ` (${images.length} fotek)` : ""}`);
  }

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

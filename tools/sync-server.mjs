/**
 * Přijímací server pro "Odeslat do počítače".
 *
 * Poslouchá na jednom portu, každou přijatou poznámku uloží do vlastní složky
 * jako `poznamka.md` plus fotky. Nic víc nedělá - žádná databáze, žádný stav.
 *
 * Schválně bez závislostí: `npm install express multer` na cizím počítači
 * kvůli přijetí textového souboru je zbytečná daň. Běží na holém Node.
 *
 * Spuštění:
 *   node tools/sync-server.mjs [port]
 *
 * V appce pak stačí zadat adresu, kterou skript po startu vypíše.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";

// 4545, ne 3000: na 3000 běží `npm run dev`, takže by si server s vývojovým
// serverem sedl na stejný port a jeden z nich by nenaběhl.
const PORT = Number(process.argv[2] ?? 4545);
const SAVE_DIR = path.resolve("prijate-poznamky");

/**
 * Adresy, na kterých je počítač vidět z telefonu na stejné Wi-Fi.
 *
 * Bez `169.254.*`: to jsou APIPA adresy, které si Windows přidělí sám, když
 * na adaptéru není DHCP - typicky u odpojených síťovek. Vypsat je znamená
 * nabídnout uživateli k opsání adresu, na které nikdo neposlouchá.
 */
function localAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal && !n.address.startsWith("169.254."))
    .map((n) => n.address);
}

/**
 * Rozebere multipart/form-data.
 *
 * Nad bajty, ne nad stringem: fotka je binární a převod na text by ji rozbil.
 * Hledá se hranice, každý díl se rozpadne na hlavičky a tělo.
 */
function parseMultipart(buffer, boundary) {
  const sep = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(sep);
  if (start === -1) return parts;
  start += sep.length;

  while (start < buffer.length) {
    // Konec těla pozná koncová hranice "--boundary--".
    if (buffer[start] === 0x2d && buffer[start + 1] === 0x2d) break;
    // Přeskočit CRLF za hranicí.
    start += 2;

    const headerEnd = buffer.indexOf("\r\n\r\n", start);
    if (headerEnd === -1) break;
    const headers = buffer.subarray(start, headerEnd).toString("utf8");
    const bodyStart = headerEnd + 4;

    const next = buffer.indexOf(sep, bodyStart);
    if (next === -1) break;
    // Před hranicí je vždycky CRLF, který k obsahu nepatří.
    const body = buffer.subarray(bodyStart, next - 2);

    const name = /name="([^"]*)"/.exec(headers)?.[1] ?? "";
    const filename = /filename="([^"]*)"/.exec(headers)?.[1];
    parts.push({ name, filename, body });

    start = next + sep.length;
  }
  return parts;
}

/** Jméno souboru z cizího zařízení nesmí zasahovat mimo cílovou složku. */
function safeName(name, fallback) {
  const base = path.basename(name ?? "").replace(/[^\w.-]/g, "_");
  return base && base !== "." && base !== ".." ? base : fallback;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  // Appka běží v WebView na jiném původu, bez tohohle ji prohlížeč zastaví.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Sem posílá poznámky appka BetterNotes. Ručně tu není co dělat.\n");
    return;
  }

  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(req.headers["content-type"] ?? "");
  if (!boundary) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Chybí multipart/form-data." }));
    return;
  }

  try {
    const parts = parseMultipart(await readBody(req), boundary[1] ?? boundary[2]);
    const field = (name) => parts.find((p) => p.name === name && !p.filename)?.body.toString("utf8") ?? "";

    const title = field("title") || "Poznámka";
    const text = field("text");
    const tags = field("tags");
    const images = parts.filter((p) => p.name === "images" && p.filename);

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const dir = path.join(SAVE_DIR, `${stamp}_${safeName(title, "poznamka").slice(0, 40)}`);
    await mkdir(dir, { recursive: true });

    // Markdown, ne holý text: titulek a štítky mají kam jít a fotky se dají
    // odkázat, takže se soubor dá rovnou otevřít v čemkoli.
    const header = [`# ${title}`, "", tags ? `Štítky: ${tags}` : null, tags ? "" : null]
      .filter((l) => l !== null)
      .join("\n");
    const gallery = images.map((img) => `![](${safeName(img.filename, "fotka.jpg")})`).join("\n");
    await writeFile(
      path.join(dir, "poznamka.md"),
      [header, text, gallery && `\n${gallery}`].filter(Boolean).join("\n") + "\n",
      "utf8",
    );

    for (const [i, img] of images.entries()) {
      await writeFile(path.join(dir, safeName(img.filename, `fotka-${i + 1}.jpg`)), img.body);
    }

    console.log(`✓ ${title} → ${dir}${images.length ? ` (${images.length} fotek)` : ""}`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", dir }));
  } catch (err) {
    console.error("Poznámku se nepodařilo uložit:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(err) }));
  }
});

/**
 * Windows Firewall blokuje příchozí spojení na node.exe, dokud pro něj
 * neexistuje pravidlo. Server přitom naběhne úplně normálně, takže z jeho
 * strany nic nenapovídá - a v telefonu to vypadá jako by byla špatně adresa.
 *
 * Proto se to řekne rovnou při startu. Pravidlo se nedá založit odsud,
 * chce to příkazovou řádku spuštěnou jako správce.
 */
function firewallHint() {
  if (process.platform !== "win32") return;
  console.log("\nKdyby se telefon nedovolal, pustí node.exe přes firewall tenhle");
  console.log("příkaz v PowerShellu spuštěném jako správce:");
  console.log(
    `  New-NetFirewallRule -DisplayName "BetterNotes sync" -Direction Inbound ` +
      `-Action Allow -Protocol TCP -LocalPort ${PORT} -Profile Domain,Private`,
  );
}

await mkdir(SAVE_DIR, { recursive: true });
server.listen(PORT, "0.0.0.0", () => {
  console.log("BetterNotes — přijímací server běží.");
  console.log(`Poznámky se ukládají do: ${SAVE_DIR}`);

  const addresses = localAddresses();
  if (addresses.length === 0) {
    console.log("\nPočítač nemá žádnou síťovou adresu - není připojený k Wi-Fi?");
  } else {
    console.log("\nV appce zadej do Nastavení → Adresa počítače:");
    for (const addr of addresses) console.log(`  ${addr}:${PORT}`);
  }

  console.log("\nTelefon i počítač musí být na stejné Wi-Fi.");
  firewallHint();
  console.log("\nKonec: Ctrl+C");
});

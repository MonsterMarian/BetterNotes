/**
 * Postaví web pro APK a orazítkuje ho číslem verze.
 *
 * Verze se propisuje přes `NEXT_PUBLIC_BUNDLE_VERSION` do buildu, takže appka
 * ví, co v sobě má, a dá se to přečíst v Nastavení. Bez toho by se nedalo
 * poznat, která verze v telefonu vlastně běží - a při hlášení chyby je to
 * první, na co je potřeba odpovědět.
 *
 * Spuštění: npm run build:web
 * Výstup:   out/
 */
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const version = new Date().toISOString().replace(/[-:T]/g, ".").slice(0, 16);

console.log(`Verze ${version} - stavím web…`);
const build = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_BUNDLE_VERSION: version },
});
if (build.status !== 0) process.exit(build.status ?? 1);

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

const files = await walk("out");
if (!files.includes("index.html")) {
  console.error("V out/ chybí index.html.");
  process.exit(1);
}

// Pojistka: web musí opravdu vědět, jakou verzi v sobě má. Kdyby build
// nedostal proměnnou, tichým výsledkem by byla appka hlásící "dev".
let stamped = false;
for (const rel of files) {
  if (!rel.endsWith(".html") && !rel.endsWith(".js")) continue;
  if ((await readFile(path.join("out", rel), "utf8")).includes(version)) {
    stamped = true;
    break;
  }
}
if (!stamped) {
  console.error(`Ve webu není číslo verze ${version} - build nedostal NEXT_PUBLIC_BUNDLE_VERSION.`);
  process.exit(1);
}

console.log(`\nHotovo: out/ (${files.length} souborů), verze ${version}`);
console.log("Dál: npm run android:release");

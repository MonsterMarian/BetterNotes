/**
 * Vygeneruje ikonu a splash screen pro Android z jednoho SVG.
 *
 * Proč skript a ne hotové PNG: assety se dají kdykoli přegenerovat ze zdroje,
 * takže se nerozejdou s paletou appky. Barvy odpovídají tokenům v globals.css
 * (--background a --progress v tmavém režimu).
 *
 * Spuštění: node scripts/android-assets.mjs
 */
import { readdir, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const RES = path.join("android", "app", "src", "main", "res");

const BG = "#000000";

/**
 * Značka ve stylu sesterských appek (žluté „p" P/_ayer): tlustý zaoblený tah
 * v sytě žluté s posunutým tmavším stínem na černé. Tady malé „n" jako notes,
 * jehož pravá nožka končí hrotem pera - a to pero píše „_", motiv /_.
 * Kreslí se na plátně 1024 a škáluje; barvy jsou změřené z ikony P/_ayer.
 */
const YELLOW = "#F9BE10";
const SHADE = "#C48A04";
const STROKE = 104;

function markLayer(fill, dx, dy) {
  return `<g transform="translate(${dx} ${dy})">
  <g fill="none" stroke="${fill}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M352 740 V500 A142 142 0 0 1 636 500 V600"/>
    <path d="M740 740 H840"/>
  </g>
  <path d="M584 600 H688 L650 718 Q636 752 622 718 Z" fill="${fill}" stroke="${fill}" stroke-width="12" stroke-linejoin="round"/>
</g>`;
}

const MARK = `<g transform="translate(-86 -40)">
  ${markLayer(SHADE, 22, 26)}
  ${markLayer(YELLOW, 0, 0)}
  <path d="M598 624 H674" stroke="${BG}" stroke-width="10" stroke-linecap="round"/>
</g>`;

function markSvg(size, inset = 0) {
  const pad = size * inset;
  const scale = (size - pad * 2) / 1024;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><g transform="translate(${pad} ${pad}) scale(${scale})">${MARK}</g></svg>`;
}

function iconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${BG}"/>
  ${markSvg(size, 0).replace(/<svg[^>]*>|<\/svg>/g, "")}
</svg>`;
}

/** Adaptivní ikona: kresba musí sedět do vnitřních 66 % plochy. */
function foregroundSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${markSvg(size, 0.12).replace(/<svg[^>]*>|<\/svg>/g, "")}
</svg>`;
}

function splashSvg(w, h) {
  const mark = Math.round(Math.min(w, h) * 0.26);
  const x = Math.round((w - mark) / 2);
  const y = Math.round((h - mark) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${BG}"/>
  <g transform="translate(${x} ${y})">${markSvg(mark, 0.02).replace(/<svg[^>]*>|<\/svg>/g, "")}</g>
</svg>`;
}

const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

async function write(file, buffer) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buffer);
}

/**
 * Úklid před generováním.
 *
 * Sesterské appky (mpL, MicroWins) se chytly na tom, že jim v `res` ležely
 * splashe ve variantách, které jejich skript nepsal - `-night` a `ldpi`
 * z původní šablony. Android si je v tmavém režimu vybíral přednostně, takže
 * appka při startu blikla cizím starým logem a ve světlém režimu to nešlo
 * poznat. Tady se to zatím nestalo; smazání předem je pojistka, aby nemohlo.
 */
async function purgeStale() {
  for (const dir of await readdir(RES, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    if (dir.name.split("-")[0] !== "drawable") continue;
    await rm(path.join(RES, dir.name, "splash.png"), { force: true });
  }
}

const LAUNCHER = { ldpi: 36, mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FOREGROUND = { ldpi: 81, mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const SPLASH = {
  ldpi: [240, 320],
  mdpi: [320, 480],
  hdpi: [480, 800],
  xhdpi: [720, 1280],
  xxhdpi: [960, 1600],
  xxxhdpi: [1280, 1920],
};

await purgeStale();

for (const [density, size] of Object.entries(LAUNCHER)) {
  const icon = await png(iconSvg(size));
  await write(path.join(RES, `mipmap-${density}`, "ic_launcher.png"), icon);
  await write(path.join(RES, `mipmap-${density}`, "ic_launcher_round.png"), icon);
  await write(
    path.join(RES, `mipmap-${density}`, "ic_launcher_foreground.png"),
    await png(foregroundSvg(FOREGROUND[density])),
  );
}

/*
 * Tmavá varianta je stejný obrázek jako světlá - splash je tmavý sám o sobě
 * (BG je z tmavého tématu), takže se v nočním režimu nemá co měnit. Psát
 * `-night` se přesto vyplatí: bez nich Android v tmavém režimu sáhne po tom,
 * co v `res` zbylo, a tak se sesterským appkám dostalo do startu cizí logo.
 */
for (const [density, [w, h]] of Object.entries(SPLASH)) {
  const port = await png(splashSvg(w, h));
  const land = await png(splashSvg(h, w));
  await write(path.join(RES, `drawable-port-${density}`, "splash.png"), port);
  await write(path.join(RES, `drawable-land-${density}`, "splash.png"), land);
  await write(path.join(RES, `drawable-port-night-${density}`, "splash.png"), port);
  await write(path.join(RES, `drawable-land-night-${density}`, "splash.png"), land);
}
const fallbackSplash = await png(splashSvg(480, 800));
await write(path.join(RES, "drawable", "splash.png"), fallbackSplash);
await write(path.join(RES, "drawable-night", "splash.png"), fallbackSplash);

// Adaptivní ikona kreslí pozadí barvou, ne obrázkem - proto sem, ne do PNG.
await write(
  path.join(RES, "values", "ic_launcher_background.xml"),
  Buffer.from(
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`,
  ),
);

console.log("Ikony a splash vygenerovány do", RES);

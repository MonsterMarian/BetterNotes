/**
 * Vygeneruje ikonu a splash screen pro Android z jednoho SVG.
 *
 * Proč skript a ne hotové PNG: assety se dají kdykoli přegenerovat ze zdroje,
 * takže se nerozejdou s paletou appky. Barvy odpovídají tokenům v globals.css
 * (--background a --progress v tmavém režimu).
 *
 * Spuštění: node scripts/android-assets.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const RES = path.join("android", "app", "src", "main", "res");

const BG = "#09090B";
const GREEN = "#4ADE80";
const INK = "#FAFAFA";

/**
 * List papíru s řádky, jeden řádek zelený.
 *
 * Ikona se v šuplíku aplikací kouká na 48 px, takže žádné detaily: obdélník
 * s ohnutým rohem a tři řádky. Zelený řádek je jediný barevný prvek - podle
 * něj se ikona pozná i v odstínech šedi.
 */
function markSvg(size, inset = 0) {
  const s = size;
  const pad = s * inset;
  const w = s - pad * 2;

  // List na výšku, vystředěný. Poměr 3:4 je papír, ne čtverec.
  const sheetW = w * 0.62;
  const sheetH = w * 0.78;
  const x = pad + (w - sheetW) / 2;
  const y = pad + (w - sheetH) / 2;
  const fold = sheetW * 0.3;
  const r = sheetW * 0.1;

  // Ohnutý roh vpravo nahoře: obrys listu jde kolem něj, ne přes něj.
  const sheet = `<path d="M ${x + r} ${y}
      L ${x + sheetW - fold} ${y}
      L ${x + sheetW} ${y + fold}
      L ${x + sheetW} ${y + sheetH - r}
      Q ${x + sheetW} ${y + sheetH} ${x + sheetW - r} ${y + sheetH}
      L ${x + r} ${y + sheetH}
      Q ${x} ${y + sheetH} ${x} ${y + sheetH - r}
      L ${x} ${y + r}
      Q ${x} ${y} ${x + r} ${y} Z"
    fill="${INK}"/>`;

  // Přehyb rohu tmavší, ať je vidět, že je papír ohnutý.
  const corner = `<path d="M ${x + sheetW - fold} ${y} L ${x + sheetW} ${y + fold} L ${x + sheetW - fold} ${y + fold} Z" fill="${BG}" opacity="0.25"/>`;

  const lineX = x + sheetW * 0.16;
  const lineW = sheetW * 0.68;
  const lineH = sheetH * 0.055;
  const lines = [0.42, 0.58, 0.74]
    .map((t, i) => {
      // Poslední řádek je kratší, aby text vypadal jako text a ne jako mřížka.
      const width = i === 2 ? lineW * 0.6 : lineW;
      return `<rect x="${lineX}" y="${y + sheetH * t}" width="${width}" height="${lineH}" rx="${lineH / 2}" fill="${i === 0 ? GREEN : BG}" opacity="${i === 0 ? 1 : 0.55}"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${sheet}${corner}${lines}</svg>`;
}

function iconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${BG}"/>
  ${markSvg(size, 0.06).replace(/<svg[^>]*>|<\/svg>/g, "")}
</svg>`;
}

/** Adaptivní ikona: kresba musí sedět do vnitřních 66 % plochy. */
function foregroundSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${markSvg(size, 0.26).replace(/<svg[^>]*>|<\/svg>/g, "")}
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

const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const SPLASH = {
  mdpi: [320, 480],
  hdpi: [480, 800],
  xhdpi: [720, 1280],
  xxhdpi: [960, 1600],
  xxxhdpi: [1280, 1920],
};

for (const [density, size] of Object.entries(LAUNCHER)) {
  const icon = await png(iconSvg(size));
  await write(path.join(RES, `mipmap-${density}`, "ic_launcher.png"), icon);
  await write(path.join(RES, `mipmap-${density}`, "ic_launcher_round.png"), icon);
  await write(
    path.join(RES, `mipmap-${density}`, "ic_launcher_foreground.png"),
    await png(foregroundSvg(FOREGROUND[density])),
  );
}

for (const [density, [w, h]] of Object.entries(SPLASH)) {
  await write(path.join(RES, `drawable-port-${density}`, "splash.png"), await png(splashSvg(w, h)));
  await write(path.join(RES, `drawable-land-${density}`, "splash.png"), await png(splashSvg(h, w)));
}
await write(path.join(RES, "drawable", "splash.png"), await png(splashSvg(480, 800)));

// Adaptivní ikona kreslí pozadí barvou, ne obrázkem - proto sem, ne do PNG.
await write(
  path.join(RES, "values", "ic_launcher_background.xml"),
  Buffer.from(
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`,
  ),
);

console.log("Ikony a splash vygenerovány do", RES);

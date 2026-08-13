/**
 * Fotky v poznámkách.
 *
 * V poznámce je jen jméno souboru, bajty leží mimo stav appky - obrázek
 * v base64 uvnitř localStorage by úložiště přeplnil po pár fotkách.
 *
 * Dvě prostředí, jedno API:
 *  - v telefonu (Capacitor) soubory v `Directory.Data`
 *  - v prohlížeči při vývoji IndexedDB, protože fotky se do localStorage
 *    taky nevejdou
 *
 * Fotka se před uložením zmenší. Z foťáku chodí osmimegapixelové snímky,
 * které se v kartě stejně zobrazí na 300 px, ale odeslání na PC by s nimi
 * trvalo dýl než napsání celé poznámky.
 */
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { isNative } from "./native";
import { createId } from "./utils";

const DIR = "images";
const MAX_EDGE = 1600;
const QUALITY = 0.72;

export type PhotoSource = "camera" | "gallery";

// --- zmenšení ---------------------------------------------------------------

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Obrázek se nepodařilo načíst."));
    img.src = src;
  });
}

/**
 * Zmenší delší hranu na `MAX_EDGE` a překóduje do JPEGu. Menší obrázky
 * nechává být - zvětšovat je nemá smysl a překódování by jim jen ubralo.
 *
 * Když canvas selže (starý WebView, zamčené plátno), vrátí se původní data.
 * Velká fotka je pořád lepší než žádná.
 */
export async function shrinkDataUrl(dataUrl: string): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const edge = Math.max(img.width, img.height);
    if (edge <= MAX_EDGE) return dataUrl;

    const scale = MAX_EDGE / edge;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", QUALITY);
  } catch {
    return dataUrl;
  }
}

function splitDataUrl(dataUrl: string): { mime: string; base64: string } {
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return { mime: "image/jpeg", base64: "" };
  return { mime: match[1] || "image/jpeg", base64: match[2] ?? "" };
}

// --- úložiště v prohlížeči (IndexedDB) --------------------------------------

const DB_NAME = "betternotes-images";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB se neotevřela."));
  });
}

function dbRun<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = work(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Zápis do IndexedDB selhal."));
        tx.oncomplete = () => db.close();
      }),
  );
}

// --- veřejné API ------------------------------------------------------------

/**
 * Uloží obrázek z data URL a vrátí jméno, které patří do poznámky.
 * Volá se i z importu zálohy, proto je oddělené od focení.
 */
export async function saveImage(dataUrl: string): Promise<string> {
  const shrunk = await shrinkDataUrl(dataUrl);
  const { base64 } = splitDataUrl(shrunk);
  const name = `${createId("img")}.jpg`;

  if (isNative()) {
    await Filesystem.writeFile({
      path: `${DIR}/${name}`,
      data: base64,
      directory: Directory.Data,
      recursive: true,
    });
  } else {
    await dbRun("readwrite", (s) => s.put(shrunk, name));
  }
  return name;
}

/** Data URL pro `<img src>`. `null` = soubor chybí (smazaný, rozbitá záloha). */
export async function readImage(name: string): Promise<string | null> {
  try {
    if (isNative()) {
      const file = await Filesystem.readFile({
        path: `${DIR}/${name}`,
        directory: Directory.Data,
      });
      // Bez `encoding` vrací Filesystem base64 jako string.
      return typeof file.data === "string" ? `data:image/jpeg;base64,${file.data}` : null;
    }
    const stored = await dbRun<string | undefined>("readonly", (s) => s.get(name));
    return stored ?? null;
  } catch {
    return null;
  }
}

export async function deleteImage(name: string): Promise<void> {
  try {
    if (isNative()) {
      await Filesystem.deleteFile({ path: `${DIR}/${name}`, directory: Directory.Data });
    } else {
      await dbRun("readwrite", (s) => s.delete(name));
    }
  } catch {
    // Soubor už není - výsledek je stejný, jako kdyby se smazal teď.
  }
}

export async function deleteImages(names: string[]): Promise<void> {
  await Promise.all(names.map(deleteImage));
}

/** Jména všech uložených fotek - pro úklid sirotků (viz `orphanImages`). */
export async function listImages(): Promise<string[]> {
  try {
    if (isNative()) {
      const res = await Filesystem.readdir({ path: DIR, directory: Directory.Data });
      return res.files.map((f) => f.name);
    }
    const keys = await dbRun<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
    return keys.filter((k): k is string => typeof k === "string");
  } catch {
    // Adresář ještě nevznikl - žádné fotky, žádní sirotci.
    return [];
  }
}

/**
 * Vyfotí nebo vybere obrázek a rovnou ho uloží.
 *
 * V prohlížeči Capacitor Camera bez PWA elementů spadne, takže se sáhne po
 * obyčejném `<input type=file>`. Bez toho by se appka nedala vyzkoušet jinde
 * než v telefonu.
 */
export async function capturePhoto(source: PhotoSource): Promise<string | null> {
  const dataUrl = isNative() ? await nativePhoto(source) : await filePickerPhoto();
  if (!dataUrl) return null;
  return saveImage(dataUrl);
}

async function nativePhoto(source: PhotoSource): Promise<string | null> {
  const photo = await Camera.getPhoto({
    quality: 85,
    allowEditing: false,
    correctOrientation: true,
    resultType: CameraResultType.DataUrl,
    source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
  });
  return photo.dataUrl ?? null;
}

function filePickerPhoto(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    // Zrušený dialog neohlásí nic, takže by promise visel navždy. Pojistka
    // po návratu fokusu ho ukončí; když soubor přece jen přijde, `onchange`
    // doběhne první a resolve se podruhé neuplatní.
    window.addEventListener(
      "focus",
      () => setTimeout(() => resolve(null), 800),
      { once: true },
    );
    input.click();
  });
}

/** Bajty fotky pro odeslání na PC. */
export async function imageBlob(name: string): Promise<Blob | null> {
  const dataUrl = await readImage(name);
  if (!dataUrl) return null;
  const { mime, base64 } = splitDataUrl(dataUrl);
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

# AgentMEMORY — BetterNotes

Aktualizováno: 2026-11-18 10:17

## Cíl repa
Offline zápisník na Android (Next.js export + Capacitor). Poznámky v telefonu, checklisty
v textu, diktování česky, volitelná synchronizace přes Supabase. Nové verze jdou do telefonu
přes OTA (bez přeinstalace APK).

## Stav a jak spustit
- `npm run dev` (port 3000), `npm run type-check`, `npm test` (vitest), `npm run build`.
- **OTA vydání:** `npm run ota:bundle` → `ota/bundle-<verze>.json` + `ota/latest.json`;
  pak commit + push na `main`. Telefon si balík stáhne z raw.githubusercontent.com. APK se
  dělá jen při změně nativních pluginů.
- Velká specifikace redesignu 2.0 je v `REDESIGN_SPEC.md` (invarianty I1–I18 platí dál).
- Rychlá vizuální kontrola: dev server + do `localStorage["betternotes:state"]` vložit
  `{ version: 2, notes: [...] }` a obnovit stránku.

## Hotovo
- 2026-11-18: přestavba ve stylu systémových Poznámek (Xiaomi): kompaktní karty v seznamu
  (2 řádky, ~70 px, vejde se ~7), kategorie nahoře bez posouvání do boku, vlastní kategorie,
  lišta editoru bez posouvání do boku (checkbox vždycky vidět).

## Rozhodnutí a poznámky
- **Kategorie = štítky** (`note.tags` + `#hashtagy` v textu). Žádná změna datového modelu ani
  synchronizace. Ručně založené prázdné kategorie žijí v `prefs.categories` (localStorage,
  jdou i do zálohy). Smazat jde jen prázdná ručně založená kategorie (tlačítko v prázdném stavu).
- Nová poznámka založená v otevřené kategorii do ní rovnou patří (`newNote` v `notes-list.tsx`).
- Filtry Připnuté/Úkoly/S fotkou/Barva jsou schované za čipem „Filtry"; „Nezařazené" je
  rychlý filtr `untagged`.
- Lišta editoru: v řádku max. 6 tlačítek (vejde se na 360 dp). Formátování je za „T" a
  rozbaluje se nad řádkem (grid 4 sloupce).
- Mřížka (view "grid") zůstala beze změny, kompaktní je jen seznam.
- **Past:** Python na Windows zapisuje CRLF, repo je LF. Při úpravách skriptem používat
  `open(..., newline='')`, jinak je diff přes celý soubor.

## Další kroky
- Hromadné zařazení vybraných poznámek do kategorie (lišta výběru) — zatím není.
- Přejmenování kategorie — zatím není.

## Log
- 2026-11-18 10:17 — redesign podle Xiaomi Poznámek (kompaktní karty, kategorie, lišta editoru) → hotovo, OTA 2026.11.18.09.16

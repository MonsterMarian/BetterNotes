# BetterNotes

Zápisník na Android, ve kterém poznámky zůstávají v telefonu. Žádný účet,
žádný cloud, funguje v letadle.

## Co umí

- **Poznámky** — název, text, fotky z foťáku i galerie, barevný proužek pro
  rychlé rozpoznání v seznamu, připnutí nahoru.
- **Štítky** — píšou se rovnou v poznámce, v seznamu se z nich stane filtr.
- **Hledání** — bez diakritiky a přes víc slov naráz: `mleko vikend` najde
  poznámku, která má „víkend" v názvu a „mléko" v textu.
- **Koš** — smazaná poznámka jde nejdřív do koše, vysypat se musí ručně.
- **Záloha** — celý zápisník včetně fotek do jednoho JSON souboru a zpátky.
- **Odeslání do počítače** — volitelné, pro chvíli, kdy se s poznámkou má
  pracovat dál na velké klávesnici. Viz níž.
- **Živé aktualizace** — appka si nové verze stahuje sama, bez přeinstalace
  APK (viz [ANDROID.md](ANDROID.md)).

Data leží v `localStorage`, fotky v souborech telefonu. Nikam se neposílají.

## Spuštění pro vývoj

```bash
npm install
npm run dev
```

Appka běží na `http://localhost:3000`. V prohlížeči zastoupí foťák obyčejný
výběr souboru a fotky se ukládají do IndexedDB, takže se dá vyzkoušet všechno
kromě nativních drobností (vibrace, splash, tlačítko Zpět).

## Odeslání do počítače

Na počítači se spustí přijímací server:

```bash
node tools/sync-server.mjs
```

Vypíše adresy, na kterých je vidět z telefonu. Jednu z nich stačí zadat
v appce do **Nastavení → Adresa počítače**. Poznámky pak přistávají ve složce
`prijate-poznamky/` jako `poznamka.md` plus fotky.

Telefon i počítač musí být na stejné Wi-Fi. Je to jednosměrné — nic se
nesynchronizuje zpátky.

## Sestavení APK

```bash
npm run android:release
```

Podrobnosti, podepisování a živé aktualizace popisuje [ANDROID.md](ANDROID.md).

## Technologie

- Next.js 15 (App Router, statický export)
- React 19, TypeScript ve `strict` režimu
- Tailwind CSS 4
- Capacitor 8 pro nativní obal
- Vitest na doménovou logiku

Doménová logika (`src/lib/notes.ts`, `storage.ts`, `sync.ts`) je oddělená od
Reactu a pokrytá testy — pravidla zápisníku se dají ověřit bez prohlížeče:

```bash
npm test
```

## Orientace v kódu

| Cesta | Co to je |
|---|---|
| `src/lib/notes.ts` | pravidla zápisníku — hledání, řazení, štítky, koš |
| `src/lib/storage.ts` | čtení a zápis stavu, nedůvěřivé parsování |
| `src/lib/images.ts` | fotky: foťák, zmenšení, úložiště (telefon i prohlížeč) |
| `src/lib/sync.ts` | odeslání poznámky do počítače |
| `src/lib/backup.ts` | záloha a obnova včetně fotek |
| `src/lib/live-update.ts` | živé aktualizace bez přeinstalace |
| `src/components/notes/` | seznam, karta, detail, koš |
| `tools/sync-server.mjs` | přijímací server pro počítač |

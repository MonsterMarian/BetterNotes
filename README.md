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

Vypíše adresu, na které je vidět z telefonu (něco jako `10.0.1.134:4545`).
Tu stačí opsat v appce do **Nastavení → Adresa počítače** — schéma ani cestu
doplňovat netřeba, appka si je dodá sama. Poznámky pak přistávají ve složce
`prijate-poznamky/` jako `poznamka.md` plus fotky.

Žádná databáze v tom není: telefon pošle jeden HTTP požadavek, server zapíše
soubory na disk. Je to jednosměrné — nic se nesynchronizuje zpátky.

**Když se telefon nedovolá**, projdi tohle popořadě:

1. **Stejná Wi-Fi?** Telefon nesmí být na mobilních datech ani na jiné síti.
   Na oddělené síti pro hosty to taky nepůjde.
2. **Firewall.** Windows blokuje příchozí spojení na `node.exe`, dokud pro něj
   nemá pravidlo. Server naběhne normálně, takže nic nenapovídá — z telefonu
   to vypadá jako špatná adresa. Jednorázově v PowerShellu **jako správce**:

   ```powershell
   New-NetFirewallRule -DisplayName "BetterNotes sync" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4545 -Profile Domain,Private
   ```

3. **Změněná adresa.** Přiděluje ji router přes DHCP, takže se po restartu
   může posunout. Server ji při startu vždycky vypíše znovu; kdo to nechce
   řešit, zamluví si na routeru pro počítač pevnou adresu.

## Instalace do telefonu

Hotové podepsané APK leží přímo v repozitáři: **[BetterNotes.apk](BetterNotes.apk)**.
Stáhni ho do telefonu a otevři — Android se jednorázově zeptá na povolení
instalovat z toho zdroje.

Vlastní sestavení:

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

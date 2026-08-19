# BetterNotes

Zápisník na Android, ve kterém poznámky zůstávají v telefonu. Funguje offline,
v letadle i bez signálu. Účet je potřeba jedině pro volitelné odesílání
poznámek do počítače — bez něj appka funguje celá.

## Co umí

- **Poznámky** — název, text, fotky z foťáku i galerie, barevný proužek pro
  rychlé rozpoznání v seznamu, připnutí nahoru.
- **Štítky** — píšou se rovnou v poznámce, v seznamu se z nich stane filtr.
- **Voice mode** — poznámka se dá nadiktovat. Text se píše rovnou do ní,
  mikrofon jede, dokud ho nezastavíš, a interpunkci i velká písmena říkáš
  nahlas. Viz [Diktování hlasem](#diktování-hlasem).
- **Hledání** — bez diakritiky a přes víc slov naráz: `mleko vikend` najde
  poznámku, která má „víkend" v názvu a „mléko" v textu.
- **Koš** — smazaná poznámka jde nejdřív do koše, vysypat se musí ručně.
- **Živé aktualizace** — appka si nové verze stahuje sama, bez přeinstalace
  APK (viz [ANDROID.md](ANDROID.md)).
- **Záloha** — celý zápisník včetně fotek do jednoho JSON souboru a zpátky.
- **Odeslání do počítače** — volitelné, pro chvíli, kdy se s poznámkou má
  pracovat dál na velké klávesnici. Viz níž.

Data leží v `localStorage`, fotky v souborech telefonu. Ven jde jen to, co sám
odešleš do počítače.

## Spuštění pro vývoj

```bash
npm install
npm run dev
```

Appka běží na `http://localhost:3000`. V prohlížeči zastoupí foťák obyčejný
výběr souboru a fotky se ukládají do IndexedDB, takže se dá vyzkoušet všechno
kromě nativních drobností (vibrace, splash, tlačítko Zpět).

## Diktování hlasem

V detailu poznámky **Diktovat**. Mikrofon zůstane zapnutý i mezi větami —
systémový rozpoznávač se po chvíli ticha vypíná sám, appka ho hned nastartuje
znovu a úseky skládá za sebe. Že se poslouchá, je vidět na liště dole; ta se
zavře tlačítkem **Konec**, systémovým Zpět, nebo řečeným „konec diktování“.

Text se píše rovnou do poznámky, na místo, kde byl kurzor. Rozpoznávač vrací
holá slova, takže interpunkci a velká písmena říkáš nahlas:

| Řekneš | Napíše se |
|---|---|
| tečka, čárka, otazník, vykřičník, dvojtečka, středník | `. , ? ! : ;` |
| uvozovky (dvakrát) | `„text“` |
| závorka … konec závorky | `(text)` |
| hashtag | `#štítek` — bez mezery, rovnou se z toho stane štítek |
| zavináč, lomítko, podtržítko | `@ / _` slepené se sousedním slovem |
| procenta, hvězdička, plus, rovná se, pomlčka | `% * + = –` |
| nový řádek, nový odstavec, odrážka | zlom řádku, prázdný řádek, `- ` |
| **velkými písmeny** | všechno další **VELKÝM**, dokud se neřekne *malými písmeny* |
| velké písmeno | jen nejbližší slovo velkým |
| konec diktování | vypne mikrofon |

Celý seznam je i v appce pod otazníkem vedle tlačítka Diktovat. Po tečce se
další věta začíná velkým sama, stejně jako první slovo v prázdné poznámce.

Příkaz musí být celé slovo — „tečkovaný“ zůstane slovem. Pozná se i bez
diakritiky, takže na přepisu „tecka“ nezáleží. Pravidla jsou v
[`src/lib/voice-commands.ts`](src/lib/voice-commands.ts) a pokrytá testy.

Rozpoznávač je systémový (Google), takže diktování potřebuje oprávnění
k mikrofonu — appka si o něj řekne při prvním spuštění. Odepřené oprávnění
nic neshodí, jen se ukáže hláška. V prohlížeči na počítači se místo toho
použije Web Speech API, pokud ho prohlížeč má.

## Odeslání do počítače

Volitelné. Poznámka jde z telefonu do databáze a počítač si ji odtud vyzvedne:

```
telefon  →  Supabase (databáze + úložiště fotek)  →  počítač
```

Telefon a počítač se tedy nemusí vidět. Funguje to i na mobilních datech, i
když je počítač zrovna vypnutý, a nezajímá to firewall ani jakou má počítač
adresu — obě strany jen samy volají ven. Poznámka počká ve frontě, dokud si ji
počítač nestáhne.

Je to jednosměrné: nic se nesynchronizuje zpátky a zápisník v telefonu zůstává
zdrojem pravdy.

### Nastavení (jednou)

1. **Založ projekt** na [supabase.com](https://supabase.com) — stačí free tier.

2. **Vytvoř tabulku a úložiště.** V Supabase otevři *SQL Editor → New query*,
   vlož obsah [`supabase/schema.sql`](supabase/schema.sql) a spusť. Skript jde
   pustit opakovaně, aniž by něco rozbil — a po každé změně schématu se pustit
   **má**. Poslední změna přidala `note_id` a unikátní index, díky kterému
   se opakovaně odeslaná poznámka ve frontě přepíše místo zdvojení. Než skript
   proběhne, appka posílá postaru a duplikáty vznikat můžou.

3. **Vyplň údaje.** Zkopíruj `.env.local.example` jako `.env.local` a doplň
   `NEXT_PUBLIC_SUPABASE_URL` a `NEXT_PUBLIC_SUPABASE_ANON_KEY` — najdeš je
   v Supabase pod *Project Settings → Data API*. `.env.local` je mimo git.

4. **Sestav appku s těmi údaji** a nainstaluj do telefonu:

   ```bash
   npm run android:release
   ```

   Adresa a klíč se vypékají do buildu, ne do Nastavení — anon klíč je dlouhý
   JWT a opisovat ho prstem do telefonu je trest.

5. **Založ účet.** V telefonu *Nastavení → Odesílání do počítače* → e-mail,
   heslo → **Založit účet**. Stejné údaje pak dopiš do `.env.local` jako
   `BETTERNOTES_EMAIL` a `BETTERNOTES_PASSWORD`.

   Podle toho účtu databáze pozná, čí poznámky jsou. Nic jiného je u sebe
   nedrží — `anon` klíč je veřejný a sám o sobě nedává přístup k ničemu.

### Používání

V telefonu: otevřít poznámku → **Odeslat do počítače**.

Na počítači:

```bash
node tools/sync-pull.mjs
```

Stáhne, co čeká, a skončí. S `--watch` zůstane běžet a ptá se každou minutu.
Poznámky přistávají ve složce `prijate-poznamky/` jako `poznamka.md` plus fotky.

Stažené se v databázi jen označí, nemažou se — kdyby zápis na disk selhal,
poznámka zůstane ve frontě a příští běh ji zkusí znovu.

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
| `src/lib/dictation.ts` | mikrofon: nepřetržité poslouchání v telefonu i prohlížeči |
| `src/lib/voice-commands.ts` | z nadiktovaných slov napsaný text (interpunkce, velká písmena) |
| `src/lib/sync.ts` | odeslání poznámky do počítače |
| `src/lib/backup.ts` | záloha a obnova včetně fotek |
| `src/lib/live-update.ts` | živé aktualizace bez přeinstalace |
| `src/components/notes/` | seznam, karta, detail, koš |
| `src/lib/supabase.ts` | připojení k databázi a překlad chybových hlášek |
| `supabase/schema.sql` | tabulka fronty, RLS policy a bucket na fotky |
| `tools/sync-pull.mjs` | stahování poznámek do počítače |

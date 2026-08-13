# BetterNotes jako Android appka

Appka běží v telefonu offline ze souborů v APK. Není to zástupce na web —
nativní obal (Capacitor) drží WebView, splash screen, ikonu, stavovou lištu,
hardwarové tlačítko Zpět, foťák a vibrace.

## Co je kde

| Cesta | Co to je |
|---|---|
| `capacitor.config.ts` | ID appky, jméno, barvy, chování splash screenu a lišt |
| `android/` | nativní projekt (Gradle). Generuje ho Capacitor, ruční úpravy přežijí |
| `android/app/src/main/res/` | ikony, splash, barvy a témata |
| `scripts/android-assets.mjs` | generátor ikon a splashe z jednoho SVG |
| `src/lib/native.ts` | most do nativní vrstvy (haptika, lišta, splash, tlačítko Zpět) |
| `out/` | statický export webu, který se do APK kopíruje |

## Nástroje na tomhle počítači

Nic z toho není nainstalované v systému — leží to vedle sebe v `C:\Android`
a build si na to sáhne sám.

- Android SDK: `C:\Android\sdk` (platform 35 a 36, build-tools 35 a 36)
  - cesta je zapsaná v `android/local.properties` **lomítky dopředu** —
    `sdk.dir=C:\Android\sdk` se v Java properties přečte jako `C:Androidsdk`
- JDK 21: `C:\Android\jdk\jdk-21.0.12+8`
  - Capacitor 8 se kompiluje na Javu 21, v systému je 17;
    build si vlastní JDK bere přes `org.gradle.java.home` v `android/gradle.properties`

## Sestavení APK

**Do telefonu vždy release verzi:**

```bash
npm run android:release
```

Výsledek: podepsané `BetterNotes.apk` v kořeni projektu. Verzuje se, takže
si ho jde stáhnout rovnou z GitHubu do telefonu.

Debug verze (`npm run android:apk`) je označená jako `debuggable` a řada
telefonů — hlavně Xiaomi, Samsung a cokoli s Play Protect — ji odmítne
nainstalovat hláškou „Aplikaci nelze nainstalovat". Debug build je na ladění
přes kabel, ne na normální používání.

## Instalace do telefonu

Přes kabel, když je v telefonu zapnuté ladění USB:

```bash
C:\Android\sdk\platform-tools\adb.exe install -r BetterNotes.apk
```

Bez kabelu: APK zkopíruj do telefonu (kabel, Disk, e-mail) a otevři ho tam.
Android se zeptá na povolení instalovat z tohoto zdroje — jednorázově potvrď.

## Oprávnění

V manifestu jsou jen `INTERNET` a `VIBRATE`. Foťák ani galerie nic nechtějí:
`@capacitor/camera` schválně nedeklaruje `CAMERA` a fotí přes systémovou
appku (`ACTION_IMAGE_CAPTURE`), takže snímek pořizuje ona a naší appce stačí
hotový soubor. Uživatel tím pádem nevidí žádnou žádost o oprávnění.

Kdyby v budoucnu bylo potřeba fotit uvnitř appky, `CAMERA` se do manifestu
musí dopsat — a od té chvíle si o něj bude muset appka za běhu říct sama.

`INTERNET` je v manifestu kvůli dvěma věcem: živým aktualizacím z GitHubu
a odesílání poznámky do počítače. Bez sítě funguje appka celá, jen tyhle dvě
věci nejdou.

## Živé aktualizace (bez přeinstalace)

Appka je hromada statických souborů, které Capacitor servíruje z telefonu.
Když se ty soubory vymění, po restartu běží nová verze — **bez instalace APK**.

Co takhle projde: všechno v `src/` — funkce, opravy, texty, vzhled.
Co neprojde: nativní část (nový plugin, oprávnění, ikona, `targetSdk`). Tam je
potřeba nové APK, ale to je párkrát za rok.

Adresa je zadrátovaná v `src/lib/live-update.ts` jako `DEFAULT_UPDATE_URL`,
takže se nikde nic nenastavuje — appka se aktualizuje sama.

### Vydání nové verze

```bash
npm run ota:bundle
```

Vyrobí `ota/bundle-<verze>.json` (celá appka v jednom souboru) a
`ota/latest.json` (manifest). Pak stačí commit a push — appka si při startu
stáhne manifest, porovná verzi a když je novější, stáhne balík a nasadí ho
**při dalším otevření**.

Nasazuje se schválně až při dalším startu: přepnutí za běhu by uživateli zmizela
obrazovka pod rukama.

**Číslo verze musí sedět mezi webem a manifestem.** `scripts/release.mjs` proto
staví web sám a předává mu verzi přes `NEXT_PUBLIC_BUNDLE_VERSION` — kdyby se
stavělo zvlášť, appka by po každé instalaci stahovala balík, který už v sobě má.
Skript to na konci kontroluje a při nesouladu skončí chybou.

### Nové APK

```bash
npm run android:release
```

Postaví balík i APK z jednoho buildu (takže mají stejnou verzi) a rovnou APK
podepíše do `BetterNotes.apk`. Nutné jen při zásahu do nativní části.

Samotné podepsání jde spustit i zvlášť: `npm run android:sign`. Schémata v1+v2+v3,
v4 vypnuté — to používá jen `adb install --incremental` a nechává po sobě
soubor `.apk.idsig`.

### Když se něco pokazí

**Nastavení → Aktualizace → Zpět na verzi z APK** zahodí stažené balíky.

Pojistka běží i bez zásahu: krátký skript v `<head>` (viz `src/app/layout.tsx`)
si při nasazení balíku poznamená, že se startuje. Když appka do deseti vteřin
nenaběhne a značku nesmaže, skript se sám vrátí k verzi z APK. Je schválně mimo
kód appky — rozbitý balík by ho jinak vůbec nespustil.

### Data při aktualizaci

Zůstávají. `localStorage` patří k adrese `localhost`, kterou výměna souborů
nemění. Stejně tak přeinstalace APK přes existující appku data nemaže —
maže je jen odinstalace.

## Změna ikony nebo splashe

Uprav SVG v `scripts/android-assets.mjs` a spusť:

```bash
npm run android:assets
```

Barvy tam odpovídají tokenům z `src/app/globals.css` (`--background`,
`--progress` v tmavém režimu). Když se změní paleta appky, změň je i tam
a přegeneruj.

## Podpisový klíč

Release se podepisuje klíčem z `android/betternotes.jks`, heslo je
v `android/keystore.properties`. Obojí je mimo git.

**Ten soubor zálohuj.** Android považuje appku podepsanou jiným klíčem za jinou
appku — bez původního klíče nejde vydat aktualizace, jde jen odinstalovat
a nainstalovat znovu, což smaže data.

Nový klíč (jen když se ten starý ztratí):

```bash
C:\Android\jdk\jdk-21.0.12+8\bin\keytool.exe -genkeypair -v -keystore android/betternotes.jks -alias betternotes -keyalg RSA -keysize 2048 -validity 10000
```

## Když se APK nedá nainstalovat

1. **Použil jsi debug APK?** Ber `app-release.apk`, ne `app-debug.apk`.
2. **Play Protect** — hlásí „Neznámá aplikace zablokována". Klepni na
   *Další podrobnosti → Přesto nainstalovat*.
3. **Povolení instalace** — telefon chce povolit instalaci konkrétní appce,
   ze které APK otevíráš (Soubory, Chrome). Nastavení nabídne samo.
4. **Starší verze v telefonu** s jiným podpisem — nejdřív odinstaluj.
5. **Android starší než 7.0** — appka nepojede, `minSdk` je 24 a níž ho
   Capacitor 8 nepustí.
6. **Poškozený přenos** — messengery APK překomprimují. Posílej kabelem
   nebo přes Disk.

## Data

Poznámky se ukládají do `localStorage` uvnitř WebView appky, fotky do souborů
v `Directory.Data`. Zůstávají po zavření i po restartu telefonu.
**Odinstalace appky je smaže.**

Záloha: **Nastavení → Data → Zálohovat**. V appce se soubor zapíše do cache
a otevře systémové sdílení, takže míří na Disk, do mailu, kamkoli — stahovací
odkaz jako v prohlížeči ve WebView nefunguje, proto `@capacitor/filesystem`
a `@capacitor/share`.

Obnova: **Načíst zálohu**. Přepíše všechny poznámky v telefonu — nepřidává
k nim. Fotky se ze zálohy uloží pod novými jmény, aby se netloukly s tím, co
už v telefonu leží.

Záloha nese celý stav zápisníku plus nastavení a fotky jako data URL. Formát
viz `src/lib/backup.ts`; načte i holý export stavu bez obálky.

## Odesílání do počítače

Volitelná jednosměrná cesta ven, ne synchronizace. Telefon zapíše poznámku do
databáze v Supabase a počítač si ji odtud vyzvedne skriptem
`tools/sync-pull.mjs`.

Podstatné je, že **obě strany jen samy volají ven**. Nikdo nic neposlouchá,
takže tomu firewall nemá co zakázat, nezáleží na tom, jakou má počítač adresu,
a telefon s počítačem se nemusí vidět ani být na stejné síti. Poznámka počká
ve frontě, dokud si ji počítač nestáhne — může to být za týden.

Postup nastavení je v [README](README.md), sekce „Odeslání do počítače".

### Kudy tečou data

| Kde | Co tam je |
|---|---|
| tabulka `notes_outbox` | fronta odeslaných poznámek: titulek, text, štítky, cesty k fotkám |
| bucket `note-images` | samotné fotky, ve složce pojmenované po uživateli |
| `pulled_at` | vyplní počítač, když si poznámku stáhne |

Řádky se po stažení nemažou, jen označí. Kdyby zápis na disk selhal, poznámka
zůstane ve frontě a příští běh ji zkusí znovu.

Fotky nejdou do databáze, ale do úložiště — řádek by s nimi nabobtnal na
megabajty a čtení fronty by se vleklo.

### Čím jsou data chráněná

`anon` klíč zabalený v APK je veřejný z definice: přečte si ho každý, kdo si
APK rozbalí, a je to tak zamýšlené. Sám o sobě ale nedává přístup k ničemu.

Data drží u sebe až RLS policy v `supabase/schema.sql`: bez přihlášení se
nikdo nedostane nikam a přihlášený vidí jen řádky se svým `user_id`. Stejně
tak fotky — policy porovnávají první část cesty s `auth.uid()`.

Skutečné tajemství je jen heslo k účtu. To je v `.env.local`, které je mimo git.

### Oprávnění a síť

Appce stačí `INTERNET`. Nešifrovaný provoz povolený nemá a nepotřebuje:
Supabase i GitHub jedou přes HTTPS.

(Do commitu `eec7a29` tu byl `network_security_config.xml`, který HTTP
povoloval — bylo to kvůli odesílání na server v místní síti. S Supabase odpadl
a s ním i to povolení.)

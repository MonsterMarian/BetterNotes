# Zadání z poznámek (16. 8. 2026)

Tři požadavky nadiktované do appky v telefonu. U každého je, co se má stát,
kde to v kódu sedí a podle čeho se pozná, že je hotovo.

---

## 1. Fotka v poznámce: zvětšit a ukázat ji v textu

**Poznámky:** „Když v app přidám obrázek a kliknu na něj, chci, aby se mi
ukázal/zvětšil, nebo se prostě napsal do toho textu, jako to má Google Docs."
a „Je potřeba, aby se fotka, která je přiložená, zobrazovala jako v textu,
tak jak to dělá Google Docs."

Dnes fotky visí jako malé čtverečky pod obrovským prázdným textovým polem
([note-detail.tsx](src/components/notes/note-detail.tsx),
[note-thumb.tsx](src/components/notes/note-thumb.tsx)) a klepnutí na ně
neudělá nic. Poznámka s jednou fotkou pak vypadá jako prázdná stránka
s razítkem dole.

**Dvě věci, obě jsou potřeba:**

**1a. Klepnutí na fotku ji otevře přes celou obrazovku.** Zavírá se klepnutím
mimo, tlačítkem zpět i systémovým gestem. Když má poznámka víc fotek, jde
mezi nimi přejíždět. Cíl je přečíst si, co je na screenshotu — tedy zoom
aspoň na plnou šířku displeje.

**1b. Fotka je vidět v textu, ne pod ním.** Jako v Google Docs: obrázek sedí
na svém místě mezi odstavci, text pokračuje pod ním. Prakticky to znamená,
že text a fotky musí mít společné pořadí, ne dva oddělené seznamy — tedy
zásah do modelu poznámky (`text: string` + `images: string[]`
v [src/lib/types.ts](src/lib/types.ts)).

Nejmenší cesta, která nerozbije starý stav: nechat `images` jak jsou a do
textu umět vložit značku odkazující na fotku (`![](jméno)` — markdown, který
už používá i stahovací skript na počítači). Poznámky bez značek se chovají
jako dnes: fotky se vykreslí na konci.

**Hotovo, když:** klepnutí na fotku ji otevře na celou obrazovku, fotka
vložená doprostřed textu se tam i vykreslí, stará poznámka vypadá jako dřív
a `npm test` prochází (zvlášť parsování stavu — nová podoba textu nesmí
shodit čtení starých dat).

---

## 2. Mřížka se láme, mezi kartami zůstávají díry

**Poznámka:** „Je tam bug se zarovnáváním, nechci tam takovéto mezery."
Screenshot: mřížka, kde levý sloupec má krátkou kartu, pravý dlouhou,
a pod krátkou zeje prázdno až k dalšímu řádku.

Mřížka je v [notes-list.tsx:182](src/components/notes/notes-list.tsx) —
`grid grid-cols-2 items-start`. Karty v jednom řádku mají různou výšku podle
délky úryvku, takže se řádky nezarovnají a vzniknou díry.

**Dvě možnosti, vyber podle toho, co líp sedne appce:**

- **Zednické zdivo (masonry):** `columns-2` místo `grid` — karty tečou pod
  sebe a díry zmizí. Pořadí se ale čte po sloupcích, ne po řádcích.
- **Stejná výška:** `items-stretch` a úryvek zkrátit na pevný počet řádků.
  Pořadí zůstane po řádcích, ale kratší poznámky mají prázdno uvnitř karty.

Pořadí poznámek je tříděné (`SORT_ORDERS`), takže čtení po sloupcích mate —
**doporučuju druhou možnost**, ať „první" poznámka zůstane vlevo nahoře.

**Hotovo, když:** v mřížce nejsou svislé díry mezi řádky, pořadí odpovídá
zvolenému řazení, a v seznamu (`view === "list"`) se nic nezměnilo.

---

## 3. Diktování poznámek hlasem

**Poznámka:** „Voice mode — voice diktování poznámek."

Do detailu poznámky přibude tlačítko mikrofonu, které převádí řeč na text
a píše ho do poznámky (česky).

**Pozor na prostředí.** Appka běží v Android WebView přes Capacitor.
`window.SpeechRecognition` tam většinou není — je to funkce Chromu, ne
WebView. Reálné cesty:

1. **Nativní plugin** (`@capacitor-community/speech-recognition`) — rozpozná
   řeč systémovým rozpoznávačem, funguje offline i online. Vyžaduje
   oprávnění `RECORD_AUDIO` v manifestu, a tím pádem **nové APK**.
2. **Systémová klávesnice** — mikrofon na Gboardu umí diktovat do libovolného
   pole už dnes, bez jediného řádku kódu. Stojí za to ověřit, jestli to
   nestačí, než se sáhne na oprávnění.

Podle toho, co appce půjde doručit: nové APK teď nejde nainstalovat kvůli
podpisovému klíči (viz [ANDROID.md](ANDROID.md)), takže varianta 1 čeká na
vyřešení klíče. Varianta 2 je k dispozici okamžitě.

**Hotovo, když:** v detailu poznámky jde spustit diktování, řeč se objevuje
v textu, zastavení je jasné a odepřené oprávnění appku neshodí, jen řekne
proč.

---

## Poznámka k doručení

Body 1 a 2 jsou čistě `src/`, doručí je **balíček živé aktualizace**
(`npm run ota:bundle` + push). Bod 3 ve variantě s pluginem potřebuje nové
APK, které dnes nejde nainstalovat přes stávající appku — viz podpisové klíče
v [ANDROID.md](ANDROID.md).

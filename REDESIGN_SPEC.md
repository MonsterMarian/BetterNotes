# BetterNotes 2.0: Redesign build spec ("Paper & Ink, Expressive")

Status: build-ready. Four engineers work in parallel (section F). All UI copy is Czech and exact. Code identifiers are English.

## 0. Hard constraints (non-negotiable)

1. Only change `src/**`, `src/app/globals.css` and `public/**`. Ship via OTA (`npm run ota:bundle`).
2. No new Capacitor or native plugins. Use only the ones already installed: app, camera, filesystem, haptics, share, splash-screen, status-bar, speech-recognition, and core WebView/SystemBars/`Capacitor.convertFileSrc`.
   - This rules out reminders, widgets, the share target, app shortcuts, a biometric lock, the Quick Settings tile and OCR. They are not in this release (see §B "Next APK").
3. Zero new npm runtime deps.
4. No binary files in `public/`, because the OTA bundler (`scripts/release.mjs`) writes every file as UTF-8 and corrupts binaries. That means:
   - no woff2 and no PNG;
   - SVG/CSS only;
   - fonts come from the system stack.
5. Fully offline: no CDN, no external fonts, no network at runtime except the existing OTA and Supabase calls.
6. Old data must load:
   - `STATE_VERSION` goes 1 → 2, with an explicit `migrateState` in `storage.ts`;
   - old backup JSON files (bare state or the `betternotes-backup` format) must restore;
   - tests cover both.
7. Every auditor invariant is preserved (list below). Reviewers reject any PR that breaks one.
8. Green on `npm run type-check`, `npm test`, `npm run build`.

### Invariants checklist (copy into each PR description)

- I1. Store actions have a stable identity: `useMemo(..., [])` and only functional `setState`. New actions follow the same rule.
- I2. `dropEmpty` runs only on the home list (`useEffect(() => dropEmpty(), [dropEmpty])`). It never runs on detail unmount.
- I3. Every new content field goes into all of these:
  - `isEmptyNote`
  - `CONTENT_KEYS`
  - `matchesQuery`
  - `noteTitle` / `noteExcerpt`
  - `parseNote`
  - backup
  - `noteToRow`

  In this release, checklists and formatting live in `text`, so there is no new *content* field. `archivedAt` and `day` are metadata (not content keys).
- I4. `create()` builds the note outside `setState`, returns it, and prepends functionally.
- I5. Orphan cleanup runs once after hydrate, via `stateRef`.
  - `images[]` is ownership. A marker without an entry gets its file deleted.
  - Photo add = marker + entry. Photo drop = both + delete the file.
- I6. The marker format `![](name)` on its own line is frozen.
  - Strip markers for title, excerpt, search, share and clipboard.
  - `sync-pull.mjs` depends on it.
- I7. `updateNote` does not bump `updatedAt` for pin, trash or archive.
- I8. Never render an empty state before `hydrated`.
- I9. Effects are StrictMode-safe:
  - autostart uses a ref guard (voice and the new `photo=` param);
  - portals render only after a `mounted` flag.
- I10. VoiceMode:
  - pure `transcribe`;
  - frozen base;
  - the bar is a back layer;
  - the mic stops on unmount;
  - all constants unchanged.
- I11. Caret memory survives blur. Toolbar buttons insert at the last caret.
- I12. Swipe: axis lock at 8 px, `touch-action: pan-y`, `setPointerCapture` in try/catch, click suppressed after a swipe.
- I13. `useLongPress`: cancel after more than 10 px of movement and suppress the click.
- I14. `/note/?id=` routing with `useSearchParams` inside `<Suspense>`. New routes are static (`/archive/`).
- I15. The Supabase client stays lazy and is never touched when `!isSupabaseConfigured()`.
- I16. OTA:
  - `layout.tsx` keeps `themeScript` and `rescueScript` in `<head>`;
  - `AppShell` keeps `hideSplash`, `syncStatusBar`, `markBootSucceeded`, and `applyPendingUpdate` → `checkForUpdate`;
  - plugins are imported statically;
  - no `await import()` and no `next/dynamic`.
- I17. Safe area goes through the `--mw-safe-*` vars and the `.mw-safe-*` / `.mw-pad-nav` classes.
- I18. Escape and back close only the topmost dialog.

---

## A. Vision

BetterNotes is the fastest way to get a thought out of your head on Android: tap, type, done, with no account, no limits and no network. It treats the shopping list, the meeting note and the voice memo as the same thing, a note that formats itself as you type and that you can tick off with your thumb. It is quiet paper for writing and expressive Material chrome for everything around it, and it never loses a word.

The three reasons people will love it:

1. **Capture in under 2 s.**
   - The FAB opens a focused editor.
   - The FAB menu offers Seznam, Diktovat, Fotka and Dnes.
   - Czech dictation with spoken punctuation is front and centre. No competitor does Czech this well.
2. **Lists and notes in one.** Checkboxes live inside normal text, tick without opening the keyboard, sink when done, and markdown-lite formats as you type. Keep still can't mix them.
3. **Nothing is ever lost.**
   - Undo on every action.
   - Archive is separate from trash.
   - An autosaved mirror copy on device.
   - A backup reminder.
   - The tagline "Bez účtu. Bez limitů. Tvoje data zůstávají v telefonu."

## B. Features

### P0: ships in this pass

| # | Feature | Why (one line) | Pkg |
|---|---|---|---|
| 1 | **Open-to-type**: FAB tap → new note, body focused, keyboard up (`?new=1`). Empty notes are discarded silently. | Capture speed is the #1 retention driver. Today it takes 2 extra taps. | 3,4 |
| 2 | **FAB menu** (long-press or chevron): Seznam, Diktovat, Fotka, Dnešní poznámka, Ze šablony | Keep's 2025 quick-create. Puts the dictation USP one tap away. | 2,3 |
| 3 | **Checklists in text**: `- [ ] ` / `- [x] `, tap to toggle in read mode without the keyboard, checked items sink, "Odškrtnout vše", "Smazat hotové", `3/7` badge on the card | The #1 daily use case. Mixed lists are Keep's best-known gap. | 1,3,4 |
| 4 | **Markdown-lite**: headings H1–H3, **tučně**, _kurzíva_, ~~přeškrtnutí~~, `kód`, odrážky, číslování, citace, oddělovač, auto-linked URLs. Read mode renders them; edit mode dims the syntax live. Format toolbar plus typing shortcuts (Enter continues lists, `[] ` → checkbox). | Bear's most-cited quality. Stored as plain markdown, so export is 1:1. | 1,2,4 |
| 5 | **Undo/redo in the editor** (toolbar) | Trust. A WebView textarea loses native undo with controlled input. | 1,4 |
| 6 | **Snackbar "Zpět" for every trash, archive, batch or "Smazat hotové" action**. Confirm dialogs only for irreversible actions: purge, empty trash, restore backup. | Removes three confirm dialogs plus `window.confirm`. Simplenote-level trust. | 1,2,3,4 |
| 7 | **Archive** (`archivedAt`, `/archive/`). Archived notes stay searchable. | Keeps home calm long-term without fear of deletion. | 1,3 |
| 8 | **Swipe**: left = Koš, right = Archivovat. Long-press multi-select with a contextual bar: Připnout, Barva, Archivovat, Smazat. | Core Android expectation. Phone-first. | 3 |
| 9 | **Quick filter chips**: Vše, Připnuté, Úkoly, S fotkou, Bez štítku, Barva, each `#štítek` | Keep's browsing model. Visual recognition beats reading titles. | 1,3 |
| 10 | **Better search**: ranking (title > tag > body, then recency), highlighter `<mark>` in title and snippet, a `#štítek` token filters by tag, archived notes are included | Retrieval is the long-term payoff. We already ignore diacritics. | 1,3 |
| 11 | **Grouped list**: Připnuté / Dnes / Včera / Tento týden / Tento měsíc / months, sticky headers. **Masonry 2-column grid** or list. Sort. | Scannable, calm, Keep-like. Today's grid stretches cards and leaves empty space. | 1,3 |
| 12 | **Daily note** ("Dnes"): one per day via `note.day`, titled "Pátek 13. listopadu" | Strongest habit loop (Craft, Obsidian). | 1,3 |
| 13 | **Templates** (6 built-in) | Removes blank-page friction for new users. | 1,3 |
| 14 | **Inline `#hashtags`** parsed from text; nested `#prace/projekt` (a parent filter matches its children) | The README already promises it. Organizing happens while writing. | 1 |
| 15 | **Editor footer**: "Upraveno 14:05 · 312 slov · 2 min čtení" | Costs nothing. Bear/iA polish. | 1,4 |
| 16 | **Durability**: debounced save with flush on hide, a visible save-failure banner, a mirror copy in `Directory.Data` used when localStorage is empty, the backup marker-rename bug fixed, a backup reminder card, "Poslední záloha" in Settings | "Never loses a note" is the promise. localStorage-only storage contradicts it. | 1,3,4 |
| 17 | **Fast photos**: `convertFileSrc` URLs instead of base64 over the bridge | Photo-heavy lists are slow today. | 1,4 |
| 18 | **Back button fixes**: dialogs, FAB menu and selection mode are back layers; `/trash` is no longer a root | Back currently exits the app from dialogs and from Trash. | 1,2,3 |
| 19 | **Design system**: M3 Expressive tokens, tinted cards, springs, haptics, empty states | "Looks like a dev tool" is a stated churn reason. | 2 |
| 20 | **Settings rebuilt**: Vzhled / Psaní / Záloha / Odeslat do počítače (only when configured) / O aplikaci with "Pro pokročilé" collapsed; theme "Podle systému"; serif font option (system Noto Serif) | Today Settings reads like a developer console. | 1,4 |
| 21 | **Dictation as hero**: vibrant toolbar while listening, textarea `readOnly` during dictation (fixes the overwrite bug), `?voice=1` from the FAB menu | Unique Czech differentiator. Fixes real data loss when typing during dictation. | 4 |
| 22 | **Share and copy** via the existing `@capacitor/share`, marker-stripped | Already installed. Moves into the overflow menu. | 4 |

### P1: next pass (same constraints)

1. `[[` note links with a picker, plus an "Odkazuje sem" backlinks list. `parseInline` already tokenizes `wikilink`; P0 renders it as plain text.
2. Version history ("Historie"):
   - per-note snapshots in `Directory.Data/history/<id>.json`, the last 20, every 5 minutes of editing;
   - a sheet with restore.
3. Find-in-note with next/prev.
4. Lightbox pinch and double-tap zoom.
5. Card → editor container transform via the View Transitions API, plus a reverse transition on back.
6. Markdown export: one `.md` per note in `Cache/export/`, sent with `Share.share({ files })`. Plus Google Keep Takeout JSON import.
7. OLED black theme. Drag-reorder checklist items. Recent searches. Pull-down-to-capture. One-time swipe coach mark.
8. Clean out dead PushWin code in `date.ts`/`utils.ts` and dead CSS.

**Next APK (out of scope here):**

- local-notifications reminders (Keep just removed its own, so this is the biggest gap to exploit);
- `SEND` intent share target;
- launcher shortcuts (Nová poznámka, Seznam, Diktovat);
- quick-capture widget;
- biometric lock;
- an auto-backup folder via SAF;
- after any of these, check `minAppVersion` in `live-update.ts`.

---

## C. Data model, migration, lib API (PKG1 owns; others consume exactly this)

### C1. Types (`src/lib/types.ts`)

```ts
export type NoteTone = "none" | "amber" | "green" | "blue" | "rose" | "violet" | "sand";
// NOTE_TONES: append { id: "sand", label: "Písková" }
export interface Note {
  id: string; title: string; text: string; images: string[]; tags: string[];
  tone: NoteTone; pinned: boolean; createdAt: ISOStamp; updatedAt: ISOStamp;
  deletedAt?: ISOStamp;
  /** Archived (hidden from home, searchable). Metadata, NOT a content key. */
  archivedAt?: ISOStamp;
  /** Set only on daily notes: the local date this note belongs to. Metadata. */
  day?: ISODate;
}
export const STATE_VERSION = 2;
```

Checklists and formatting are markdown inside `text`, so no new content field is needed (I3 stays simple).

### C2. Storage (`src/lib/storage.ts`)

```ts
export function migrateState(raw: Record<string, unknown>): Record<string, unknown>;
export function parseState(raw: unknown): BetterNotesState;   // = parse(migrateState(raw))
export function loadStateResult(): { state: BetterNotesState; found: boolean }; // found=false: no key or JSON error
export function loadState(): BetterNotesState;                 // kept: loadStateResult().state
export function saveState(state: BetterNotesState): boolean;   // false on quota or other error
export const MIRROR_FILE = "state-mirror.json";                // Directory.Data
export async function writeMirror(state: BetterNotesState): Promise<void>;     // native only; never throws
export async function readMirror(): Promise<BetterNotesState | null>;          // native only; parseState'd
```

`migrateState` runs as a stepwise switch keyed on `version`:
- A missing or non-number version is treated as 1.
- **1→2**: set `version: 2`. Notes pass through unchanged; the new fields are simply absent. Keep the switch even though step 1→2 is a no-op transform, because v3 will need it.
- If `version > STATE_VERSION` (an OTA rollback opened newer data), don't throw. Parse leniently. Known limit: the old v1 code would drop `archivedAt`/`day`/`sand`, so archived notes reappear on home and sand becomes none. No data is lost; document this in a code comment.

`parseNote` additions:
- `archivedAt`: same treatment as `deletedAt` (`stamp()`).
- `day`: kept only if it matches `/^\d{4}-\d{2}-\d{2}$/`.
- `tone()`: accepts `"sand"`.

### C3. Domain (`src/lib/notes.ts`): changed and new (existing signatures unchanged unless listed)

```ts
export function activeNotes(state): Note[];           // !deletedAt && !archivedAt
export function archivedNotes(state): Note[];         // !deletedAt && archivedAt
// liveNotes = !deletedAt (incl. archived), unchanged
export function noteTitle(note): string;  // title → (day ? dayTitle(day)) → first line → "Fotka" → "Bez názvu"
export function noteExcerpt(note, limit?): string; // skip the first line only when !title && !day
export function isEmptyNote(note): boolean;
//   CHANGED: text counts as empty when every line matches
//   /^\s*(?:[-*](?: \[[ xX]\])?|\d+\.|>|#{1,3})?\s*$/
//   (so an abandoned "- [ ] " from FAB "Seznam" is dropped). Title and images rules unchanged.
export function noteTags(note): string[];  // note.tags ∪ extractHashtags(note.text), deduped, in order
export function extractHashtags(text: string): string[];
//   /(^|[\s(])#(\p{L}[\p{L}\p{N}_\/-]*)/gu → normalizeTag; ignores "# Nadpis" and URL fragments
export function tagMatches(noteTag: string, filter: string): boolean; // equal, or startsWith(filter + "/")
export function tagCounts(state): { tag: string; count: number }[]; // CHANGED: uses noteTags over liveNotes
export function matchesQuery(note, query): boolean;  // CHANGED: uses parseQuery; "#x" tokens must tagMatch
export type QuickFilter = "all" | "pinned" | "todo" | "photos" | "untagged";
export const QUICK_FILTERS: { id: QuickFilter; label: string }[] = [
  { id: "all", label: "Vše" }, { id: "pinned", label: "Připnuté" }, { id: "todo", label: "Úkoly" },
  { id: "photos", label: "S fotkou" }, { id: "untagged", label: "Bez štítku" } ];
export interface NoteFilter {
  query?: string; tag?: string | null; order?: SortOrder;
  quick?: QuickFilter; tone?: NoteTone | null; scope?: "active" | "archive";
}
export function visibleNotes(state, filter?): Note[];
//   scope "active" (default): activeNotes, but when the query has words, archived notes are included too.
//   scope "archive": archivedNotes.
//   quick: pinned → n.pinned; todo → taskStats(text).done < total; photos → images.length>0;
//          untagged → noteTags(n).length===0.
//   tone: n.tone===tone.  tag: noteTags(n).some(t => tagMatches(t, tag)).
//   Query with words → rankNotes(found, query); else sortNotes(found, order).
export function archiveNote(state, id, now?): BetterNotesState;   // archivedAt=now, pinned=false, no updatedAt bump
export function unarchiveNote(state, id): BetterNotesState;       // removes archivedAt
export function trashNote(state, id, now?): BetterNotesState;     // CHANGED: also removes archivedAt
export function putNotes(state, notes: Note[]): BetterNotesState; // upsert whole objects by id, no stamp changes (undo)
export function findDailyNote(state, day: ISODate): Note | undefined; // liveNotes, n.day===day
export const CONTENT_KEYS: readonly ["title","text","images","tags","tone"]; // export it; unchanged values
```

### C4. New pure modules (all with tests; no React, no Capacitor)

**`src/lib/checklist.ts`**

```ts
export interface TaskLine { indent: number; done: boolean; body: string }
export function parseTask(line: string): TaskLine | null;            // /^(\s*)[-*] \[( |x|X)\] ?(.*)$/
export function lineRangeAt(text: string, offset: number): { start: number; end: number };
export function toggleTaskAt(text: string, offset: number, sink: boolean): string;
//   Toggles the task on the line containing offset. No-op if that line isn't a task.
//   sink: a newly checked line moves to the end of its contiguous task run;
//         an unchecked line moves to just before the first checked line of the run.
export function taskStats(text: string): { done: number; total: number };
export function uncheckAll(text: string): string;
export function removeChecked(text: string): string;
export function autoFormat(prev: string, next: string, caret: number): { text: string; caret: number } | null;
//   Called after every edit (IME-safe diff, no keydown). Handles:
//   (a) a single "\n" inserted after a list line → continue with "- ", "- [ ] ", "N+1. ", "> " (same indent);
//   (b) "\n" inserted after an EMPTY list item → remove that marker instead (exit the list);
//   (c) a line that becomes "[] " or "[ ] " → "- [ ] ";  "* " → "- ".  Returns null when nothing applies.
export type LineKind = "task" | "bullet" | "ordered" | "quote" | "h1" | "h2" | "h3";
export function toggleLinePrefix(text: string, start: number, end: number, kind: LineKind):
  { text: string; start: number; end: number }; // every line in the selection; toggles off if all already have it
export function wrapSelection(text: string, start: number, end: number, mark: "**" | "_" | "~~" | "`"):
  { text: string; start: number; end: number }; // empty selection inserts a pair and puts the caret between; unwraps if already wrapped
export function taskMarkerHit(text: string, offset: number): boolean; // caret lands inside "- [ ]" of a task line (edit-mode tap toggle)
```

**`src/lib/markdown.ts`**

```ts
export type MdBlock =
  | { type: "heading"; level: 1 | 2 | 3; at: number; contentAt: number; text: string }
  | { type: "task"; done: boolean; indent: number; at: number; contentAt: number; text: string }
  | { type: "bullet"; indent: number; at: number; contentAt: number; text: string }
  | { type: "ordered"; n: number; indent: number; at: number; contentAt: number; text: string }
  | { type: "quote"; at: number; contentAt: number; text: string }
  | { type: "hr"; at: number }
  | { type: "blank"; at: number }
  | { type: "paragraph"; at: number; contentAt: number; text: string };
export function parseMarkdown(text: string, base?: number): MdBlock[]; // one block per line; offsets absolute (base + …)
export type MdInline =
  | { type: "text" | "bold" | "italic" | "strike" | "code"; text: string; from: number }
  | { type: "link"; text: string; href: string; from: number }
  | { type: "tag"; text: string; tag: string; from: number }
  | { type: "wikilink"; text: string; title: string; from: number };
export function parseInline(text: string, base?: number): MdInline[];
//   `from` = absolute source offset of the token's first VISIBLE char (exact caret mapping on tap).
//   URLs: https?:// up to whitespace, trailing .,;:!?) trimmed.
export type EdClass = "" | "ed-marker" | "ed-heading" | "ed-done" | "ed-tag" | "ed-link" | "ed-bold" | "ed-italic" | "ed-code" | "ed-quote";
export function highlightLine(line: string): { text: string; cls: EdClass }[]; // concatenated text === line (tested)
```

**`src/lib/text-stats.ts`**

```ts
export function textStats(text: string): { words: number; chars: number; minutes: number }; // markers stripped; minutes = max(1, round(words/200))
export function formatStats(s): string; // "1 slovo" | "3 slova" | "312 slov · 2 min čtení" (reading time only when words ≥ 150)
```

**`src/lib/search.ts`**

```ts
export interface ParsedQuery { words: string[]; tags: string[] } // folded; "#x" tokens → tags (normalizeTag)
export function parseQuery(q: string): ParsedQuery;
export function rankNotes(notes: Note[], query: string): Note[]; // score: title 3, tag 2, body 1 per word; ties → updatedAt desc
export function highlightRanges(text: string, query: string): [number, number][]; // diacritics-insensitive, on ORIGINAL indices, merged
export function searchSnippet(note: Note, query: string, radius?: number): string; // around the first body hit, "…" ellipses, markers stripped
```

**`src/lib/groups.ts`**

```ts
export interface NoteGroup { key: string; label: string; notes: Note[] }
export function groupNotes(sorted: Note[], order: SortOrder, now?: Date): NoteGroup[];
//   pinned → { key:"pinned", label:"Připnuté" } first (only if any).
//   order "title" → the rest in one group { key:"all", label:"Ostatní" } (label hidden when it's the only group).
//   else by updatedAt|createdAt: "Dnes", "Včera", "Tento týden" (from Monday), "Tento měsíc",
//   then "Říjen" (this year) or "Říjen 2025". Months: Leden Únor Březen Duben Květen Červen Červenec Srpen Září Říjen Listopad Prosinec.
export function splitColumns<T>(items: T[], weight: (t: T) => number, cols: number): T[][]; // greedy into the shortest column, order kept per column
export function noteWeight(note: Note): number; // 2 + title lines + min(8, excerpt/40) + (images ? 5 : 0) + (tasks ? min(6, total) : 0)
```

**`src/lib/templates.ts`**

```ts
export interface NoteTemplate { id: string; label: string; title: string; text: string; tone: NoteTone; tags: string[] }
export const TEMPLATES: NoteTemplate[] = [
  { id:"nakup",  label:"Nákupní seznam", title:"Nákup",   text:"- [ ] ", tone:"green", tags:["nakup"] },
  { id:"schuzka",label:"Schůzka",        title:"Schůzka", text:"**Kdo:** \n**Kdy:** \n\n## Body\n- \n\n## Úkoly\n- [ ] ", tone:"blue", tags:[] },
  { id:"recept", label:"Recept",         title:"",        text:"## Suroviny\n- [ ] \n\n## Postup\n1. ", tone:"amber", tags:["recepty"] },
  { id:"denik",  label:"Deník",          title:"",        text:"## Za co jsem vděčný\n- \n\n## Co se dnes povedlo\n- \n\n## Na co se těším\n- ", tone:"violet", tags:["denik"] },
  { id:"ukoly",  label:"Úkoly na dnes",  title:"Dnes udělat", text:"- [ ] ", tone:"none", tags:[] },
  { id:"cesta",  label:"Cesta",          title:"Cesta",   text:"## Sbalit\n- [ ] Doklady\n- [ ] Nabíječka\n- [ ] Léky\n\n## Plán\n- ", tone:"sand", tags:["cesta"] },
];
export function templatePatch(t: NoteTemplate): Partial<Note>; // {title,text,tone,tags}
export function dailyPatch(day: ISODate): Partial<Note>;       // { day } (empty title/text → dropped if untouched)
```

**`src/lib/history.ts`** (editor undo)

```ts
export interface EditSnapshot { title: string; text: string; caret: number }
export interface EditHistory { past: EditSnapshot[]; future: EditSnapshot[]; lastAt: number }
export function createHistory(): EditHistory;
export function recordEdit(h: EditHistory, before: EditSnapshot, now: number): EditHistory;
//   Pushes `before` unless now - lastAt < 1000 (coalesces typing bursts). Clears future. Max 100.
export function undoEdit(h, current: EditSnapshot): { history: EditHistory; snapshot: EditSnapshot } | null;
export function redoEdit(h, current: EditSnapshot): { history: EditHistory; snapshot: EditSnapshot } | null;
```

Rule: a photo add or remove resets the history. Undo must never resurrect a marker whose file was deleted (I5).

**`src/lib/date.ts`** additions:

```ts
export function formatStamp(iso: ISOStamp, now?: Date): string; // "14:05" | "včera" | "12. 11." | "12. 11. 2025"
export function dayTitle(day: ISODate): string;                 // "Pátek 13. listopadu" (genitive months, capitalised weekday)
```

**`src/lib/inline-images.ts`** addition:

```ts
export function renameImageMarkers(text: string, renamed: Map<string, string>): string;
```

**`src/lib/backup.ts`**

- Fix the bug: `restoreBackup` must also remap markers in `note.text` using `renameImageMarkers`.
- Extract a pure `remapImages(state, renamed): BetterNotesState`. For markers with no renamed file, leave them in place (they render as ImageOff, not silent text loss).
- Add `exportBackup(...)`, which on success calls `setPrefs({ lastBackupAt: nowISO })`.
- Add `export function needsBackupNudge(prefs: Prefs, noteCount: number, now?: Date): boolean`. It returns true when:
  - `noteCount >= 5`, and
  - `lastBackupAt` is empty or older than 14 days, and
  - `backupNudgeDismissedAt` is empty or older than 7 days.

**`src/lib/prefs.ts`**

```ts
export interface Prefs { view; order; trashAfterSync; supabaseUrl;
  haptics: boolean;            // default true
  sinkChecked: boolean;        // default true
  editorFont: "sans" | "serif";// default "sans"
  lastBackupAt: string;        // ISO or ""
  backupNudgeDismissedAt: string; }
export type Theme = "dark" | "light" | "system";
export function applyTheme(theme: Theme): void;  // "system": removes THEME_KEY, sets the class from matchMedia
export function currentTheme(): Theme;           // reads THEME_KEY; absent → "system"
```

Every new field must be in `parsePrefs` (whitelist). `themeScript` already treats a missing key as the system preference.

**`src/lib/images.ts`** addition:

```ts
export async function imageSrc(name: string): Promise<string | null>;
//   native: Capacitor.convertFileSrc((await Filesystem.getUri({directory: Data, path:`images/${name}`})).uri)
//   web: readImage(name). Memoised in a Map. Caller falls back to readImage on <img onError>.
```

**`src/lib/native.ts`**

```ts
export type HapticKind = "tick" | "select" | "press" | "success" | "error";
export function haptic(kind: HapticKind): void; // no-op if !isNative() or !getPrefs().haptics; fire-and-forget
// tick=impact LIGHT, press=impact MEDIUM, select=selectionChanged, success/error=notification
// tapFeedback/winFeedback stay as aliases (tick/success). syncStatusBar colours → light "#FFF8F3", dark "#17130D".
```

### C5. Store (`src/components/providers/store-provider.tsx`)

```ts
export interface StoreApi {
  state; hydrated;
  saveFailed: boolean;                         // true after a failed saveState; cleared on the next success
  create; update; togglePin; addTag; removeTag; trash; restore; purge; dropEmpty; emptyTrash; replace; // unchanged
  archive: (id: string) => void;
  unarchive: (id: string) => void;
  putNotes: (notes: Note[]) => void;           // undo
  snapshot: (ids: string[]) => Note[];         // reads stateRef; stable identity
  updateMany: (ids: string[], patch: Partial<Pick<Note, "tone" | "pinned">>) => void;
  trashMany: (ids: string[]) => void;
  archiveMany: (ids: string[]) => void;
  toggleTask: (id: string, offset: number) => void; // checklist.toggleTaskAt with getPrefs().sinkChecked
}
```

Persistence:
- `saveState` is debounced 250 ms, and flushed immediately on `visibilitychange` → hidden and on `pagehide`.
- `writeMirror` (native) is debounced 3 s and also flushed on hide.
- Hydrate: `loadStateResult()`. If `!found` and native, try `readMirror()`. If the mirror has notes, use it and set `restoredFromMirror` so AppShell can show the toast "Poznámky obnoveny ze záložní kopie".
  - Expose this as `StoreApi.restoredFromMirror: boolean`.
- Move `deleteImages` out of the setState updaters: compute the result first, then `setState`, then delete. This keeps the I1 functional form by reading `stateRef` for the image names.

**`src/components/providers/use-undo.ts`** (new):

```ts
export function useUndo(): (opts: { message: string; ids: string[]; run: () => void }) => void;
// prev = snapshot(ids); run(); haptic("tick"); toast({ title: message, action: { label: "Zpět", onClick: () => putNotes(prev) } })
```

**`toast-provider.tsx`** API (rendering delegates to `<Snackbar>` from PKG2):

```ts
toast(t: { tone?: "success" | "info" | "warn"; title: string; description?: string;
           action?: { label: string; onClick: () => void }; duration?: number }): number; // default 6000 with action, else 4000
dismiss(id: number): void;
```

- Only one snackbar shows at a time; a new one replaces the old.
- The timer pauses while the snackbar is pressed.
- While visible it sets `document.documentElement.style --snackbar-h` to the snackbar's height plus 8px, and clears it to `0px` when hidden.

### C6. Tests to add (PKG1; vitest, node env)

- **`storage.test.ts`**
  - A literal v1 fixture loads with all fields preserved and `version === 2`. The fixture has no `version`, plus an unknown tone `"teal"`, a duplicate id, a legacy note without markers, and a bad stamp.
  - `archivedAt`/`day` are parsed and invalid `day` is dropped.
  - A v2 round trip deep-equals.
  - `version: 99` with unknown fields parses without throwing.
- **`backup.test.ts`**
  - `remapImages` rewrites both `images[]` and the `![](old)` markers.
  - The parse path of an old `betternotes-backup` v1 JSON and of a bare state.
- **`checklist.test.ts`**
  - toggle with and without sink;
  - autoFormat cases (a), (b) and (c), plus ordered numbering and indent;
  - `toggleLinePrefix` on and off for multiple lines;
  - `wrapSelection` wrap and unwrap;
  - `taskStats`, `uncheckAll`, `removeChecked`, `taskMarkerHit`.
- **`markdown.test.ts`**
  - every block type, plus absolute offsets with `base`;
  - inline nesting edge cases: an unclosed `**`, a URL with a trailing period;
  - `from` offsets;
  - `highlightLine` concatenation invariant across 20 sample lines.
- **`search.test.ts`**: ranking order, `#tag` token, highlight ranges on "Žluťoučký" for the query "zlut", snippet.
- **`groups.test.ts`**:
  - the boundaries Dnes/Včera/Tento týden/month, using a fixed `now` of Fri 2026-11-13;
  - month and year labels;
  - `splitColumns` balance.
- **`history.test.ts`**: coalescing, undo/redo symmetry, future cleared on a new edit.
- **`notes.test.ts`** additions:
  - archive/unarchive does not bump `updatedAt`;
  - trash clears `archivedAt`;
  - `putNotes` restores a trashed note;
  - the new `isEmptyNote` marker rule;
  - `noteTags` with hashtags, and that headings are not tags;
  - `tagMatches` nesting;
  - each `visibleNotes` quick filter and scope, with archived included on query;
  - `noteTitle` with `day`.
- **`prefs.test.ts`**: an old prefs object yields the new defaults; unknown values are rejected.
- **`text-stats`** in its own file or `markdown.test`: Czech plurals 1/3/5/0.

---

## D. Design system (PKG2 owns; others use only these names)

### D1. Colour tokens (`globals.css`: `:root` = light, `.dark` = dark)

| token | light | dark |
|---|---|---|
| `--surface` | #fff8f3 | #17130d |
| `--surface-lowest` | #ffffff | #110e08 |
| `--surface-low` | #fcf2e7 | #1f1b15 |
| `--surface-container` | #f6ece1 | #231f18 |
| `--surface-high` | #f1e7dc | #2e2922 |
| `--surface-highest` | #ebe1d6 | #39342d |
| `--on-surface` | #1f1b15 | #ebe1d6 |
| `--on-surface-variant` | #4f4537 | #d3c4b2 |
| `--outline` | #817565 | #9b8f7e |
| `--outline-variant` | #d3c4b2 | #4f4537 |
| `--primary` | #186b46 | #89d7a9 |
| `--on-primary` | #ffffff | #003921 |
| `--primary-container` | #a4f4c4 | #005232 |
| `--on-primary-container` | #005232 | #a4f4c4 |
| `--tertiary` | #7f7a00 | #e2d92e |
| `--highlight` (tertiary-container) | #f0e73d | #4c4900 |
| `--on-highlight` | #343200 | #f0e73d |
| `--inverse-surface` | #353029 | #ebe1d6 |
| `--inverse-on-surface` | #f9efe4 | #353029 |
| `--inverse-primary` | #89d7a9 | #186b46 |
| `--error` | #ba1a1a | #ffb4ab |
| `--on-error` | #ffffff | #690005 |
| `--error-container` | #ffdad6 | #93000a |
| `--on-error-container` | #410002 | #ffdad6 |
| `--scrim` | rgb(0 0 0/.32) | rgb(0 0 0/.32) |

**Tailwind `@theme inline` names.** Each token is exposed as `--color-<name>`, giving utilities such as:
- `bg-surface`, `bg-surface-low`, `bg-surface-container`, `bg-surface-high`, `bg-surface-highest`
- `text-on-surface`, `text-on-surface-variant`, `border-outline-variant`
- `bg-primary`, `text-on-primary`, `bg-primary-container`, `text-on-primary-container`
- `bg-highlight`, `text-on-highlight`, `bg-inverse-surface`, `text-inverse-on-surface`, `text-inverse-primary`
- `bg-error-container`, `text-on-error-container`, `text-error`

**Legacy aliases** (keep them so untouched code renders; delete in P1):

| legacy | maps to |
|---|---|
| background | surface |
| foreground | on-surface |
| card | surface-low |
| card-foreground | on-surface |
| popover | surface-high |
| primary-foreground | on-primary |
| secondary, muted, accent | surface-high |
| secondary-foreground, accent-foreground | on-surface |
| muted-foreground | on-surface-variant |
| destructive | error |
| destructive-foreground | on-error |
| border, input | outline-variant |
| ring | primary |
| progress | primary |
| progress-foreground | on-primary |
| progress-muted | primary-container |
| progress-muted-foreground | on-primary-container |
| mark | tertiary |
| mark-muted | highlight |
| mark-muted-foreground | on-highlight |
| track | surface-highest |

Usage rule: green means "act here" (FAB, primary buttons, caret, links). Highlighter means "found or selected" (search marks, the active chip, the pin glyph, selection). Never use both on the same element.

**Note tones.** `[data-tone=X]` sets `--note-bg`, `--note-accent` and `--note-on` (always `var(--on-surface)`). `none` sets `--note-bg: var(--surface-low)` and `--note-accent: var(--outline)`.

| tone | light bg | dark bg | accent light / dark |
|---|---|---|---|
| amber | #ffe7d4 | #503316 | #be721c / #fda54d |
| green | #d3f3d4 | #243f29 | #3f9458 / #75cb89 |
| blue | #e0ecff | #273a52 | #4587cc / #85bcff |
| rose | #ffe5e6 | #542e33 | #ca6472 / #ff9da8 |
| violet | #f1e7ff | #3d3552 | #8f75cc / #c4acff |
| sand | #fee8c8 | #443721 | #ae7a00 / #eaae3c |

Class `.note-surface { background: var(--note-bg, var(--surface-low)); color: var(--on-surface) }`. Delete `.note-stripe`.

### D2. Typography

- Font: `--font-sans: "Google Sans Flex","Google Sans Text","Google Sans",Roboto,system-ui,sans-serif` (local fonts only; no file shipped).
- `--font-serif: "Noto Serif","Droid Serif",Georgia,serif`.
- Remove `font-feature-settings "cv11","ss01"`.

Tailwind `@theme` text tokens, each with `--text-X--line-height`, `--text-X--font-weight` and `--text-X--letter-spacing`:

| class | size/line | wt | track |
|---|---|---|---|
| `text-display-sm` | 36/44 | 400 | 0 |
| `text-headline-lg` | 32/40 | 400 | 0 |
| `text-headline-md` | 28/36 | 400 | 0 |
| `text-headline-sm` | 24/32 | 400 | 0 |
| `text-title-lg` | 22/28 | 400 | 0 |
| `text-title-md` | 16/24 | 500 | .15px |
| `text-title-sm` | 14/20 | 500 | .1px |
| `text-body-lg` | 16/24 | 400 | .5px |
| `text-body-md` | 14/20 | 400 | .25px |
| `text-body-sm` | 12/16 | 400 | .4px |
| `text-label-lg` | 14/20 | 500 | .1px |
| `text-label-md` | 12/16 | 500 | .5px |
| `text-label-sm` | 11/16 | 500 | .5px |

- **Emphasized:** add `.emph` (font-weight 650, letter-spacing -0.5px). Use it for the large title "Poznámky" (`text-headline-lg emph`) and the editor title (`text-headline-md emph`).
- **Editor body:** class `.prose-note`: 17px/1.6, `max-width: 68ch`, paragraph spacing 0.75em in read mode. `.prose-note.serif` uses `--font-serif`.
- `caret-color: var(--primary)` on all inputs.

### D3. Shape

Tailwind `@theme`:

| class | radius |
|---|---|
| `rounded-xs` | 4 |
| `rounded-sm` | 8 |
| `rounded-md` | 12 |
| `rounded-lg` | 16 |
| `rounded-lg-plus` | 20 |
| `rounded-xl` | 28 |
| `rounded-xl-plus` | 32 |
| `rounded-2xl` | 48 |
| `rounded-full` | 9999 |

Mapping:
- Card: 20.
- Search bar: full, 56 px tall.
- FAB: 16 at 56 px, 28 for the large 96 px size.
- Chip: 8, or full when selected.
- Sheet and dialog: 28 on the top corners only.
- Floating toolbar: full, 64 px.
- Snackbar: 12.
- Inline image: 16.
- Checkbox: 6.

`.press-morph`: `:active` animates `border-radius` to 12px and `scale(.96)` with `--spring-fast`.

### D4. Elevation

Tonal surfaces first. Shadows only on floating elements:
- `--shadow-3: 0 1px 3px rgb(0 0 0/.15), 0 4px 8px 3px rgb(0 0 0/.08)` for the FAB, floating toolbar and snackbar.
- `--shadow-2: 0 2px 6px 2px rgb(0 0 0/.10)` for sheets and menus.

The top bar has no shadow. When scrolled it gets `.bar-scrolled { background: var(--surface-container) }`.

### D5. Motion tokens (verbatim)

```css
:root{
  --spring-fast: linear(0,.072,.238,.44,.638,.806,.934,1.021,1.071,1.092,1.093,1.081,1.063,1.044,1.026,1.012,1.002,.995,.992,.991,.992,.993,.995,.997,1); --dur-spring-fast: 350ms;
  --spring-default: linear(0,.048,.161,.301,.444,.576,.69,.784,.858,.913,.953,.98,.997,1.008,1.013,1.015,1.015,1.013,1.011,1.009,1.007,1.005,1.004,1.003,1); --dur-spring-default: 420ms;
  --spring-slow: linear(0,.047,.157,.294,.435,.567,.681,.775,.85,.906,.947,.976,.995,1.006,1.012,1.015,1.015,1.014,1.012,1.01,1.008,1.006,1.004,1.003,1); --dur-spring-slow: 570ms;
  --effects: linear(0,.053,.167,.301,.431,.547,.645,.726,.791,.841,.881,.911,.934,.951,.964,.973,.981,.986,.99,.992,.995,.996,.997,.998,1); --dur-effects: 220ms;
  --ease-standard: cubic-bezier(.2,0,0,1); --ease-emphasized-decel: cubic-bezier(.05,.7,.1,1); --ease-emphasized-accel: cubic-bezier(.3,0,.8,.15);
}
@supports not (transition-timing-function: linear(0, 1)) { :root { --spring-fast: var(--ease-emphasized-decel); --spring-default: var(--ease-emphasized-decel); --spring-slow: var(--ease-emphasized-decel); --effects: var(--ease-standard); } }
@media (prefers-reduced-motion: reduce) { :root { --spring-fast: var(--ease-standard); --spring-default: var(--ease-standard); --spring-slow: var(--ease-standard); } }
```

Rules:
- Transform, size and radius use springs. Opacity and colour use `--effects` and never overshoot.
- Exits take about 60% of the enter duration, on `--ease-emphasized-accel`.
- Never animate typed text.

Utility classes (contract):

| class | effect |
|---|---|
| `.anim-enter` | translateY(16px) + opacity → none, spring-default |
| `.anim-page` | translateY(24px) scale(.98) → none, spring-slow, used on the editor root |
| `.anim-pop` | scale .6 → 1, spring-fast |
| `.anim-fade` | opacity, effects |
| `.stagger > *` | `.anim-enter` with `animation-delay: calc(var(--i, 0) * 30ms)`, where `--i` is set inline |
| `.mw-pop` | kept, re-timed to spring-fast; used for the trash/archive count bump |

Delete `.mw-shine`, `.mw-rise`, `.mw-flash`, `.mw-reel` and `.animate-in-up` (`.animate-in-up` becomes an alias of `.anim-enter` until P1). Delete `.mw-fab-in`; the FAB uses `.anim-pop`.

Sheets and menus animate enter and exit with `@starting-style` plus `transition-behavior: allow-discrete`.

### D6. Feature CSS classes (contract for PKG3/PKG4)

**Search marks.** `mark.hl`:

```css
background: linear-gradient(var(--highlight), var(--highlight)) no-repeat 0 0 / 0% 100%;
color: var(--on-highlight);
border-radius: 4px 2px 5px 3px;
padding: 0 2px;
animation: hl-wipe 220ms var(--effects) forwards; /* background-size → 100% */
```

**Read-mode markdown:**

| class | style |
|---|---|
| `.md-h1` | 24/32, 650 |
| `.md-h2` | 20/28, 600 |
| `.md-h3` | 17/24, 600, `on-surface-variant` |
| `.md-quote` | 3px left border in `--note-accent`, padding-left 12, `on-surface-variant` |
| `.md-hr` | 1px `outline-variant`, margin 16 |
| `.md-code` | `surface-highest`, radius 4, mono 0.9em |
| `.md-link` | `primary`, underline offset 2 |
| `.md-tag` | `highlight` bg, `on-highlight`, radius 6, label-md |
| `.md-li` | hanging indent 1.25em × level, bullet "•" in `--note-accent` |
| `.md-task` | flex row, gap 10 |
| `.md-task-done` | text `line-through`, opacity .55, transition effects |
| `.md-check` | 22px box, 2px `outline` border, radius 6. Checked: `bg-primary`, `border-primary`, check SVG `on-primary`, which pops with `.anim-pop`. Min hit area 44px via `::after`. |

**Edit-mode overlay editor** (single source of truth for alignment):

```css
.ed-stack { display: grid; }
.ed-stack > * { grid-area: 1/1; font: inherit; letter-spacing: inherit; line-height: 1.6; padding: 0; margin: 0; border: 0;
                white-space: pre-wrap; overflow-wrap: anywhere; word-break: normal; tab-size: 4; }
.ed-input  { color: transparent; background: transparent; caret-color: var(--primary); resize: none; overflow: hidden; outline: none; }
.ed-input::selection { background: color-mix(in oklab, var(--primary) 28%, transparent); color: transparent; }
.ed-mirror { pointer-events: none; color: var(--on-surface); }
```

Overlay span classes, all colour or decoration only (no width change):

| class | style |
|---|---|
| `.ed-marker` | opacity .4 |
| `.ed-heading` | `primary`, plus `-webkit-text-stroke: .35px currentColor` (faux bold) |
| `.ed-bold` | `-webkit-text-stroke: .35px currentColor` |
| `.ed-italic` | `on-surface-variant` |
| `.ed-done` | line-through, opacity .55 |
| `.ed-tag` | `highlight` bg, radius 4 |
| `.ed-link` | `primary`, underline |
| `.ed-code` | `surface-highest` bg |
| `.ed-quote` | `on-surface-variant` |

**Other utility classes:**

| class | style |
|---|---|
| `.fade-mask-b` | `mask-image: linear-gradient(#000 calc(100% - 28px), transparent)` |
| `.no-scrollbar` | hides the scrollbar |
| `.sticky-header` | sticky top below the bar, `bg-surface`, `text-label-md`, uppercase, tracking .5px, `on-surface-variant` |
| `.edge-protect` | 24px top gradient, `surface` → transparent |

Existing classes keep working: `.tabular`, `.scroll-quiet`, `.mw-safe-*`, `.mw-pad-nav`. Change `.mw-pad-nav` to `calc(96px + var(--snackbar-h, 0px) + var(--mw-safe-bottom))`.

Coarse-pointer 44px hack: extend it to `size-8` and `size-10`.

### D7. UI primitives (`src/components/ui/*`, PKG2): exact props

```ts
// button.tsx: cva variants: filled | tonal | outline | text | ghost | destructive | highlight
//   legacy aliases (kept): default→filled, secondary→tonal, mark→highlight
//   sizes: sm h-9 px-3 | default h-10 px-5 | lg h-12 px-6 | icon size-10 | icon-sm size-8 | icon-lg size-12
//   all rounded-full + .press-morph; [&_svg]:size-5 (icon-sm: size-4)
export const Button; export const buttonVariants;               // same exports as today
// fab.tsx
export function Fab(p: { icon: ReactNode; label?: string; extended?: boolean; size?: "md" | "lg";
  onClick?: () => void; onLongPress?: () => void; menuOpen?: boolean; className?: string; "aria-label"?: string }): JSX.Element;
//   fixed bottom-right: bottom calc(16px + var(--mw-safe-bottom) + var(--snackbar-h,0px)), right calc(16px + safe-right).
//   bg-primary-container text-on-primary-container, rounded-lg (16), shadow-3; extended shows the label, collapses with a width spring.
//   menuOpen: morphs to a rounded-full 56px circle, icon rotates 45° (spring-fast).
export interface FabMenuItem { id: string; label: string; icon: ReactNode; onSelect: () => void }
export function FabMenu(p: { open: boolean; onOpenChange: (o: boolean) => void; items: FabMenuItem[] }): JSX.Element | null;
//   scrim, items fan up above the FAB as pills (h-14, bg-primary-container, icon+label, right-aligned), 30ms stagger; back layer.
// dialog.tsx: same props as today + variant?: "sheet" | "center" | "fullscreen" (default "sheet")
//   sheet: drag handle 32×4, rounded-t-xl, content-height (max 90dvh), drag-down > 96px or velocity > .5 closes;
//   registers useBackLayer(open, () => onOpenChange(false)); exit animation; focus the first field.
// action-list.tsx
export interface ActionItem { id: string; label: string; icon?: ReactNode; onSelect: () => void;
  destructive?: boolean; checked?: boolean; hint?: string; disabled?: boolean }
export function ActionList(p: { items: ActionItem[] }): JSX.Element;  // 56px rows inside Dialog sheets
// chip.tsx
export function Chip(p: { selected?: boolean; onClick?: () => void; icon?: ReactNode; children: ReactNode;
  onRemove?: () => void; className?: string }): JSX.Element;
//   h-8, rounded-sm → rounded-full when selected, bg-highlight + a check icon that pops in; haptic is the caller's job
// search-bar.tsx
export function SearchBar(p: { value: string; onChange: (v: string) => void; hints: string[];
  leading?: ReactNode; trailing?: ReactNode; onFocusChange?: (f: boolean) => void; className?: string }): JSX.Element;
//   h-14 rounded-full bg-surface-high; hints cycle every 4 s with a vertical fade while empty and unfocused; clear X when value
// top-bar.tsx
export function TopBar(p: { title?: string; large?: boolean; leading?: ReactNode; actions?: ReactNode;
  scrolled?: boolean; children?: ReactNode; className?: string }): JSX.Element;
//   sticky, mw-safe-top, h-16 row; large: title in headline-lg emph below the row; scrolled → .bar-scrolled
export function useScrolled(threshold?: number): boolean; // window.scrollY > threshold (default 8), passive listener
// snackbar.tsx
export function Snackbar(p: { title: string; description?: string; actionLabel?: string; onAction?: () => void;
  onClose: () => void; onPressChange?: (pressed: boolean) => void }): JSX.Element;
//   inverse-surface, rounded-md, shadow-3, min-h-12, action in text-inverse-primary label-lg, swipe-horizontal dismiss
// floating-toolbar.tsx
export function FloatingToolbar(p: { children: ReactNode; vibrant?: boolean; className?: string }): JSX.Element;
//   pill h-16, bg-surface-highest (vibrant: bg-primary-container), shadow-3, horizontally scrollable (.no-scrollbar),
//   pinned above the keyboard: bottom = max(safe-bottom, innerHeight - vv.height - vv.offsetTop) + 12px (visualViewport resize/scroll)
export function ToolbarButton(p: { icon: ReactNode; label: string; active?: boolean; disabled?: boolean;
  onClick: () => void }): JSX.Element; // size-12, aria-label=label, onPointerDown preventDefault (keeps textarea focus)
export function ToolbarDivider(): JSX.Element;
// segmented.tsx
export function Segmented<T extends string>(p: { value: T; options: { id: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void; "aria-label": string }): JSX.Element;
// switch.tsx
export function Switch(p: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string;
  description?: string }): JSX.Element; // M3 switch 52×32, thumb grows on the checked state (spring-fast)
// empty-state.tsx
export function EmptyState(p: { shape?: "cookie" | "clover" | "circle"; title: string; description?: string;
  actions?: ReactNode }): JSX.Element; // 160px SVG shape in primary-container, idle breathing 1→1.03 over 4 s
// tone-picker.tsx
export function TonePicker(p: { value: NoteTone; onChange: (t: NoteTone) => void }): JSX.Element;
//   7 swatches, 48px circles; selected morphs to rounded-md with a check; aria-label = NOTE_TONES label
// input.tsx: Input, Textarea, Select, Label, Field: same exports; restyled filled M3 fields (bg-surface-high, rounded-md, h-12)
```

**`layout.tsx`**:
- viewport `themeColor` becomes light `#FFF8F3` / dark `#17130D`;
- add `<meta name="color-scheme" content="light dark">`;
- keep `themeScript` and `rescueScript` untouched (I16);
- keep the provider order (`StoreProvider` > `ToastProvider` > `AppShell`).

---

## E. Screens and interactions (all copy final)

### E1. Home `/`

**Top bar.** `TopBar large title="Poznámky"`. Actions:
- view toggle (`LayoutGrid` / `Rows3`, aria "Mřížka" / "Seznam");
- menu `Menu` (aria "Menu").

The menu opens a sheet titled "Menu" with an `ActionList`:
- "Archiv" (hint is the count)
- "Koš" (hint is the count)
- "Řazení" → a sub-sheet with "Naposledy upravené", "Nejnovější" and "Podle názvu"
- "Nastavení"

**Search.** `SearchBar` sits below the title. On scroll the large title collapses and the search bar stays sticky.
- Hints: "Hledat v poznámkách", "Zkus #štítek", "Hledej i bez diakritiky".

**Chips row** (horizontal scroll, `.no-scrollbar`):
- the `QUICK_FILTERS`;
- "Barva" (opens a TonePicker sheet titled "Filtrovat podle barvy". When active, the chip shows a dot in that tone);
- `#tag` for each tag in `tagCounts`.

One active chip at a time. Tapping the active chip returns to "Vše". Haptic `select`.

**Banners** (above the list, a `surface-container` card, radius 20):
- Save failed: "Poznámky se nedaří uložit. Telefon je možná plný. Zálohuj si je a uvolni místo." [Zálohovat]
- Backup nudge (`needsBackupNudge`): "Tvoje poznámky jsou jen v tomhle telefonu. Pošli si zálohu, ať o ně nepřijdeš." [Zálohovat] [Později]. "Později" sets `backupNudgeDismissedAt`.

**List.**
- `visibleNotes` → `groupNotes` with `.sticky-header` labels when there is no query.
- With a query, the list is flat and ranked, with the header "Nalezeno: N".
- Grid: `splitColumns(notes, noteWeight, 2)` per group, gap 8.
- List: one column, gap 8.
- The first render after hydrate staggers the first 12 cards. Later re-renders are not animated.

**Card** (`NoteCard`, `.note-surface rounded-lg-plus p-4 press-morph`, `data-tone`, `view-transition-name: note-<id>` reserved for P1):
- Photo:
  - grid: the first image is full-bleed at the top, 16:10, radius 20 top corners;
  - list: up to 3 thumbs of 56px with radius 12;
  - more than that: a "+N" tile.
- Title: `text-title-md`, 2 lines max, with `<mark class="hl">` on hits. Daily notes have a `CalendarDays` 16px glyph in front.
- Body preview, from the first 8 lines of `parseMarkdown` (4 in list view):
  - task lines get a mini 14px box, and done tasks are struck;
  - bullets get "•";
  - headings are bold;
  - inside `.fade-mask-b`;
  - with a query, the `searchSnippet` with marks is shown instead.
- Footer (`text-label-sm text-on-surface-variant tabular`):
  - `formatStamp(updatedAt)`;
  - the task badge "3/7" (a `ListChecks` 12px icon) when tasks exist;
  - up to 2 `#tag` pills, then "+N";
  - "Archiv" pill when archived and shown in search.
- Pinned: a `Pin` 14px icon filled with `--tertiary`, top-right.

**Swipe** (`swipe-to-delete.tsx` keeps its invariants, gains bidirectional `onSwipeLeft` / `onSwipeRight`):
- **Left** reveals `bg-error-container` with a `Trash2` icon that scales from 0.8 to 1.1 past the threshold. Release after 40% width: the card flies out in 200ms (accel), then `useUndo({message:"Přesunuto do koše", …trash})`.
- **Right** reveals `bg-primary-container` with an `Archive` icon. Releasing calls `useUndo({message:"Archivováno", …archive})`.
- Haptic `tick` fires once when the threshold is crossed.
- On cancel the card springs back (spring-fast).

**Selection.**
- Long-press (haptic `press`) enters selection mode:
  - the selected card scales to 0.96 and gets radius 28 plus a check badge in the top-right (`.anim-pop`);
  - other cards drop to opacity 0.6.
- The top bar crossfades into a contextual bar: `X` (aria "Zrušit výběr"), "{n} vybrané" (`plural`: "1 vybraná", "2 vybrané", "5 vybraných"), then the actions:
  - Připnout / Odepnout (`updateMany pinned`)
  - Barva (TonePicker sheet)
  - Archivovat (`useUndo` "Archivováno: {n}")
  - Smazat (`useUndo` "Přesunuto do koše: {n}")
- Back clears the selection (`useBackLayer`). The selection also clears after each action.

**FAB.**
- `Fab extended` with label "Nová poznámka" and `Pencil`. It is extended at the top of the list and collapses on scroll down.
- Tap: `create()` → `router.push('/note/?id=…&new=1')`.
- Long-press or the chevron area opens `FabMenu`:
  - "Seznam" (`ListChecks`) → `create({ text: "- [ ] " })` + `new=1`
  - "Diktovat" (`Mic`) → `&voice=1`
  - "Vyfotit" (`Camera`) → `&photo=camera`
  - "Dnešní poznámka" (`CalendarDays`) → `findDailyNote(state, todayISO())` or `create(dailyPatch(today))` + `new=1`
  - "Ze šablony" (`LayoutTemplate`) → a sheet titled "Šablony" with an `ActionList` of `TEMPLATES` → `create(templatePatch(t))` + `new=1`

**Empty states.** None render before `hydrated`; show the skeleton instead (I8).
- **First run** (no notes at all): `EmptyState shape="cookie"`.
  - Title: "Hlavu máš na nápady, ne na jejich pamatování."
  - Description: "Bez účtu. Bez limitů. Tvoje data zůstávají v telefonu."
  - Actions are tonal buttons: "Nákupní seznam" (template), "Dnešní den" (daily), "Nadiktovat poznámku" (voice).
- **No search results:** `shape="circle"`. Title: "Nic pro „{q}“." Action: [Zrušit hledání]
- **Tag or filter empty:** title "Zatím nic s #{tag}." for a tag, or "Tady zatím nic není." for a filter. Action: [Zobrazit vše]

Remove the permanent "· tažením vlevo smažeš" hint.

### E2. Archive `/archive/` (new static page, PKG3)

- `TopBar` with title "Archiv" and a back arrow (`useGoUp("/")`).
- The same list in `scope:"archive"`.
- Swipe right "Vrátit z archivu" (`useUndo` "Vráceno z archivu"). Swipe left goes to Koš.
- Empty: `shape="clover"`, "Archiv je prázdný." with "Sem odsouvej, co nechceš mít na očích, ale nechceš smazat."

### E3. Trash `/trash/`

- `TopBar` with title "Koš" and a back arrow. Back returns to `/`: `ROOTS = ["/"]` in `app-shell.tsx`.
- Info line: "Poznámky v koši zůstanou, dokud koš nevysypeš."
- Card actions:
  - "Obnovit": snackbar "Obnoveno" with [Zpět].
  - "Smazat navždy": confirm Dialog "Smazat navždy?" with "Poznámku i její fotky už nepůjde vrátit." and [Zrušit] [Smazat].
- Top action "Vysypat koš": confirm "Vysypat koš?" with "{n} poznámek zmizí i s fotkami." Uses `plural`.
- Empty: `shape="circle"`, "Koš je prázdný. Nic tu nehnije."

### E4. Note editor `/note/?id=&new=1&voice=1&photo=camera|gallery` (PKG4)

**Page.**
- Root: `data-tone={note.tone}`, `bg-[var(--note-bg)]` (none = surface), `.anim-page`, `min-h-dvh`.
- Padding: `mw-safe-top`, and the bottom padding `calc(96px + var(--mw-safe-bottom))`.

**Top bar** (transparent, `.bar-scrolled` on scroll):
- left: `ArrowLeft` (aria "Zpět", `useGoUp("/")`);
- right:
  - pin toggle `Pin` (aria "Připnout" / "Odepnout", haptic `select`);
  - in edit mode, `Check` (aria "Hotovo", which leaves edit mode and blurs);
  - `MoreVertical`, which opens the "Možnosti" sheet:

| Action | Behaviour |
|---|---|
| Barva | TonePicker |
| Štítky | Tag sheet |
| Odškrtnout vše | shown only if any task is done |
| Smazat hotové | `useUndo` "Hotové úkoly smazány" |
| Sdílet | `Share.share({ title: noteTitle, text: plainText })` |
| Kopírovat text | toast "Zkopírováno" |
| Archivovat / Vrátit z archivu | go up, then `useUndo` "Archivováno" |
| Odeslat do počítače | only if `isSupabaseConfigured()` |
| Smazat | go up to `/`, then `useUndo` "Přesunuto do koše" |

**Title.** `Input`-less plain `<input>`, `text-headline-md emph`, placeholder "Nadpis" (daily notes use `dayTitle(day)`). Enter moves focus to the body start.

**Body: read mode.** This is the default for an existing note with content.
- `NoteBody` renders `splitNoteBody`: text blocks go through `parseMarkdown`/`parseInline`, and image blocks become a 16-radius image that opens the lightbox.
- Checkbox: tap → `toggleTask(id, block.at)` with haptic `tick`. It does not enter edit mode or focus anything.
- Links open with `window.open(href, "_blank")`. A tag tap → `/?tag=x`, which PKG3 reads with `useSearchParams` in Suspense.
- Tap on text enters edit mode with the caret at the exact tapped character:
  - `document.caretPositionFromPoint ?? caretRangeFromPoint` → text node → closest `[data-from]` span → `from + offsetInNode`;
  - tapping an empty area puts the caret at the end.

**Body: edit mode.** Entered from a read-mode tap, from `new=1` (autofocus the body in `useLayoutEffect`; an empty title doesn't matter), or from a toolbar action.
- Segmented editor: one `.ed-stack` (mirror + textarea) per text block of `splitNoteBody`, with the image blocks rendered between them. Markers are never visible.
- Segment edits splice back into the full text through the block `at`.
- The global caret is `segment.at + selectionStart`, stored in `caretRef` (I11).
- On change: `autoFormat(prev, next, caret)` → `update(id, {text})`, then `recordEdit`.
- A tap whose `selectionStart` lands where `taskMarkerHit` is true toggles that task and moves the caret to the line end.
- Font: `prefs.editorFont === "serif"` adds `.serif`.

**Floating toolbar** (only in edit mode, above the keyboard). `ToolbarButton`s, `onPointerDown` preventDefault:
- Zpět (`Undo2`), Znovu (`Redo2`) | Diktovat (`Mic`), Fotka (`Camera` → sheet "Vyfotit" / "Z galerie") | Nadpis (`Heading`, cycles h1→h2→h3→off) | Tučně (`Bold`), Kurzíva (`Italic`), Přeškrtnout (`Strikethrough`) | Odrážky (`List`), Číslování (`ListOrdered`), Úkol (`ListChecks`), Citace (`Quote`)
- Diktovat and Fotka sit right after Undo/Redo so they are visible without scrolling at 360px (the toolbar scrolls horizontally).
- Undo and redo are disabled when their stack is empty.

**Footer** (read and edit modes, `text-label-sm text-on-surface-variant tabular`):
- "Upraveno {formatStamp} · {formatStats}", plus " · {done}/{total} hotovo" when there are tasks;
- tag chips row (`noteTags`). Inline hashtags are shown without the remove X.

**Tags sheet** ("Štítky"):
- current tags as Chips with remove;
- `Input` placeholder "Nový štítek" (Enter → `addTag`);
- "Použité" chips from `tagCounts` to add with one tap;
- note: "Štítek přidáš i přímo v textu: #nakup".

**Dictation** (`voice-mode.tsx`):
- The bar becomes `FloatingToolbar vibrant` with a 5-bar CSS pulse (bars animate while partials arrive; not a real amplitude meter), the partial transcript in italics, and [Hotovo].
- While listening, all segment textareas are `readOnly` (fixes the overwrite bug). The I10 internals are unchanged.
- Haptic `press` on start and `success` on stop.
- `?voice=1` autostarts (the existing ref guard).

**Photo.**
- `?photo=camera|gallery` autostarts `capturePhoto` once (ref guard plus a 200ms timeout, like voice).
- Adding a photo inserts the marker at `caretRef` and the entry (I5), then resets the history.

**New note.** `new=1` + empty → edit mode, body focused. Back with nothing typed: the note is dropped by the home `dropEmpty` (I2).

### E5. Settings (`settings-dialog.tsx`, Dialog `variant="fullscreen"`, title "Nastavení")

Sections use `text-title-sm text-primary` headers.

1. **Vzhled**
   - "Motiv": Segmented with "Světlý", "Tmavý", "Podle systému". It calls `applyTheme` + `syncStatusBar`.
   - "Písmo poznámek": "Bezpatkové" / "Patkové".
   - "Zobrazení": "Seznam" / "Mřížka".
2. **Psaní**
   - Switch "Hotové úkoly přesouvat dolů"
   - Switch "Vibrace" (description "Jemná odezva při mazání, zaškrtnutí a výběru")
3. **Záloha**
   - Status line: "Poslední záloha: {formatStamp(lastBackupAt)}" or "Zatím jsi nezálohoval."
   - [Zálohovat teď] (filled) → `exportBackup`, then toast "Záloha připravena".
   - [Obnovit ze zálohy] (outline) → confirm "Obnovit ze zálohy?" with "Současné poznámky se nahradí obsahem zálohy." and [Zrušit] [Obnovit], then toast "Obnoveno: {n} poznámek".
   - Note: "Poznámky jsou jen v tomhle telefonu. Odinstalováním appky zmizí, záloha je jediná pojistka."
4. **Odeslat do počítače**: only when `isSupabaseConfigured()`. This is the existing `AccountSection`, restyled.
5. **O aplikaci**
   - "BetterNotes {NEXT_PUBLIC_BUNDLE_VERSION}"
   - "Bez účtu. Bez limitů. Tvoje data zůstávají v telefonu."
   - A collapsible "Pro pokročilé" with the OTA status, "Zkontrolovat aktualizace" / "Nasadit teď", and the Supabase URL field. Behaviour is unchanged.

---

## F. Work split: 4 packages, strictly disjoint files

Merge rules:
- Code against §C/§D signatures exactly. If a contract is wrong, change it in this spec first, then in code.
- PKG1 merges first (it is additive), then 2, 3 and 4 in any order.
- After merging, the PKG1 owner runs `npm run type-check && npm test && npm run build` and fixes integration in their own files only. Other packages fix their own.

### PKG1 "data"

**Owns:**
- `src/lib/**`, meaning `types`, `notes`, `storage`, `prefs`, `backup`, `images`, `native`, `date`, `inline-images` and `utils`, plus new modules (`checklist`, `markdown`, `text-stats`, `search`, `groups`, `templates`, `history`) and all `*.test.ts`;
- `src/components/providers/**`, meaning `store-provider`, `toast-provider`, `use-app-back`, `use-prefs`, plus the new `use-undo.ts`.

**Tasks:**
- everything in §C;
- debounced save, mirror and `saveFailed`;
- move `deleteImages` out of the updaters;
- the toast single-slot logic and `--snackbar-h`;
- `haptic()`.

Don't touch `live-update.ts` or `sync.ts` logic beyond imports.

**Exposes:** §C exactly.

**Consumes:** `Snackbar` from `@/components/ui/snackbar` (PKG2).

### PKG2 "design-system"

**Owns:**
- `src/app/globals.css`, `src/app/layout.tsx`;
- `src/components/ui/**`: `button`, `dialog`, `fab`, `input`, plus new `fab-menu` (may live in `fab.tsx`), `action-list`, `chip`, `search-bar`, `top-bar`, `snackbar`, `floating-toolbar`, `segmented`, `switch`, `empty-state`, `tone-picker`;
- `public/**` (SVG only).

**Tasks:**
- §D in full;
- Dialog back layer, drag-to-dismiss, the fullscreen variant and the exit animation;
- `useScrolled`.

**Exposes:** §D6 classes, §D7 props and the §D1 Tailwind names.

**Consumes:**
- `useBackLayer` (existing signature);
- `haptic` from `@/lib/native`;
- `NOTE_TONES`/`NoteTone` from `@/lib/types`;
- `cn`.

### PKG3 "home"

**Owns:**
- `src/components/app-shell.tsx`;
- `src/components/notes/notes-list.tsx`, `note-card.tsx`, `swipe-to-delete.tsx`, `trash-view.tsx`;
- `src/app/page.tsx`, `src/app/trash/**`, new `src/app/archive/page.tsx`;
- new `src/components/home/**`: `home-menu.tsx`, `filter-chips.tsx`, `template-sheet.tsx`, `selection-bar.tsx`, `backup-banner.tsx`, `card-preview.tsx`.

**Tasks:**
- §E1–E3;
- AppShell:
  - no global header;
  - `<main>` without padding;
  - `ROOTS=["/"]`;
  - the save-failed and `restoredFromMirror` toasts;
  - keep every I16 call;
- SwipeToDelete becomes bidirectional while keeping I12. The props are `{ onSwipeLeft, onSwipeRight, leftLabel, rightLabel, children }`;
- read `?tag=` on `/`.

Hosts `<SettingsDialog open onOpenChange />` (props unchanged).

**Consumes:**
- from lib:
  - `visibleNotes`, `groupNotes`, `splitColumns`, `noteWeight`, `noteTags`, `tagCounts`, `QUICK_FILTERS`;
  - `highlightRanges`, `searchSnippet`, `parseMarkdown`, `taskStats`, `formatStamp`;
  - `TEMPLATES`, `templatePatch`, `dailyPatch`, `findDailyNote`, `todayISO`;
  - `needsBackupNudge`, `exportBackup`;
- from providers: the store actions, `useUndo`, `useBackLayer`, `useGoUp`, `usePrefs`/`setPrefs`;
- from PKG2: the ui primitives;
- `NoteThumb` from PKG4, with props `{ name, className?, alt? }` unchanged.

### PKG4 "editor"

**Owns:**
- `src/components/notes/note-detail.tsx`, `note-body.tsx`, `note-thumb.tsx`, `image-lightbox.tsx`, `voice-mode.tsx`;
- `src/app/note/**`;
- `src/components/settings-dialog.tsx`, `src/components/account-section.tsx`;
- new `src/components/editor/**`: `segment-editor.tsx` (the `.ed-stack` overlay), `md-render.tsx` (read-mode renderer), `format-toolbar.tsx`, `note-actions-sheet.tsx`, `tags-sheet.tsx`, `editor-footer.tsx`.

**Tasks:**
- §E4 and §E5;
- `NoteThumb` switches to `imageSrc` with a `readImage` fallback on error;
- `note/page.tsx` passes `{ noteId, autoVoice, autoPhoto: "camera" | "gallery" | null, isNew }` to `NoteDetail`;
- keep I9, I10 and I11.

**Exposes:**
- `NoteThumb({ name, className?, alt? })`
- `SettingsDialog({ open, onOpenChange })`

**Consumes:**
- from lib:
  - `parseMarkdown`, `parseInline`, `highlightLine`;
  - `autoFormat`, `toggleLinePrefix`, `wrapSelection`, `taskMarkerHit`, `uncheckAll`, `removeChecked`, `taskStats`;
  - `createHistory`, `recordEdit`, `undoEdit`, `redoEdit`;
  - `textStats`, `formatStats`, `formatStamp`, `dayTitle`, `noteTags`;
  - `imageSrc`, `capturePhoto`;
  - `applyTheme`, `currentTheme`, `setPrefs`, `needsBackupNudge`;
- from providers: `useStore` (`toggleTask`, `archive`, `trash`, `update`), `useUndo`;
- from PKG2: the ui primitives, `.md-*`, `.ed-*` and `.prose-note`.

### Acceptance (whole release)

1. A cold start opens the list with no spinner. FAB tap → caret blinking in the body. Typing `[] mléko` + Enter gives `- [ ] mléko` and a new `- [ ] `.
2. Back to the list: the card shows `0/1`. Open it and tap the box: it ticks and sinks, and no keyboard appears.
3. Swipe left → snackbar "Přesunuto do koše" → Zpět → the note is back in place with the same `updatedAt`.
4. A v1 localStorage blob from the current production build loads unchanged. An old backup JSON with photos restores, and the inline photos render (no ImageOff).
5. Hardware back closes, in order: an open sheet → selection → FabMenu. From Trash or Archive it goes to `/`. It exits the app only from `/`.
6. No `window.confirm` anywhere. `grep -r "mw-reel\|mw-shine\|note-stripe" src` is empty.
7. `npm run type-check`, `npm test` (115 old + new) and `npm run build` are all green. `npm run ota:bundle` output contains no binary files.

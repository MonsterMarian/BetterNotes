"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArchiveRestore,
  CalendarDays,
  Camera,
  LayoutGrid,
  LayoutTemplate,
  ListChecks,
  Menu,
  Mic,
  Pencil,
  Plus,
  Rows3,
} from "lucide-react";
import { NoteCard } from "./note-card";
import { SwipeToDelete } from "./swipe-to-delete";
import { BackupBanner } from "@/components/home/backup-banner";
import { ALL_FILTER, FilterChips, isFiltered, type HomeFilter } from "@/components/home/filter-chips";
import { HomeMenu } from "@/components/home/home-menu";
import { SyncIcon } from "@/components/sync-status";
import { SelectionBar } from "@/components/home/selection-bar";
import { TemplateSheet } from "@/components/home/template-sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Fab, FabMenu } from "@/components/ui/fab";
import { useKeyboardHeight } from "@/components/ui/floating-toolbar";
import { SearchBar } from "@/components/ui/search-bar";
import { TopBar, useScrolled } from "@/components/ui/top-bar";
import { useStore } from "@/components/providers/store-provider";
import { useBackLayer } from "@/components/providers/use-app-back";
import { setPrefs, usePrefs } from "@/components/providers/use-prefs";
import { useUndo } from "@/components/providers/use-undo";
import { findDailyNote, noteCount, tagCounts, tagMatches, visibleNotes, type SortOrder } from "@/lib/notes";
import { groupNotes, noteWeight, splitColumns } from "@/lib/groups";
import { TEMPLATES, dailyPatch, templatePatch } from "@/lib/templates";
import { todayISO } from "@/lib/date";
import { haptic } from "@/lib/native";
import type { Note } from "@/lib/types";

const SEARCH_HINTS = ["Hledat v poznámkách", "Zkus #štítek", "Hledej i bez diakritiky"];

/** Kolik prvních karet po startu najíždí postupně - dál už to nikdo nevidí. */
const INTRO_CARDS = 12;

// Náběh karet patří jen k prvnímu vykreslení po startu appky. Návrat
// z detailu by jinak pokaždé rozpohyboval celý seznam.
let introPlayed = false;

function useIntro(): boolean {
  const [intro, setIntro] = React.useState(() => !introPlayed);
  React.useEffect(() => {
    introPlayed = true;
    if (!intro) return;
    const timer = window.setTimeout(() => setIntro(false), 1000);
    return () => window.clearTimeout(timer);
  }, [intro]);
  return intro;
}

/**
 * Tahy karty společné pro hlavní seznam i archiv: vlevo vždycky koš,
 * vpravo archiv - nebo zpět z archivu, když už v něm poznámka je
 * (archivované se ukazují i ve výsledcích hledání).
 */
export function useSwipeActions() {
  const { trash, archive, unarchive } = useStore();
  const undo = useUndo();
  return (note: Note) => {
    const ids = [note.id];
    return {
      onSwipeLeft: () => undo({ message: "Přesunuto do koše", ids, run: () => trash(note.id) }),
      onSwipeRight: note.archivedAt
        ? () => undo({ message: "Vráceno z archivu", ids, run: () => unarchive(note.id) })
        : () => undo({ message: "Archivováno", ids, run: () => archive(note.id) }),
      leftLabel: "Koš",
      rightLabel: note.archivedAt ? "Vrátit z archivu" : "Archivovat",
      rightIcon: note.archivedAt ? <ArchiveRestore /> : undefined,
    };
  };
}

/**
 * Poznámky ve skupinách (Připnuté, Dnes, Včera…) s lepícími nadpisy,
 * v mřížce rozložené do dvou vyvážených sloupců. Řazení uvnitř sloupce
 * zůstává, takže první poznámka je pořád vlevo nahoře.
 *
 * `flat` = jedna skupina bez nadpisu (výsledky hledání jsou seřazené
 * podle shody, ne podle data).
 */
export function NoteFeed({
  notes,
  order,
  flat = false,
  children,
}: {
  notes: Note[];
  order: SortOrder;
  flat?: boolean;
  children: (note: Note) => React.ReactNode;
}) {
  const { view } = usePrefs();
  const intro = useIntro();
  const groups = React.useMemo(
    () => (flat ? [{ key: "all", label: "", notes }] : groupNotes(notes, order)),
    [notes, order, flat],
  );
  const showLabels = !(groups.length === 1 && groups[0].key === "all");
  const position = intro ? new Map(groups.flatMap((g) => g.notes).map((n, i) => [n.id, i])) : null;

  const item = (note: Note) => {
    const i = position?.get(note.id) ?? INTRO_CARDS;
    return (
      <div
        key={note.id}
        className={i < INTRO_CARDS ? "anim-enter" : undefined}
        style={i < INTRO_CARDS ? { animationDelay: `${i * 30}ms` } : undefined}
      >
        {children(note)}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          {showLabels ? <h2 className="sticky-header -mx-4 px-4 py-2">{group.label}</h2> : null}
          {view === "grid" ? (
            <div className="grid grid-cols-2 items-start gap-2">
              {splitColumns(group.notes, noteWeight, 2).map((column, c) => (
                <div key={c} className="flex min-w-0 flex-col gap-2">
                  {column.map(item)}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">{group.notes.map(item)}</div>
          )}
        </section>
      ))}
    </div>
  );
}

/** Tvar obrazovky bez dat - ať start neposkočí, až se poznámky načtou. */
export function ListSkeleton() {
  return (
    <div className="mw-safe-top mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pt-20">
      <div className="h-10 w-40 animate-pulse rounded-md bg-surface-high" />
      <div className="h-14 animate-pulse rounded-full bg-surface-high" />
      <div className="h-28 animate-pulse rounded-lg-plus bg-surface-low" />
      <div className="h-28 animate-pulse rounded-lg-plus bg-surface-low" />
      <div className="h-28 animate-pulse rounded-lg-plus bg-surface-low" />
    </div>
  );
}

/** Hlavní obrazovka: hledání, filtry, seznam poznámek a tlačítko pro novou. */
export function NotesList({ initialTag = null }: { initialTag?: string | null }) {
  const router = useRouter();
  const { state, create, dropEmpty } = useStore();
  const { view, order, categories } = usePrefs();
  const swipe = useSwipeActions();
  const scrolled = useScrolled();

  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<HomeFilter>(() =>
    initialTag ? { ...ALL_FILTER, tag: initialTag } : ALL_FILTER,
  );
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [fabOpen, setFabOpen] = React.useState(false);
  /** Při psaní do hledání by FAB nad klávesnicí zakrýval výsledky. */
  const [searchFocused, setSearchFocused] = React.useState(false);
  // Po zavření klávesnice tlačítkem Zpět zůstává pole aktivní - FAB se řídí klávesnicí, ne fokusem.
  const keyboardOpen = useKeyboardHeight() > 0;
  const [templatesOpen, setTemplatesOpen] = React.useState(false);

  /*
   * Úklid opuštěných skořápek. Na seznamu se needituje nic, takže prázdná
   * poznámka tu znamená "založil a couvnul" - a taková v seznamu nemá co
   * dělat. Běží při každém příchodu na seznam a je idempotentní, takže
   * nevadí, když ho `StrictMode` v dev módu spustí dvakrát.
   */
  React.useEffect(() => dropEmpty(), [dropEmpty]);

  // Používané štítky + ručně založené kategorie, ve kterých zatím nic není.
  const tags = React.useMemo(() => {
    const used = tagCounts(state).map((t) => t.tag);
    return [...used, ...categories.filter((c) => !used.includes(c))];
  }, [state, categories]);
  const notes = React.useMemo(
    () => visibleNotes(state, { query, order, quick: filter.quick, tone: filter.tone, tag: filter.tag }),
    [state, query, order, filter],
  );
  const searching = query.trim().length > 0;

  // Štítek, který zmizel (poslední poznámka s ním se smazala), by seznam
  // nechal navždy prázdný a čip by nešel odkliknout.
  React.useEffect(() => {
    const tag = filter.tag;
    if (tag && !tags.some((t) => tagMatches(t, tag))) setFilter(ALL_FILTER);
  }, [filter.tag, tags]);

  // Výběr drží jen to, co je vidět - poznámka smazaná jinde z něj vypadne sama.
  const selectedNotes = notes.filter((n) => selected.has(n.id));
  const selectionMode = selectedNotes.length > 0;
  const clearSelection = React.useCallback(() => setSelected(new Set()), []);
  useBackLayer(selectionMode, clearSelection);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // Nový výběr začíná načisto, ať se nevrátí poznámky vybrané kdysi pod jiným filtrem.
  const select = (id: string) =>
    setSelected((prev) => (selectionMode ? new Set(prev).add(id) : new Set([id])));

  const open = (note: Note, params: string) =>
    router.push(`/note/?id=${encodeURIComponent(note.id)}${params}`);

  // Nová poznámka v otevřené kategorii do ní rovnou patří.
  const newNote = (patch?: Partial<Note>, params = "&new=1") => {
    haptic("tick");
    const tags = filter.tag ? [...new Set([...(patch?.tags ?? []), filter.tag])] : patch?.tags;
    open(create({ ...patch, ...(tags ? { tags } : {}) }), params);
  };

  const openDaily = () => {
    const day = todayISO();
    const existing = findDailyNote(state, day);
    if (!existing) return newNote(dailyPatch(day));
    haptic("tick");
    open(existing, "");
  };

  const shopping = TEMPLATES.find((t) => t.id === "nakup");

  let empty: React.ReactNode = null;
  if (notes.length === 0) {
    if (searching) {
      empty = (
        <EmptyState
          shape="circle"
          title={`Nic pro „${query.trim()}“.`}
          actions={
            <Button variant="tonal" onClick={() => setQuery("")}>
              Zrušit hledání
            </Button>
          }
        />
      );
    } else if (isFiltered(filter)) {
      empty = (
        <EmptyState
          shape="circle"
          title={filter.tag ? `V kategorii ${filter.tag} zatím nic není.` : "Tady zatím nic není."}
          actions={
            <>
              <Button variant="tonal" onClick={() => newNote()}>
                Nová poznámka
              </Button>
              {filter.tag && categories.includes(filter.tag) ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPrefs({ categories: categories.filter((c) => c !== filter.tag) });
                    setFilter(ALL_FILTER);
                  }}
                >
                  Smazat kategorii
                </Button>
              ) : null}
              <Button variant="tonal" onClick={() => setFilter(ALL_FILTER)}>
                Zobrazit vše
              </Button>
            </>
          }
        />
      );
    } else {
      empty = (
        <EmptyState
          shape="cookie"
          title="Hlavu máš na nápady, ne na jejich pamatování."
          description="Bez účtu. Bez limitů. Tvoje data zůstávají v telefonu."
          actions={
            <>
              {shopping ? (
                <Button variant="tonal" onClick={() => newNote(templatePatch(shopping))}>
                  Nákupní seznam
                </Button>
              ) : null}
              <Button variant="tonal" onClick={openDaily}>
                Dnešní den
              </Button>
              <Button variant="tonal" onClick={() => newNote(undefined, "&voice=1")}>
                Nadiktovat poznámku
              </Button>
            </>
          }
        />
      );
    }
  }

  return (
    <>
      <TopBar
        large
        eyebrow="Better/_notes"
        title="Poznámky"
        scrolled={scrolled}
        actions={
          <>
            <SyncIcon />
            <Button
              variant="ghost"
              size="icon"
              aria-label={view === "grid" ? "Seznam" : "Mřížka"}
              onClick={() => setPrefs({ view: view === "grid" ? "list" : "grid" })}
            >
              {view === "grid" ? <Rows3 /> : <LayoutGrid />}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Menu" onClick={() => setMenuOpen(true)}>
              <Menu />
            </Button>
          </>
        }
      >
        <div className="mx-auto w-full max-w-3xl px-4 pb-2">
          <SearchBar value={query} onChange={setQuery} hints={SEARCH_HINTS} onFocusChange={setSearchFocused} />
        </div>
      </TopBar>

      {selectionMode ? <SelectionBar notes={selectedNotes} onClear={clearSelection} /> : null}

      {/* Skupiny se lepí pod řádek lišty i pod přilepené hledání (h-14 + pb-2). */}
      <div className="mw-safe-x mw-pad-nav [--sticky-top:calc(var(--mw-safe-top)+128px)]">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4">
          {noteCount(state) > 0 ? (
            <FilterChips
              value={filter}
              onChange={setFilter}
              // Nadřazený štítek z odkazu (#prace pro #prace/projekt) samostatně v seznamu není.
              tags={filter.tag && !tags.includes(filter.tag) ? [filter.tag, ...tags] : tags}
            />
          ) : null}

          <BackupBanner />

          {empty ?? (
            <>
              {searching ? (
                <p className="text-label-md text-on-surface-variant tabular">Nalezeno: {notes.length}</p>
              ) : null}
              <NoteFeed notes={notes} order={order} flat={searching}>
                {(note) => {
                  const actions = swipe(note);
                  // Ve výběru se netáhne - prst tam ťuká po kartách a tah by je mazal.
                  return (
                    <SwipeToDelete
                      {...actions}
                      onSwipeLeft={selectionMode ? undefined : actions.onSwipeLeft}
                      onSwipeRight={selectionMode ? undefined : actions.onSwipeRight}
                    >
                      <NoteCard
                        note={note}
                        dense={view === "grid"}
                        query={query}
                        selectionMode={selectionMode}
                        selected={selected.has(note.id)}
                        onToggle={() => toggle(note.id)}
                        onLongPress={() => select(note.id)}
                      />
                    </SwipeToDelete>
                  );
                }}
              </NoteFeed>
            </>
          )}
        </div>
      </div>

      {!selectionMode && !(searchFocused && keyboardOpen) ? (
        <>
          <Fab
            // Plus otočené o 45° (CSS u otevřeného menu) je křížek - zavřít.
            icon={fabOpen ? <Plus /> : <Pencil />}
            label="Nová poznámka"
            aria-label="Nová poznámka"
            extended={!scrolled}
            menuOpen={fabOpen}
            onClick={() => (fabOpen ? setFabOpen(false) : newNote())}
            onLongPress={() => {
              haptic("press");
              setFabOpen(true);
            }}
          />
          {/* Diktování je hlavní funkce - jedno ťuknutí, ne schované v menu.
              Menu (šablony, foťák, dnešní poznámka) je na dlouhý stisk FABu. */}
          {!fabOpen ? (
            <Button
              variant="tonal"
              size="icon"
              aria-label="Nadiktovat poznámku"
              onClick={() => {
                haptic("press");
                newNote(undefined, "&voice=1");
              }}
              className="fixed bottom-[calc(84px+var(--mw-safe-bottom)+var(--snackbar-h,0px))] right-[calc(20px+var(--mw-safe-right))] z-30 size-14 rounded-lg shadow-[var(--shadow-3)] [&_svg]:size-6"
            >
              <Mic />
            </Button>
          ) : null}
          <FabMenu
            open={fabOpen}
            onOpenChange={setFabOpen}
            items={[
              { id: "list", label: "Seznam", icon: <ListChecks />, onSelect: () => newNote({ text: "- [ ] " }) },
              { id: "voice", label: "Diktovat", icon: <Mic />, onSelect: () => newNote(undefined, "&voice=1") },
              { id: "photo", label: "Vyfotit", icon: <Camera />, onSelect: () => newNote(undefined, "&photo=camera") },
              { id: "daily", label: "Dnešní poznámka", icon: <CalendarDays />, onSelect: openDaily },
              { id: "template", label: "Ze šablony", icon: <LayoutTemplate />, onSelect: () => setTemplatesOpen(true) },
            ]}
          />
        </>
      ) : null}

      <TemplateSheet open={templatesOpen} onOpenChange={setTemplatesOpen} onPick={(t) => newNote(templatePatch(t))} />
      <HomeMenu open={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
}

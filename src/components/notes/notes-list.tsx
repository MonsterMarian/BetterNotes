"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, NotebookPen, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { NoteCard } from "./note-card";
import { Button } from "@/components/ui/button";
import { Fab } from "@/components/ui/fab";
import { Input, Select } from "@/components/ui/input";
import { useStore } from "@/components/providers/store-provider";
import { usePrefs } from "@/components/providers/use-prefs";
import { setPrefs } from "@/lib/prefs";
import { SORT_ORDERS, noteCount, tagCounts, visibleNotes } from "@/lib/notes";
import { tapFeedback } from "@/lib/native";
import { cn, plural } from "@/lib/utils";

function Empty({ hasNotes, onNew }: { hasNotes: boolean; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
      <NotebookPen className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {hasNotes
          ? "Tomuhle hledání nic neodpovídá."
          : "Zatím tu nic není. První poznámku založíš zeleným tlačítkem dole."}
      </p>
      {!hasNotes ? (
        <Button variant="secondary" size="sm" onClick={onNew}>
          <Plus />
          Nová poznámka
        </Button>
      ) : null}
    </div>
  );
}

export function NotesList() {
  const router = useRouter();
  const { state, create, dropEmpty } = useStore();
  const { view, order } = usePrefs();

  const [query, setQuery] = React.useState("");
  const [tag, setTag] = React.useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = React.useState(false);

  /*
   * Úklid opuštěných skořápek. Na seznamu se needituje nic, takže prázdná
   * poznámka tu znamená "založil a couvnul" - a taková v seznamu nemá co
   * dělat. Běží při každém příchodu na seznam a je idempotentní, takže
   * nevadí, když ho `StrictMode` v dev módu spustí dvakrát.
   */
  React.useEffect(() => dropEmpty(), [dropEmpty]);

  const tags = React.useMemo(() => tagCounts(state), [state]);
  const notes = React.useMemo(
    () => visibleNotes(state, { query, tag, order }),
    [state, query, tag, order],
  );
  const total = noteCount(state);

  // Štítek, který zmizel (poslední poznámka s ním se smazala), by seznam
  // nechal navždy prázdný a nešel by odkliknout.
  React.useEffect(() => {
    if (tag && !tags.some((t) => t.tag === tag)) setTag(null);
  }, [tag, tags]);

  const newNote = () => {
    void tapFeedback();
    const note = create();
    router.push(`/note/?id=${encodeURIComponent(note.id)}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hledat v poznámkách"
            aria-label="Hledat v poznámkách"
            className="h-10 pl-9 pr-9"
            // Telefonní klávesnice jinak nabízí "hotovo" místo lupy.
            type="search"
            enterKeyHint="search"
          />
          {query ? (
            <button
              type="button"
              aria-label="Zrušit hledání"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <Button
          variant={toolsOpen ? "secondary" : "outline"}
          size="icon"
          className="size-10"
          aria-label="Řazení a zobrazení"
          aria-expanded={toolsOpen}
          onClick={() => setToolsOpen((v) => !v)}
        >
          <SlidersHorizontal />
        </Button>
      </div>

      {toolsOpen ? (
        <div className="animate-in-up flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <Select
            value={order}
            onChange={(e) => setPrefs({ order: e.target.value as typeof order })}
            aria-label="Řazení"
            className="h-9 w-auto flex-1 min-w-40"
          >
            {SORT_ORDERS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
          <div className="flex gap-1">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon"
              aria-label="Seznam"
              aria-pressed={view === "list"}
              onClick={() => setPrefs({ view: "list" })}
            >
              <List />
            </Button>
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="icon"
              aria-label="Mřížka"
              aria-pressed={view === "grid"}
              onClick={() => setPrefs({ view: "grid" })}
            >
              <LayoutGrid />
            </Button>
          </div>
        </div>
      ) : null}

      {tags.length > 0 ? (
        <div className="scroll-quiet -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {tags.map(({ tag: name, count }) => {
            const active = tag === name;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                onClick={() => setTag(active ? null : name)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
                  active
                    ? "border-transparent bg-mark text-mark-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                #{name}
                <span className="ml-1 opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {notes.length === 0 ? (
        <Empty hasNotes={total > 0} onNew={newNote} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {notes.length} {plural(notes.length, "poznámka", "poznámky", "poznámek")}
            {notes.length !== total ? ` z ${total}` : ""}
          </p>
          <div
            className={cn(
              "gap-3",
              view === "grid" ? "grid grid-cols-2 items-start" : "flex flex-col",
            )}
          >
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} dense={view === "grid"} />
            ))}
          </div>
        </>
      )}

      <Fab onClick={newNote} aria-label="Nová poznámka">
        <Plus />
        Nová
      </Fab>
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, NotebookPen, Plus, Search, SlidersHorizontal, X, Trash2, Send } from "lucide-react";
import { NoteCard } from "./note-card";
import { SwipeToDelete } from "./swipe-to-delete";
import { Button } from "@/components/ui/button";
import { Fab } from "@/components/ui/fab";
import { Input, Select } from "@/components/ui/input";
import { useStore } from "@/components/providers/store-provider";
import { usePrefs } from "@/components/providers/use-prefs";
import { useToast } from "@/components/providers/toast-provider";
import { setPrefs } from "@/lib/prefs";
import { SORT_ORDERS, noteCount, tagCounts, visibleNotes } from "@/lib/notes";
import { sendAllNotes } from "@/lib/sync";
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
  const { state, create, dropEmpty, trash } = useStore();
  const { view, order, trashAfterSync } = usePrefs();
  const { toast } = useToast();

  const [query, setQuery] = React.useState("");
  const [tag, setTag] = React.useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = React.useState(false);
  
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const selectionMode = selectedIds.size > 0;

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

  const handleBulkTrash = () => {
    if (confirm(`Opravdu smazat ${selectedIds.size} ${plural(selectedIds.size, "poznámku", "poznámky", "poznámek")}?`)) {
      for (const id of selectedIds) {
        trash(id);
      }
      setSelectedIds(new Set());
    }
  };

  const handleBulkSend = async () => {
    setBusy(true);
    const selectedNotes = notes.filter((n) => selectedIds.has(n.id));
    const res = await sendAllNotes(selectedNotes);
    setBusy(false);
    
    if (trashAfterSync) {
      for (const id of res.sentIds) trash(id);
    }
    
    setSelectedIds(new Set());
    toast(
      res.failed === 0
        ? {
            tone: "success",
            title: `Odesláno ${res.sent} ${plural(res.sent, "poznámka", "poznámky", "poznámek")}`,
          }
        : {
            tone: "warn",
            title: `Odesláno ${res.sent} z ${res.sent + res.failed}`,
            description: res.message,
          },
    );
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
            {!selectionMode ? <span className="ml-2 opacity-70">· tažením vlevo smažeš</span> : null}
          </p>
          {/*
            V mřížce `items-stretch`: karty v jednom řádku srovnají výšku
            a mezi řádky nezůstane díra. Zednické zdivo (`columns-2`) by díry
            zavřelo taky, jenže by se pak četlo po sloupcích - a poznámky jsou
            tříděné, takže "první" musí zůstat vlevo nahoře.
          */}
          <div
            className={cn(
              "gap-3",
              view === "grid" ? "grid grid-cols-2 items-stretch" : "flex flex-col",
              selectionMode && "pb-20" // Extra padding for the bottom bar
            )}
          >
            {notes.map((note) => {
              const selected = selectedIds.has(note.id);
              return (
                <SwipeToDelete key={note.id} note={note} stretch={view === "grid"}>
                  <NoteCard 
                    note={note} 
                    dense={view === "grid"} 
                    selectionMode={selectionMode}
                    selected={selected}
                    onToggle={() => {
                      const next = new Set(selectedIds);
                      if (selected) next.delete(note.id);
                      else next.add(note.id);
                      setSelectedIds(next);
                    }}
                    onLongPress={() => {
                      const next = new Set(selectedIds);
                      next.add(note.id);
                      setSelectedIds(next);
                    }}
                  />
                </SwipeToDelete>
              );
            })}
          </div>
        </>
      )}

      {selectionMode ? (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between border-t bg-background px-4 py-3 pb-safe animate-in slide-in-from-bottom-full shadow-[0_-4px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setSelectedIds(new Set())} aria-label="Zrušit výběr">
              <X />
            </Button>
            <span className="font-medium text-sm">Vybráno {selectedIds.size}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handleBulkTrash} disabled={busy} aria-label="Smazat vybrané">
              <Trash2 className="text-destructive" />
            </Button>
            <Button className="bg-progress text-progress-foreground hover:bg-progress/90" onClick={() => void handleBulkSend()} disabled={busy}>
              <Send />
              {busy ? "Moment…" : "Odeslat"}
            </Button>
          </div>
        </div>
      ) : (
        <Fab onClick={newNote} aria-label="Nová poznámka">
          <Plus />
          Nová
        </Fab>
      )}
    </div>
  );
}

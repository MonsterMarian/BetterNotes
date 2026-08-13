"use client";

import * as React from "react";
import { loadState, saveState } from "@/lib/storage";
import { deleteImages, listImages } from "@/lib/images";
import * as notes from "@/lib/notes";
import { EMPTY_STATE, type BetterNotesState, type Note } from "@/lib/types";

/**
 * Jediný zdroj pravdy pro poznámky.
 *
 * Stav se drží celý v paměti a po každé změně se uloží. Zápis je levný
 * (jeden JSON) a tenhle model odpadá celou třídu chyb, kdy se v telefonu
 * a v obrazovce liší data.
 */
export interface StoreApi {
  state: BetterNotesState;
  hydrated: boolean;
  /** Vytvoří poznámku a vrátí ji, aby na ni šlo rovnou přejít. */
  create: (patch?: Partial<Note>) => Note;
  update: (id: string, patch: Partial<Note>) => void;
  togglePin: (id: string) => void;
  addTag: (id: string, raw: string) => void;
  removeTag: (id: string, tag: string) => void;
  trash: (id: string) => void;
  restore: (id: string) => void;
  /** Nenávratně; fotky poznámky zmizí s ní. */
  purge: (id: string) => void;
  /** Zahodí poznámky, do kterých se nic nenapsalo. Volá seznam po návratu. */
  dropEmpty: () => void;
  emptyTrash: () => void;
  /** Načtení zálohy - přepíše všechno. */
  replace: (state: BetterNotesState) => void;
}

const StoreContext = React.createContext<StoreApi | null>(null);

export function useStore(): StoreApi {
  const ctx = React.useContext(StoreContext);
  if (!ctx) throw new Error("useStore musí být uvnitř StoreProvider");
  return ctx;
}

/** Jedna poznámka podle id. Vrací `undefined`, dokud se data nenačtou. */
export function useNote(id: string): Note | undefined {
  const { state } = useStore();
  return React.useMemo(() => notes.findNote(state, id), [state, id]);
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<BetterNotesState>(EMPTY_STATE);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);

  // Snímek stavu pro úklid níž. Přes ref, ne přes závislost efektu: kdyby
  // úklid běžel po každé změně, smazal by čerstvě vyfocenou fotku dřív, než
  // se jméno souboru stihne uložit do poznámky.
  const stateRef = React.useRef(state);
  stateRef.current = state;

  /**
   * Úklid fotek, na které už nikdo neukazuje. Běží jednou po startu a mimo
   * hlavní cestu: fotka může osiřet pádem appky uprostřed úpravy, kdy se
   * o ni nemá kdo postarat.
   */
  React.useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void listImages().then((stored) => {
      if (cancelled || stored.length === 0) return;
      const orphans = notes.orphanImages(stateRef.current, stored);
      if (orphans.length > 0) void deleteImages(orphans);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  /**
   * Akce se vyrábějí jednou a napořád.
   *
   * Nesahají na `state` přímo, všechny jedou přes funkci v `setState` - díky
   * tomu můžou mít prázdné závislosti a jejich identita se nemění. To není
   * kosmetika: kdyby se měnila při každém stisku klávesy, efekty, které je
   * mají v závislostech, by se odmontovávaly uprostřed psaní. Úklid prázdné
   * poznámky v detailu tak jednu rozepsanou poznámku poslal do koše.
   */
  const actions = React.useMemo(
    () => ({
      // Poznámka vzniká mimo `setState`, aby ji šlo rovnou vrátit volajícímu
      // (obrazovka na ni hned přejde). Do stavu se pak vloží funkcí, takže
      // dvě založení v jednom cyklu o sebe nepřijdou.
      create: (patch: Partial<Note> = {}) => {
        const note = { ...notes.emptyNote(), ...patch };
        setState((s) => ({ ...s, notes: [note, ...s.notes] }));
        return note;
      },
      update: (id: string, patch: Partial<Note>) =>
        setState((s) => notes.updateNote(s, id, patch)),
      togglePin: (id: string) => setState((s) => notes.togglePin(s, id)),
      addTag: (id: string, raw: string) => setState((s) => notes.addTag(s, id, raw)),
      removeTag: (id: string, tag: string) => setState((s) => notes.removeTag(s, id, tag)),
      trash: (id: string) => setState((s) => notes.trashNote(s, id)),
      restore: (id: string) => setState((s) => notes.restoreNote(s, id)),
      purge: (id: string) =>
        setState((s) => {
          const res = notes.purgeNote(s, id);
          void deleteImages(res.images);
          return res.state;
        }),
      dropEmpty: () => setState(notes.dropEmptyNotes),
      emptyTrash: () =>
        setState((s) => {
          const res = notes.emptyTrash(s);
          void deleteImages(res.images);
          return res.state;
        }),
      replace: (next: BetterNotesState) => setState(next),
    }),
    [],
  );

  const api = React.useMemo<StoreApi>(
    () => ({ state, hydrated, ...actions }),
    [state, hydrated, actions],
  );

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

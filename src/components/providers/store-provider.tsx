"use client";

import * as React from "react";
import { clearState, loadStateResult, readMirrorResult, saveState, writeMirror } from "@/lib/storage";
import { deleteImages, listImages } from "@/lib/images";
import { toggleTaskAt } from "@/lib/checklist";
import { isNative } from "@/lib/native";
import { getPrefs } from "@/lib/prefs";
import { isSupabaseConfigured } from "@/lib/supabase";
import { syncNotes } from "@/lib/sync";
import * as notes from "@/lib/notes";
import { EMPTY_STATE, type BetterNotesState, type Note } from "@/lib/types";

/**
 * Jediný zdroj pravdy pro poznámky.
 *
 * Stav se drží celý v paměti a ukládá se krátce po změně (a hned při
 * schování appky). Zápis je levný (jeden JSON) a tenhle model odpadá celou
 * třídu chyb, kdy se v telefonu a v obrazovce liší data.
 */
export interface StoreApi {
  state: BetterNotesState;
  hydrated: boolean;
  /** Poslední zápis do localStorage selhal (plný telefon). Zmizí s dalším úspěšným. */
  saveFailed: boolean;
  /** localStorage byl prázdný a poznámky se vrátily ze záložní kopie v souboru. */
  restoredFromMirror: boolean;
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
  archive: (id: string) => void;
  unarchive: (id: string) => void;
  /** Vrátí poznámky přesně ze snímku - pro Zpět. */
  putNotes: (notes: Note[]) => void;
  /** Aktuální podoba poznámek, než se na ně sáhne - pro Zpět. */
  snapshot: (ids: string[]) => Note[];
  updateMany: (ids: string[], patch: Partial<Pick<Note, "tone" | "pinned">>) => void;
  trashMany: (ids: string[]) => void;
  archiveMany: (ids: string[]) => void;
  /** Zaškrtne úkol na řádku s pozicí `offset`; hotové sjedou dolů podle nastavení. */
  toggleTask: (id: string, offset: number) => void;
  /** Hned sladí poznámky s databází (po přihlášení). */
  syncNow: () => void;
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

const SAVE_DELAY = 250;
const MIRROR_DELAY = 3000;
const AUTO_SEND_DELAY = 3000;

function many(
  ids: string[],
  change: (s: BetterNotesState, id: string) => BetterNotesState,
): (s: BetterNotesState) => BetterNotesState {
  return (s) => ids.reduce(change, s);
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<BetterNotesState>(EMPTY_STATE);
  const [hydrated, setHydrated] = React.useState(false);
  const [saveFailed, setSaveFailed] = React.useState(false);
  const [restoredFromMirror, setRestoredFromMirror] = React.useState(false);

  // Snímek stavu pro úklid, zápis a Zpět. Přes ref, ne přes závislost: kdyby
  // úklid běžel po každé změně, smazal by čerstvě vyfocenou fotku dřív, než
  // se jméno souboru stihne uložit do poznámky.
  const stateRef = React.useRef(state);
  stateRef.current = state;

  /**
   * Start: localStorage, a když je prázdný, záložní kopie v souboru.
   * Prázdný localStorage při existující kopii znamená, že ho WebView
   * vyčistil - ne že uživatel nemá poznámky.
   */
  React.useEffect(() => {
    let cancelled = false;
    const { state: loaded, found, savedAt } = loadStateResult();
    if (!isNative()) {
      setState(loaded);
      setHydrated(true);
      return;
    }
    // Kopie se čte i při nalezeném localStorage: ten mohl přijít o poslední
    // zápis (WebView ho na disk ukládá opožděně). `hydrated` až potom - úklid
    // fotek nad starším stavem by smazal čerstvě přidanou fotku.
    void readMirrorResult().then((mirror) => {
      if (cancelled) return;
      const useMirror = !!mirror && mirror.state.notes.length > 0 && (!found || mirror.savedAt > savedAt);
      setState(useMirror ? mirror.state : loaded);
      if (useMirror && !found) setRestoredFromMirror(true);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Zápis s odkladem: psaní by jinak serializovalo celý zápisník při každé
   * klávese. Odložený zápis se dožene při schování appky - po něm už nemusí
   * přijít nic, Android proces klidně zabije.
   */
  const persist = React.useMemo(() => {
    let saveTimer: number | undefined;
    let mirrorTimer: number | undefined;
    let saveDirty = false;
    let mirrorDirty = false;
    let saveOk = true;
    /** Kdy se stav změnil - obě kopie dostanou stejné razítko, ať jdou porovnat. */
    let changedAt = 0;

    const flushSave = () => {
      window.clearTimeout(saveTimer);
      if (!saveDirty) return;
      saveDirty = false;
      saveOk = saveState(stateRef.current, changedAt);
      setSaveFailed(!saveOk);
    };
    const flushMirror = () => {
      window.clearTimeout(mirrorTimer);
      if (!mirrorDirty) return;
      mirrorDirty = false;
      void writeMirror(stateRef.current, changedAt).then((written) => {
        // localStorage zůstal na starší verzi a při startu by vyhrál nad
        // čerstvější kopií. Bez něj start sáhne po kopii.
        if (written && !saveOk) clearState();
      });
    };
    return {
      schedule: () => {
        changedAt = Date.now();
        saveDirty = true;
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(flushSave, SAVE_DELAY);
        if (!isNative()) return;
        mirrorDirty = true;
        window.clearTimeout(mirrorTimer);
        mirrorTimer = window.setTimeout(flushMirror, MIRROR_DELAY);
      },
      flush: () => {
        flushSave();
        flushMirror();
      },
    };
  }, []);

  React.useEffect(() => {
    if (hydrated) persist.schedule();
  }, [state, hydrated, persist]);

  /**
   * Synchronizace s databází. Stažené změny se zapíšou přímo do stavu - jako
   * Zpět (`putNotes`), takže stažená poznámka nedostane nové razítko.
   */
  const syncNow = React.useCallback(() => {
    if (!isSupabaseConfigured()) return;
    void syncNotes(
      () => stateRef.current.notes,
      (upsert, remove) =>
        setState((s) => {
          const next = notes.putNotes(s, upsert);
          return remove.length ? { ...next, notes: next.notes.filter((n) => !remove.includes(n.id)) } : next;
        }),
    );
  }, []);

  // Pár sekund po poslední změně, ať se neposílá každá klávesa.
  React.useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(syncNow, AUTO_SEND_DELAY);
    return () => window.clearTimeout(timer);
  }, [state, hydrated, syncNow]);

  // Po návratu do appky / obnovení sítě stáhne cizí změny a dožene svoje.
  React.useEffect(() => {
    if (!hydrated) return;
    const retry = () => {
      if (document.visibilityState === "visible") syncNow();
    };
    document.addEventListener("visibilitychange", retry);
    window.addEventListener("online", retry);
    return () => {
      document.removeEventListener("visibilitychange", retry);
      window.removeEventListener("online", retry);
    };
  }, [hydrated, syncNow]);

  React.useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") persist.flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", persist.flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", persist.flush);
      persist.flush();
    };
  }, [persist]);

  /**
   * Úklid fotek, na které už nikdo neukazuje. Běží jednou po startu a mimo
   * hlavní cestu: fotka může osiřet pádem appky uprostřed úpravy, kdy se
   * o ni nemá kdo postarat.
   */
  React.useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void listImages().then((stored) => {
      // Prázdný stav po startu může být i nepovedené načtení (rozbitý
      // localStorage, nečitelná kopie) - pak by úklid smazal všechny fotky.
      if (cancelled || stored.length === 0 || stateRef.current.notes.length === 0) return;
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
   *
   * Mazání souborů do updaterů nepatří (StrictMode je volá dvakrát): jména
   * fotek se zjistí ze `stateRef` předem a smažou se až po `setState`.
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
      purge: (id: string) => {
        const { images } = notes.purgeNote(stateRef.current, id);
        setState((s) => notes.purgeNote(s, id).state);
        void deleteImages(images);
      },
      dropEmpty: () => setState(notes.dropEmptyNotes),
      emptyTrash: () => {
        const { images } = notes.emptyTrash(stateRef.current);
        setState((s) => notes.emptyTrash(s).state);
        void deleteImages(images);
      },
      replace: (next: BetterNotesState) => setState(next),
      archive: (id: string) => setState((s) => notes.archiveNote(s, id)),
      unarchive: (id: string) => setState((s) => notes.unarchiveNote(s, id)),
      putNotes: (list: Note[]) => setState((s) => notes.putNotes(s, list)),
      snapshot: (ids: string[]) =>
        ids
          .map((id) => notes.findNote(stateRef.current, id))
          .filter((n): n is Note => n !== undefined),
      updateMany: (ids: string[], patch: Partial<Pick<Note, "tone" | "pinned">>) =>
        setState(many(ids, (s, id) => notes.updateNote(s, id, patch))),
      trashMany: (ids: string[]) => setState(many(ids, (s, id) => notes.trashNote(s, id))),
      archiveMany: (ids: string[]) => setState(many(ids, (s, id) => notes.archiveNote(s, id))),
      toggleTask: (id: string, offset: number) =>
        setState((s) => {
          const note = notes.findNote(s, id);
          if (!note) return s;
          const text = toggleTaskAt(note.text, offset, getPrefs().sinkChecked);
          return text === note.text ? s : notes.updateNote(s, id, { text });
        }),
    }),
    [],
  );

  const api = React.useMemo<StoreApi>(
    () => ({ state, hydrated, saveFailed, restoredFromMirror, syncNow, ...actions }),
    [state, hydrated, saveFailed, restoredFromMirror, syncNow, actions],
  );

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

/**
 * Zpět/Znovu v editoru.
 *
 * Textové pole ve WebView o nativní historii přichází, protože hodnotu
 * přepisuje React. Historie se proto vede tady: snímek před úpravou,
 * psaní v rychlém sledu (do 1 s) se slévá do jednoho kroku.
 */
export interface EditSnapshot {
  title: string;
  text: string;
  caret: number;
}

export interface EditHistory {
  past: EditSnapshot[];
  future: EditSnapshot[];
  lastAt: number;
}

const MAX_STEPS = 100;
const COALESCE_MS = 1000;

export function createHistory(): EditHistory {
  return { past: [], future: [], lastAt: 0 };
}

export function recordEdit(h: EditHistory, before: EditSnapshot, now: number): EditHistory {
  const past = now - h.lastAt < COALESCE_MS ? h.past : [...h.past, before].slice(-MAX_STEPS);
  return { past, future: [], lastAt: now };
}

// `lastAt: 0` - první úprava po Zpět musí uložit vlastní krok, jinak by se
// stav, ke kterému se uživatel vrátil, slil s předchozím a zmizel.
export function undoEdit(
  h: EditHistory,
  current: EditSnapshot,
): { history: EditHistory; snapshot: EditSnapshot } | null {
  const snapshot = h.past[h.past.length - 1];
  if (!snapshot) return null;
  return { history: { past: h.past.slice(0, -1), future: [...h.future, current], lastAt: 0 }, snapshot };
}

export function redoEdit(
  h: EditHistory,
  current: EditSnapshot,
): { history: EditHistory; snapshot: EditSnapshot } | null {
  const snapshot = h.future[h.future.length - 1];
  if (!snapshot) return null;
  return { history: { past: [...h.past, current], future: h.future.slice(0, -1), lastAt: 0 }, snapshot };
}

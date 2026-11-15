import { describe, expect, it } from "vitest";
import { createHistory, recordEdit, redoEdit, undoEdit, type EditSnapshot } from "./history";

const snap = (text: string): EditSnapshot => ({ title: "", text, caret: text.length });

describe("historie editoru", () => {
  it("psaní v rychlém sledu slévá do jednoho kroku", () => {
    let h = createHistory();
    h = recordEdit(h, snap(""), 10_000);
    h = recordEdit(h, snap("a"), 10_300);
    h = recordEdit(h, snap("ab"), 10_600);
    expect(h.past).toEqual([snap("")]);
    h = recordEdit(h, snap("abc"), 12_000);
    expect(h.past).toEqual([snap(""), snap("abc")]);
  });

  it("Zpět a Znovu jsou symetrické", () => {
    let h = createHistory();
    h = recordEdit(h, snap(""), 10_000);
    h = recordEdit(h, snap("a"), 20_000);
    const current = snap("ab");

    const u1 = undoEdit(h, current)!;
    expect(u1.snapshot).toEqual(snap("a"));
    const u2 = undoEdit(u1.history, u1.snapshot)!;
    expect(u2.snapshot).toEqual(snap(""));
    expect(undoEdit(u2.history, u2.snapshot)).toBeNull();

    const r1 = redoEdit(u2.history, u2.snapshot)!;
    expect(r1.snapshot).toEqual(snap("a"));
    const r2 = redoEdit(r1.history, r1.snapshot)!;
    expect(r2.snapshot).toEqual(current);
    expect(redoEdit(r2.history, r2.snapshot)).toBeNull();
  });

  it("nová úprava po Zpět zahodí Znovu a uloží vlastní krok", () => {
    let h = createHistory();
    h = recordEdit(h, snap(""), 10_000);
    const undone = undoEdit(h, snap("a"))!;
    expect(undone.history.future).toHaveLength(1);
    h = recordEdit(undone.history, snap(""), 10_100);
    expect(h.future).toEqual([]);
    expect(h.past).toEqual([snap("")]);
  });

  it("drží nejvýš 100 kroků", () => {
    let h = createHistory();
    for (let i = 0; i < 150; i++) h = recordEdit(h, snap(String(i)), i * 2000 + 2000);
    expect(h.past).toHaveLength(100);
    expect(h.past[0].text).toBe("50");
  });
});

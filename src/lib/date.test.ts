import { describe, expect, it } from "vitest";
import { dayTitle, formatStamp } from "./date";

describe("formatStamp", () => {
  const now = new Date(2026, 10, 13, 18, 0);
  const at = (y: number, m: number, d: number, h = 14, min = 5) => new Date(y, m - 1, d, h, min).toISOString();

  it("dnes čas, včera slovem, jinak datum a rok jen když není letošní", () => {
    expect(formatStamp(at(2026, 11, 13), now)).toBe("14:05");
    expect(formatStamp(at(2026, 11, 13, 9, 0), now)).toBe("9:00");
    expect(formatStamp(at(2026, 11, 12), now)).toBe("včera");
    expect(formatStamp(at(2026, 11, 11), now)).toBe("11. 11.");
    expect(formatStamp(at(2025, 11, 12), now)).toBe("12. 11. 2025");
    expect(formatStamp("nesmysl", now)).toBe("");
  });
});

describe("dayTitle", () => {
  it("den v týdnu s velkým písmenem a měsíc ve 2. pádě", () => {
    expect(dayTitle("2026-11-13")).toBe("Pátek 13. listopadu");
    expect(dayTitle("2026-01-01")).toBe("Čtvrtek 1. ledna");
  });
});
import { describe, expect, it } from "vitest";
import { normalizeSupabaseUrl, parsePrefs, DEFAULT_PREFS } from "./prefs";

/**
 * Adresu opisuje uživatel z dashboardu do telefonu, takže sem chodí i půlka
 * z ní. Co jde doplnit, doplníme - hádat formát není jeho práce.
 */
describe("normalizeSupabaseUrl", () => {
  it("doplní schéma", () => {
    expect(normalizeSupabaseUrl("abcdefgh.supabase.co")).toBe("https://abcdefgh.supabase.co");
  });

  it("napsané schéma nechá být", () => {
    expect(normalizeSupabaseUrl("https://abcdefgh.supabase.co")).toBe(
      "https://abcdefgh.supabase.co",
    );
  });

  it("uřízne lomítko na konci, ať se cesty neskládají se dvěma", () => {
    expect(normalizeSupabaseUrl("https://abcdefgh.supabase.co/")).toBe(
      "https://abcdefgh.supabase.co",
    );
  });

  it("okolní mezery nevadí", () => {
    expect(normalizeSupabaseUrl("  abcdefgh.supabase.co  ")).toBe("https://abcdefgh.supabase.co");
  });

  it("prázdný vstup znamená, že se použije adresa z buildu", () => {
    expect(normalizeSupabaseUrl("   ")).toBe("");
  });
});

describe("parsePrefs", () => {
  it("nesmysl místo nastavení spadne na výchozí", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("text")).toEqual(DEFAULT_PREFS);
  });

  it("neznámé volby zahodí, známé nechá", () => {
    expect(parsePrefs({ view: "duhová", order: "title" })).toMatchObject({
      view: "list",
      order: "title",
    });
  });

  it("adresu ze starého nastavení taky dorovná", () => {
    expect(parsePrefs({ supabaseUrl: "abcdefgh.supabase.co/" }).supabaseUrl).toBe(
      "https://abcdefgh.supabase.co",
    );
  });
});

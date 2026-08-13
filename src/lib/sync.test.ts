import { describe, expect, it } from "vitest";
import { isEndpointUsable, normalizeEndpoint } from "./sync";

/**
 * Adresu píše uživatel prstem do telefonu, takže sem chodí i půlka z ní.
 * Co jde doplnit, doplníme - hádat formát adresy není jeho práce.
 */
describe("normalizeEndpoint", () => {
  it("doplní schéma i cestu", () => {
    expect(normalizeEndpoint("192.168.1.10:3000")).toBe("http://192.168.1.10:3000/upload");
  });

  it("napsanou cestu nechá být", () => {
    expect(normalizeEndpoint("http://192.168.1.10:3000/prijem")).toBe(
      "http://192.168.1.10:3000/prijem",
    );
  });

  it("https nepřepisuje na http", () => {
    expect(normalizeEndpoint("https://pc.doma:8443")).toBe("https://pc.doma:8443/upload");
  });

  it("okolní mezery nevadí", () => {
    expect(normalizeEndpoint("  192.168.1.10:3000  ")).toBe("http://192.168.1.10:3000/upload");
  });

  it("prázdná adresa znamená vypnutou funkci", () => {
    expect(normalizeEndpoint("   ")).toBe("");
    expect(isEndpointUsable("")).toBe(false);
    expect(isEndpointUsable("192.168.1.10:3000")).toBe(true);
  });
});

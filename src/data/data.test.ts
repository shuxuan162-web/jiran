import { describe, expect, it } from "vitest";
import { PROPERTIES } from "./properties";
import { LANDMARKS } from "./landmarks";
import { MALL_CATEGORIES, STORES } from "./mall";
import { insideElmina } from "../lib/map/elmina";
import sql from "../../supabase/migrations/0007_enquiries.sql?raw";

describe("properties", () => {
  it("lists exactly the four official City of Elmina properties", () => {
    expect(PROPERTIES.map((p) => p.name)).toEqual(["Kanopi Residences", "Elmina Ridge 2", "Jumpa @ Elmina Valley", "Elmina Business Park"]);
  });
  it("uses the same slugs the database accepts for enquiries", () => {
    for (const p of PROPERTIES) expect(sql).toContain(`'${p.slug}'`);
  });
  it("links only to the official Sime Darby Property site", () => {
    for (const p of PROPERTIES) expect(p.url.startsWith("https://www.simedarbyproperty.com/")).toBe(true);
  });
  it("places every property and landmark on the township map", () => {
    for (const x of [...PROPERTIES, ...LANDMARKS]) expect(insideElmina(x.lat, x.lng)).toBe(true);
  });
});

describe("mall directory", () => {
  it("has unique store names, known categories and GF/GK/DT/P lots", () => {
    expect(new Set(STORES.map((s) => s.name)).size).toBe(STORES.length);
    for (const s of STORES) {
      expect(MALL_CATEGORIES).toContain(s.cat);
      if (s.lot) expect(s.lot).toMatch(/^(GF|GK|DT|P)-/);
    }
  });
});

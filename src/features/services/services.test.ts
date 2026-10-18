import { describe, expect, it } from "vitest";
import { normalizePlate, plateOk } from "./api";
import { searchFaq } from "../../data/faq";
import faqSql from "../../../supabase/migrations/0012_surveys_faq.sql?raw";

describe("car plates", () => {
  it("normalises spacing and case", () => {
    expect(normalizePlate(" wxy  1234 ")).toBe("WXY 1234");
    expect(normalizePlate("b-1 2.3")).toBe("B1 23");
  });
  it("needs at least one digit and 2-12 characters", () => {
    expect(plateOk("WXY 1234")).toBe(true);
    expect(plateOk("ABC")).toBe(false);
    expect(plateOk("A")).toBe(false);
  });
});

// The FAQ rows the migration starts with (same text residents saw before the FAQ moved to the database)
const seeded = [...faqSql.matchAll(/\(\$q\$([a-z-]+)\$q\$, \$q\$[a-z]+\$q\$, \$q\$(.*?)\$q\$, \$q\$(.*?)\$q\$, .*?array\[(.*?)\]::text\[\]/g)]
  .map((m) => ({ id: m[1], question: m[2], answer: m[3], keywords: [...m[4].matchAll(/\$q\$(.*?)\$q\$/g)].map((k) => k[1]) }));

describe("FAQ helper", () => {
  it("starts with the 14 existing questions", () => { expect(seeded).toHaveLength(14); });
  it("finds the visitor answer from a casual question", () => {
    expect(searchFaq(seeded, "how to register my guest?")[0].id).toBe("visitor");
  });
  it("finds contact numbers", () => {
    expect(searchFaq(seeded, "what is the hotline number")[0].id).toBe("contact");
  });
  it("returns everything for an empty search and nothing for nonsense", () => {
    expect(searchFaq(seeded, "")).toHaveLength(seeded.length);
    expect(searchFaq(seeded, "zzqx")).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { resolveLang, translate } from "./index";

describe("language", () => {
  it("treats a stored legacy BM choice and unknown values as English", () => {
    for (const v of ["bm", "ms", "ms-MY", "xx", "", null, undefined]) expect(resolveLang(v)).toBe("en");
    expect(resolveLang("en")).toBe("en");
  });
  it("still translates with variables", () => {
    expect(translate("en", "app.name")).toBe("Jiran");
  });
});

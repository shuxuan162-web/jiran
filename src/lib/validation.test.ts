import { describe, expect, it } from "vitest";
import {
  fileProblem, formatNric, isInviteToken, isValidEmail, isValidId, isValidNickname, isValidNric,
  isValidPassport, maskId, passwordProblem, safeFileName,
} from "./validation";

describe("NRIC", () => {
  it("accepts 12 digits with or without dashes", () => {
    expect(isValidNric("900101-14-1234")).toBe(true);
    expect(isValidNric("900101141234")).toBe(true);
  });
  it("rejects wrong length or impossible dates", () => {
    expect(isValidNric("90010114123")).toBe(false);
    expect(isValidNric("901301141234")).toBe(false); // month 13
    expect(isValidNric("900100141234")).toBe(false); // day 0
  });
  it("formats while typing", () => {
    expect(formatNric("900101")).toBe("900101");
    expect(formatNric("9001011")).toBe("900101-1");
    expect(formatNric("900101141234999")).toBe("900101-14-1234");
  });
});

describe("passport and id", () => {
  it("validates passports", () => {
    expect(isValidPassport("a1234567")).toBe(true);
    expect(isValidPassport("A12")).toBe(false);
  });
  it("dispatches by type", () => {
    expect(isValidId("nric", "900101-14-1234")).toBe(true);
    expect(isValidId("passport", "900101-14-1234")).toBe(true);
    expect(isValidId("nric", "A1234567")).toBe(false);
  });
  it("masks to last four", () => {
    expect(maskId("1234")).toBe("•••• 1234");
    expect(maskId(null)).toBe("••••");
  });
});

describe("account fields", () => {
  it("email", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
  });
  it("nickname", () => {
    expect(isValidNickname("Kopi_Kaki")).toBe(true);
    expect(isValidNickname("ab")).toBe(false);
    expect(isValidNickname("has space")).toBe(false);
  });
  it("password", () => {
    expect(passwordProblem("abcdefg1")).toBeNull();
    expect(passwordProblem("abcdefgh")).toBe("weak_password");
    expect(passwordProblem("a1")).toBe("weak_password");
  });
});

describe("files and tokens", () => {
  it("checks upload type and size", () => {
    expect(fileProblem({ size: 1000, type: "application/pdf" })).toBeNull();
    expect(fileProblem({ size: 6 * 1024 * 1024, type: "image/png" })).toBe("file_too_big");
    expect(fileProblem({ size: 10, type: "image/gif" })).toBe("file_type");
  });
  it("makes safe file names", () => {
    expect(safeFileName("My Cert (final).PDF")).toBe("my-cert-final.pdf");
    expect(safeFileName("../../etc/passwd")).not.toContain("/");
    expect(safeFileName("photo")).toBe("photo.bin");
  });
  it("recognises invite tokens", () => {
    expect(isInviteToken("a".repeat(48))).toBe(true);
    expect(isInviteToken("xyz")).toBe(false);
  });
});

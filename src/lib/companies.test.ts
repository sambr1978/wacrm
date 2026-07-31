import { describe, expect, it } from "vitest";
import {
  buildCompanyDisplayName,
  normalizeCompanyName,
  shouldAutoLinkCompany,
} from "./companies";

describe("normalizeCompanyName", () => {
  it("normalizes case, accents, punctuation, and repeated spaces", () => {
    expect(normalizeCompanyName("  Ácme   Comércio LTDA. ")).toBe(
      "acme comercio ltda",
    );
    expect(normalizeCompanyName("ACME Comercio Ltda")).toBe(
      "acme comercio ltda",
    );
  });

  it("returns an empty key for blank names", () => {
    expect(normalizeCompanyName("   ")).toBe("");
  });
});

describe("buildCompanyDisplayName", () => {
  it("prefers trade name and falls back to legal name", () => {
    expect(
      buildCompanyDisplayName({
        trade_name: "Acme",
        legal_name: "Acme Comercio Ltda",
      }),
    ).toBe("Acme");
    expect(
      buildCompanyDisplayName({
        trade_name: null,
        legal_name: "Acme Comercio Ltda",
      }),
    ).toBe("Acme Comercio Ltda");
  });
});

describe("shouldAutoLinkCompany", () => {
  it("links only when there is exactly one normalized candidate", () => {
    expect(shouldAutoLinkCompany("Acme", ["acme"])).toBe(true);
    expect(shouldAutoLinkCompany("Acme", [])).toBe(false);
    expect(shouldAutoLinkCompany("Acme", ["acme", "acme"])).toBe(false);
    expect(shouldAutoLinkCompany("", ["acme"])).toBe(false);
  });
});

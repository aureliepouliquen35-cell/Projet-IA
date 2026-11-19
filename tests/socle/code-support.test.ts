import { describe, expect, it } from "vitest";

import { codeDepuisDigest, codeDepuisErreur, nouveauCodeSupport } from "@/shared/code-support";

// Un seul format de code support : entier en base 36, majuscules. Le code
// d'une erreur de page se calcule depuis l'empreinte décimale de Next.js.

const FORME = /^[0-9A-Z]{1,7}$/;

describe("codeDepuisDigest", () => {
  it("écrit l'empreinte décimale en base 36, en majuscules", () => {
    expect(codeDepuisDigest("1234567890")).toBe("KF12OI");
    expect(codeDepuisDigest("0")).toBe("0");
    expect(codeDepuisDigest("4294967295")).toBe("1Z141Z3");
  });

  it("ignore ce qui n'est pas une empreinte décimale sur 32 bits", () => {
    for (const valeur of [undefined, null, 42, "", "NEXT_NOT_FOUND", "12a", "-5", "4294967296", "99999999999"]) {
      expect(codeDepuisDigest(valeur)).toBeUndefined();
    }
  });
});

describe("codeDepuisErreur", () => {
  it("lit l'empreinte posée par Next.js sur l'erreur", () => {
    const erreur = Object.assign(new Error("x"), { digest: "1234567890" });
    expect(codeDepuisErreur(erreur)).toBe("KF12OI");
  });

  it("ne donne aucun code sans empreinte (erreur levée dans le navigateur)", () => {
    expect(codeDepuisErreur(new Error("x"))).toBeUndefined();
    expect(codeDepuisErreur("texte")).toBeUndefined();
    expect(codeDepuisErreur(null)).toBeUndefined();
  });
});

describe("nouveauCodeSupport", () => {
  it("a la même forme qu'un code d'empreinte et change à chaque tirage", () => {
    const codes = new Set(Array.from({ length: 50 }, nouveauCodeSupport));
    for (const code of codes) expect(code).toMatch(FORME);
    expect(codes.size).toBeGreaterThan(45);
  });
});

import { describe, expect, it } from "vitest";

import { formaterDateHeure } from "@/shared/dates";

// Format UX : « 8 nov. 2026, 9 h 14 », en heure de Paris quel que soit le
// fuseau du serveur ou du navigateur.

describe("formaterDateHeure", () => {
  it("affiche l'exemple d'EXPERIENCE.md (heure d'hiver, UTC+1)", () => {
    expect(formaterDateHeure(new Date("2026-11-08T08:14:00Z"))).toBe("8 nov. 2026, 9 h 14");
  });

  it("suit l'heure d'été de Paris (UTC+2) et garde deux chiffres aux minutes", () => {
    expect(formaterDateHeure(new Date("2026-07-01T07:05:00Z"))).toBe("1 juil. 2026, 9 h 05");
  });

  it("passe au jour suivant à minuit, heure de Paris", () => {
    expect(formaterDateHeure(new Date("2026-12-31T23:00:00Z"))).toBe("1 janv. 2027, 0 h 00");
  });

  it("affiche l'après-midi sur 24 heures", () => {
    expect(formaterDateHeure(new Date("2026-03-10T16:42:00Z"))).toBe("10 mars 2026, 17 h 42");
  });
});

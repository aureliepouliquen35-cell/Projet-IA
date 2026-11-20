import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ALPHABET_MOT_DE_PASSE,
  genererMotDePasseTemporaire,
  LONGUEUR_MOT_DE_PASSE_TEMPORAIRE,
} from "@/server/admin";
import { LONGUEUR_MINIMALE_MOT_DE_PASSE } from "@/shared/constantes";
import { validerCompte } from "@/shared/schemas/compte";

// Mot de passe temporaire (FR-21, NFR-11) : 16 caractères tirés au hasard par
// un générateur cryptographique, sans caractères qu'on confond en recopiant.

describe("genererMotDePasseTemporaire", () => {
  it("donne 16 caractères, donc au moins 12", () => {
    expect(LONGUEUR_MOT_DE_PASSE_TEMPORAIRE).toBe(16);
    expect(LONGUEUR_MOT_DE_PASSE_TEMPORAIRE).toBeGreaterThanOrEqual(LONGUEUR_MINIMALE_MOT_DE_PASSE);
    for (let i = 0; i < 50; i += 1) {
      expect(genererMotDePasseTemporaire()).toHaveLength(16);
    }
  });

  it("n'utilise que l'alphabet, sans 0, O, o, 1, l ni I", () => {
    for (const ambigu of ["0", "O", "o", "1", "l", "I"]) {
      expect(ALPHABET_MOT_DE_PASSE).not.toContain(ambigu);
    }
    expect(new Set(ALPHABET_MOT_DE_PASSE).size).toBe(ALPHABET_MOT_DE_PASSE.length);
    for (let i = 0; i < 50; i += 1) {
      expect(genererMotDePasseTemporaire()).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]{16}$/);
    }
  });

  it("ne se répète pas, et utilise tout l'alphabet", () => {
    const tirages = Array.from({ length: 500 }, () => genererMotDePasseTemporaire());
    expect(new Set(tirages).size).toBe(500);
    const vus = new Set(tirages.join(""));
    expect(vus.size).toBe(ALPHABET_MOT_DE_PASSE.length);
  });

  it("tire chaque caractère avec crypto.randomInt, jamais Math.random", () => {
    const source = readFileSync(join(process.cwd(), "src", "server", "admin", "index.ts"), "utf8");
    expect(source).toMatch(/import \{ randomInt \} from "node:crypto"/);
    expect(source).not.toContain("Math.random");
  });

  it("est accepté par le schéma du compte", () => {
    const validation = validerCompte({
      nom: "Sophie Martin",
      email: "sophie@exemple.fr",
      role: "administrateur",
      motDePasseTemporaire: genererMotDePasseTemporaire(),
    });
    expect(validation.ok).toBe(true);
  });
});

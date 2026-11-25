import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  ALPHABET_MOT_DE_PASSE,
  genererMotDePasseTemporaire,
  LONGUEUR_MOT_DE_PASSE_TEMPORAIRE,
} from "@/server/admin";
import { LONGUEUR_MINIMALE_MOT_DE_PASSE } from "@/shared/constantes";
import { validerCompte } from "@/shared/schemas/compte";

// Mot de passe temporaire (FR-21, NFR-11) : 16 caractères tirés au hasard par
// un générateur cryptographique (Web Crypto, dans `src/shared` depuis la
// story 3.2), sans caractères qu'on confond en recopiant.

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

  it("tire chaque caractère avec crypto.getRandomValues (Web Crypto), jamais Math.random", () => {
    const source = readFileSync(join(process.cwd(), "src", "shared", "mot-de-passe-temporaire.ts"), "utf8");
    expect(source).toContain("crypto.getRandomValues(");
    expect(source).not.toContain("Math.random");
    // Rien de Node.js : le même code tourne dans le navigateur (« Générer »).
    expect(source).not.toMatch(/from "node:|server-only/);
  });

  it("src/server/admin réexporte le même générateur (procédure d'installation)", async () => {
    const partage = await import("@/shared/mot-de-passe-temporaire");
    expect(genererMotDePasseTemporaire).toBe(partage.genererMotDePasseTemporaire);
    expect(ALPHABET_MOT_DE_PASSE).toBe(partage.ALPHABET_MOT_DE_PASSE);
    expect(LONGUEUR_MOT_DE_PASSE_TEMPORAIRE).toBe(partage.LONGUEUR_MOT_DE_PASSE_TEMPORAIRE);
  });

  it("tirage sans biais : un octet au-delà du dernier multiple de la taille de l'alphabet est rejeté", () => {
    // 56 caractères, 256 = 4 × 56 + 32 : les octets 224 à 255 favoriseraient
    // les 32 premiers caractères. Ils sont rejetés et un nouveau tirage est fait.
    expect(ALPHABET_MOT_DE_PASSE).toHaveLength(56);
    const tirages = [[255, 254, 224, 0], [223, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]];
    let appel = 0;
    const espion = vi.spyOn(crypto, "getRandomValues").mockImplementation(((tableau: Uint8Array) => {
      tableau.fill(255);
      tableau.set(tirages[Math.min(appel, tirages.length - 1)].slice(0, tableau.length));
      appel += 1;
      return tableau;
    }) as never);
    try {
      const motDePasse = genererMotDePasseTemporaire();
      const a = ALPHABET_MOT_DE_PASSE;
      // 255, 254, 224 rejetés, puis le reste du premier tirage (255) ;
      // 0 → a[0] ; au second tirage, 223 → a[223 % 56] = a[55], puis 1…14.
      expect(motDePasse).toBe(
        a[0] + a[55] + Array.from({ length: 14 }, (_, i) => a[i + 1]).join(""),
      );
      expect(appel).toBe(2);
    } finally {
      espion.mockRestore();
    }
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

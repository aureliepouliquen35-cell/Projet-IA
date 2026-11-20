import { describe, expect, it } from "vitest";

// Adresse de l'écran I2 et pages protégées (AD-7) : même lecture que les
// pages internes (majuscules, `%xx`, barre finale).

import {
  ADRESSE_NOUVEAU_MOT_DE_PASSE,
  estPageNouveauMotDePasse,
  estPageProtegee,
} from "@/shared/acces";

describe("écran I2", () => {
  it("adresse", () => {
    expect(ADRESSE_NOUVEAU_MOT_DE_PASSE).toBe("/connexion/nouveau-mot-de-passe");
  });

  it.each([
    "/connexion/nouveau-mot-de-passe",
    "/connexion/nouveau-mot-de-passe/",
    "/Connexion/Nouveau-Mot-De-Passe",
    "/connexion/%6Eouveau-mot-de-passe",
  ])("%s est l'écran I2, page protégée", (chemin) => {
    expect(estPageNouveauMotDePasse(chemin)).toBe(true);
    expect(estPageProtegee(chemin)).toBe(true);
  });

  it.each(["/connexion", "/connexion/", "/connexion/nouveau-mot-de-passexyz", "/nouveau-mot-de-passe"])(
    "%s n'est pas l'écran I2",
    (chemin) => {
      expect(estPageNouveauMotDePasse(chemin)).toBe(false);
    },
  );
});

describe("estPageProtegee", () => {
  it.each(["/demandes", "/demandes/NOVA-2026-0001", "/admin/comptes", "/%64emandes"])("%s : protégée", (chemin) => {
    expect(estPageProtegee(chemin)).toBe(true);
  });

  it.each(["/", "/confirmation", "/connexion", "/inscription", "/demandesxyz", "/essais", "/%E0"])(
    "%s : publique",
    (chemin) => {
      expect(estPageProtegee(chemin)).toBe(false);
    },
  );
});

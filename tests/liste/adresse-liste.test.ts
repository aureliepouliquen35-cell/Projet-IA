import { describe, expect, it } from "vitest";

import { adresseListe, lireRecherche, LONGUEUR_MAXIMALE_RECHERCHE } from "@/shared/adresse-liste";
import { LONGUEURS_MAXIMALES } from "@/shared/constantes";
import { MESSAGES_LISTE, nombreDemandes } from "@/shared/messages";

// Adresse de la liste (story 1.9 ; convention « Adresse de la liste ») :
// lecture de `?q=`, adresses de la recherche et de la pagination, ligne de
// résultat et textes de la recherche (EXPERIENCE.md, I3).

describe("lireRecherche (?q=)", () => {
  it.each([
    [undefined, ""],
    [null, ""],
    ["", ""],
    ["   ", ""],
    ["  helene  ", "helene"],
    ["\tNOVA-2026-0042\n", "NOVA-2026-0042"],
    [["dupuis", "autre"], "dupuis"],
    [[], ""],
    ["%_'\\", "%_'\\"],
  ] as const)("%j → %j", (valeur, attendue) => {
    expect(lireRecherche(valeur as string | string[] | null | undefined)).toBe(attendue);
  });

  it.each([
    ["\u0000", ""],
    ["a\u0000b", "a b"],
    ["\u0001helene\u001f", "helene"],
    ["x\u007fy", "x y"],
    ["a\r\nb", "a  b"],
  ])("caractères de contrôle (%j) remplacés par une espace (Postgres refuse U+0000)", (valeur, attendue) => {
    expect(lireRecherche(valeur)).toBe(attendue);
    expect(adresseListe({ q: valeur })).not.toMatch(/%00|%01|%1F|%7F/i);
  });

  it("coupé à 150 caractères (la longueur de l'objet)", () => {
    expect(LONGUEUR_MAXIMALE_RECHERCHE).toBe(LONGUEURS_MAXIMALES.objet);
    expect(LONGUEUR_MAXIMALE_RECHERCHE).toBe(150);
    expect(lireRecherche("a".repeat(400))).toBe("a".repeat(150));
  });

  it("compte les caractères comme la base : une lettre accentuée ou un émoji compte pour un", () => {
    expect(Array.from(lireRecherche("é".repeat(200)))).toHaveLength(150);
    expect(Array.from(lireRecherche("🙂".repeat(200)))).toHaveLength(150);
    expect(lireRecherche("🙂".repeat(200))).toBe("🙂".repeat(150));
  });

  it("un espace laissé au bout par la coupe est retiré", () => {
    expect(lireRecherche(`${"a".repeat(149)} suite`)).toBe("a".repeat(149));
  });
});

describe("adresseListe", () => {
  it.each([
    [{}, "/demandes"],
    [{ page: 1 }, "/demandes"],
    [{ page: 3 }, "/demandes?page=3"],
    [{ q: "" }, "/demandes"],
    [{ q: "   ", page: 2 }, "/demandes?page=2"],
    [{ q: "helene" }, "/demandes?q=helene"],
    [{ q: "essai", page: 2 }, "/demandes?q=essai&page=2"],
    [{ q: " Hélène Dupuis " }, "/demandes?q=H%C3%A9l%C3%A8ne+Dupuis"],
    [{ q: "a&page=9#x" }, "/demandes?q=a%26page%3D9%23x"],
  ] as const)("%j → %s", (parametres, attendue) => {
    expect(adresseListe(parametres)).toBe(attendue);
  });

  it("le texte se relit tel quel depuis l'adresse", () => {
    const adresse = new URL(adresseListe({ q: "50 % d'acompte \\ _x_", page: 4 }), "https://nova.example");
    expect(adresse.searchParams.get("q")).toBe("50 % d'acompte \\ _x_");
    expect(adresse.searchParams.get("page")).toBe("4");
  });
});

describe("textes (EXPERIENCE.md, I3)", () => {
  it.each([
    [0, "0 demande"],
    [1, "1 demande"],
    [2, "2 demandes"],
    [42, "42 demandes"],
    [5000, "5 000 demandes"],
  ])("ligne de résultat : %d → « %s »", (nombre, attendu) => {
    expect(nombreDemandes(nombre)).toBe(attendu);
  });

  it("barre de recherche et recherche sans résultat", () => {
    expect(MESSAGES_LISTE.recherche).toBe("Rechercher par référence, nom, email, entreprise ou objet");
    expect(MESSAGES_LISTE.rechercheVideTitre).toBe("Aucune demande trouvée");
    expect(MESSAGES_LISTE.rechercheVideTexte).toBe("Vérifiez l'orthographe ou retirez des filtres.");
    expect(MESSAGES_LISTE.reinitialiser).toBe("Réinitialiser");
  });
});

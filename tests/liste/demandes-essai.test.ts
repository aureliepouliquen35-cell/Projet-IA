import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Commande `npm run demandes:essai` (story 1.8) : 30 demandes clairement
// fictives déposées par `src/server/depot`, sur le projet dev seulement
// (`.env.local`), après avoir affiché le projet et demandé « oui ». Le
// dépôt et les clés sont simulés.

const depot = vi.hoisted(() => ({
  lireFormulaireDepot: vi.fn(),
  deposerDemande: vi.fn(),
}));
const admin = vi.hoisted(() => ({ preparerInstallation: vi.fn() }));

vi.mock("@/server/depot", () => depot);
vi.mock("@/server/admin", () => admin);

import commandeCreerDemandesEssai, {
  demandesEssai,
  MESSAGE_FICHIER_REFUSE,
  NOMBRE_DEMANDES_ESSAI,
  numeroEnvoiEssai,
} from "../../scripts/essai/creer-demandes-essai";
import { FORME_IDENTIFIANT } from "@/shared/schemas/depot";
import type { EntreesSorties } from "../../scripts/installation/commun";

import { CATEGORIES } from "../aides/formulaire-depot";

const ADRESSE = "https://dev-essai.supabase.co";

function console_(reponse = "oui") {
  const sortie: string[] = [];
  const erreurs: string[] = [];
  const questions: string[] = [];
  const es: EntreesSorties = {
    ecrire: (texte) => sortie.push(texte),
    erreur: (texte) => erreurs.push(texte),
    demander: async (question) => {
      questions.push(question);
      return reponse;
    },
  };
  return { es, sortie, erreurs, questions };
}

let numero = 0;

beforeEach(() => {
  vi.clearAllMocks();
  numero = 0;
  vi.stubEnv("NOVA_FICHIER_CLES", ".env.local");
  admin.preparerInstallation.mockReturnValue({ ok: true, donnees: { adresseProjet: ADRESSE } });
  depot.lireFormulaireDepot.mockResolvedValue({ categories: CATEGORIES, contactDonnees: "x" });
  depot.deposerDemande.mockImplementation(async (donnees: { objet: string; email: string }) => {
    numero += 1;
    return {
      ok: true,
      reference: `NOVA-2026-${String(numero).padStart(4, "0")}`,
      objet: donnees.objet,
      email: donnees.email,
    };
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("demandesEssai", () => {
  const demandes = demandesEssai(CATEGORIES);

  it("30 demandes valides, clairement fictives (@exemple.fr), case d'information cochée", () => {
    expect(demandes).toHaveLength(NOMBRE_DEMANDES_ESSAI);
    expect(NOMBRE_DEMANDES_ESSAI).toBeGreaterThan(25);
    for (const demande of demandes) {
      expect(demande.email).toMatch(/^essai-\d{2}@exemple\.fr$/);
      expect(demande.nom).toMatch(/^Personne d'essai \d{2}$/);
      expect(demande.personneInformee).toBe(true);
    }
    expect(new Set(demandes.map((d) => d.email)).size).toBe(NOMBRE_DEMANDES_ESSAI);
  });

  it("réparties sur toutes les catégories actives", () => {
    expect(new Set(demandes.map((d) => d.categorieId))).toEqual(new Set(CATEGORIES.map((c) => c.id)));
  });

  it("aucune catégorie : erreur", () => {
    expect(() => demandesEssai([])).toThrow();
  });
});

describe("npm run demandes:essai", () => {
  it("affiche le projet, demande « oui », dépose 30 demandes par src/server/depot", async () => {
    const c = console_();
    await expect(commandeCreerDemandesEssai([], c.es)).resolves.toBe(0);
    expect(c.sortie).toContain(`Projet Supabase visé : ${ADRESSE}`);
    expect(c.questions).toEqual(["Tapez « oui » pour continuer : "]);
    expect(depot.deposerDemande).toHaveBeenCalledTimes(30);
    expect(c.sortie).toContain("  NOVA-2026-0030 — " + depot.deposerDemande.mock.calls[29][0].objet);
    expect(c.sortie.at(-1)).toBe(
      "30 demandes d'essai en place (celles déjà déposées ne sont pas recréées).",
    );
  });

  it("numéros d'envoi fixes, différents entre eux et identiques d'un lancement à l'autre (AD-20)", async () => {
    await commandeCreerDemandesEssai([], console_().es);
    const premier = depot.deposerDemande.mock.calls.map(([, n]) => n);
    depot.deposerDemande.mockClear();
    await commandeCreerDemandesEssai([], console_().es);
    const second = depot.deposerDemande.mock.calls.map(([, n]) => n);
    expect(new Set(premier).size).toBe(30);
    expect(second).toEqual(premier);
    expect(premier[0]).toBe("00000000-0000-4000-8000-000000000001");
    expect(premier[29]).toBe("00000000-0000-4000-8000-000000000030");
    for (const n of premier) expect(n).toMatch(FORME_IDENTIFIANT);
    expect(numeroEnvoiEssai(7)).toBe("00000000-0000-4000-8000-000000000007");
  });

  it("sans « oui » : rien n'est déposé (sortie 1)", async () => {
    const c = console_("non");
    await expect(commandeCreerDemandesEssai([], c.es)).resolves.toBe(1);
    expect(depot.deposerDemande).not.toHaveBeenCalled();
    expect(c.erreurs).toContain("Annulé : rien n'a été fait.");
  });

  it.each([".env.prod.local", "tests/tmp/.env.local", "../prod/.env.local", undefined])("clés d'un autre fichier (%s) : refus avant toute question", async (fichier) => {
    if (fichier) vi.stubEnv("NOVA_FICHIER_CLES", fichier);
    else delete process.env.NOVA_FICHIER_CLES;
    const c = console_();
    await expect(commandeCreerDemandesEssai([], c.es)).resolves.toBe(1);
    expect(c.erreurs).toEqual([MESSAGE_FICHIER_REFUSE]);
    expect(c.questions).toEqual([]);
    expect(depot.deposerDemande).not.toHaveBeenCalled();
  });

  it("une option : rappel de l'utilisation", async () => {
    const c = console_();
    await expect(commandeCreerDemandesEssai(["--prod"], c.es)).resolves.toBe(1);
    expect(c.erreurs[0]).toMatch(/^Utilisation : npm run demandes:essai/);
  });

  it("clés absentes : message de preparerInstallation", async () => {
    admin.preparerInstallation.mockReturnValue({ ok: false, code: "ERREUR_INTERNE", message: "Clés absentes." });
    const c = console_();
    await expect(commandeCreerDemandesEssai([], c.es)).resolves.toBe(1);
    expect(c.erreurs).toEqual(["Clés absentes."]);
  });

  it("panne au milieu : arrêt, nombre déposé affiché (sortie 1)", async () => {
    depot.deposerDemande.mockImplementationOnce(async () => ({ ok: true, reference: "NOVA-2026-0001", objet: "o", email: "e" }));
    depot.deposerDemande.mockRejectedValueOnce(new Error("La fonction deposer_demande a échoué (code 57P01)."));
    const c = console_();
    await expect(commandeCreerDemandesEssai([], c.es)).resolves.toBe(1);
    expect(depot.deposerDemande).toHaveBeenCalledTimes(2);
    expect(c.erreurs).toContain("Arrêt : 1 demande(s) déposée(s) sur 30.");
  });
});

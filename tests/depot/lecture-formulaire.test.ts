import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `lireFormulaireDepot` (src/server/depot) : ce que le formulaire affiche,
// lu avec la clé secrète (le rôle public n'a aucun droit, AD-9). Client
// Supabase simulé.

type Retour = { data: unknown; error: { code: string; message: string } | null };

const simulation = vi.hoisted(() => {
  const retours: Record<string, Retour> = {};
  /** Suite des appels faits sur chaque table : `["select", "id, nom"]`… */
  const appels: Record<string, [string, ...unknown[]][]> = {};

  function requete(table: string) {
    appels[table] = [];
    const noter =
      (methode: string) =>
      (...arguments_: unknown[]) => {
        appels[table].push([methode, ...arguments_]);
        return chaine;
      };
    const chaine = {
      select: noter("select"),
      eq: noter("eq"),
      order: noter("order"),
      limit: noter("limit"),
      abortSignal: (signal: unknown) => {
        appels[table].push(["abortSignal", signal]);
        return Promise.resolve(retours[table]);
      },
    };
    return chaine;
  }

  const from = vi.fn(requete);
  return { retours, appels, from, creerClientSecret: vi.fn(() => ({ from })) };
});

vi.mock("@/server/supabase-secret", () => ({
  creerClientSecret: simulation.creerClientSecret,
}));

import { lireFormulaireDepot } from "@/server/depot";

import { CATEGORIES, CONTACT_DONNEES } from "../aides/formulaire-depot";

beforeEach(() => {
  simulation.retours.categories = { data: CATEGORIES, error: null };
  simulation.retours.parametres = { data: [{ contact_donnees: CONTACT_DONNEES }], error: null };
});

afterEach(() => vi.clearAllMocks());

describe("lireFormulaireDepot", () => {
  it("renvoie les catégories dans l'ordre de la base et le contact données", async () => {
    await expect(lireFormulaireDepot()).resolves.toEqual({
      categories: CATEGORIES,
      contactDonnees: CONTACT_DONNEES,
    });
  });

  it("ne demande que les catégories actives, dans leur ordre d'affichage", async () => {
    await lireFormulaireDepot();
    expect(simulation.appels.categories.slice(0, 3)).toEqual([
      ["select", "id, nom"],
      ["eq", "active", true],
      ["order", "ordre", { ascending: true }],
    ]);
  });

  it("ne lit que le contact données dans les paramètres : ni le téléphone, ni l'email de contact", async () => {
    await lireFormulaireDepot();
    expect(simulation.appels.parametres[0]).toEqual(["select", "contact_donnees"]);
    expect(simulation.from.mock.calls.map(([table]) => table).sort()).toEqual(["categories", "parametres"]);
  });

  it("n'attend pas indéfiniment la base (délai maximum)", async () => {
    await lireFormulaireDepot();
    for (const table of ["categories", "parametres"]) {
      expect(simulation.appels[table].at(-1)).toEqual(["abortSignal", expect.any(AbortSignal)]);
    }
  });

  it("ne renvoie rien d'autre que l'identifiant et le nom de chaque catégorie", async () => {
    simulation.retours.categories = {
      data: [{ id: CATEGORIES[0].id, nom: CATEGORIES[0].nom, active: true, ordre: 1 }],
      error: null,
    };
    const { categories } = await lireFormulaireDepot();
    expect(categories).toEqual([CATEGORIES[0]]);
  });

  it.each([
    ["les catégories", "categories", "42501"],
    ["les paramètres", "parametres", "PGRST301"],
  ])("lève une erreur si la base refuse %s : la page affiche S3", async (_, table, code) => {
    simulation.retours[table] = { data: null, error: { code, message: "permission denied" } };
    await expect(lireFormulaireDepot()).rejects.toThrow(new RegExp(`code ${code}`));
  });

  it("lève une erreur si la base ne répond pas", async () => {
    simulation.retours.categories = { data: null, error: { code: "", message: "TimeoutError" } };
    await expect(lireFormulaireDepot()).rejects.toThrow(/code inconnu/);
  });

  it("lève une erreur si la clé secrète manque", async () => {
    simulation.creerClientSecret.mockImplementationOnce(() => {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY manquante (voir .env.example).");
    });
    await expect(lireFormulaireDepot()).rejects.toThrow(/manquante/);
  });

  it("lève une erreur si la table des paramètres est vide", async () => {
    simulation.retours.parametres = { data: [], error: null };
    await expect(lireFormulaireDepot()).rejects.toThrow(/contact données/);
  });
});

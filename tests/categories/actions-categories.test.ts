import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Lecture de l'écran A2 et Server Functions « ajouter » et « renommer » une
// catégorie (story 4.1 ; FR-26, RM-7, AD-7, AD-9, AD-11, AD-12), avec
// Supabase simulé : chaque ligne de la matrice de la story (ajout, ajout en
// double, renommage, renommage en double, même nom, nom vide, nom trop
// long, collaborateur, supprimée entre-temps, panne), la garde et le
// journal.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `refresh()` n'a de sens que pendant une vraie Server Function de Next.js.
vi.mock("next/cache", () => ({ refresh }));

import { actionAjouterCategorie } from "@/server/actions/ajouter-categorie";
import { actionRenommerCategorie } from "@/server/actions/renommer-categorie";
import { lireCategoriesAdministration } from "@/server/lectures/categories";
import { lireDemande } from "@/server/lectures/demande";
import { lireCategoriesFiltre } from "@/server/lectures/demandes";
import { lireFormulaireSaisie } from "@/server/lectures/saisie";

import {
  CATEGORIES_DEPART,
  fabriquerDemandes,
  ID_KARIM,
  ID_SOPHIE,
  PROFIL_SOPHIE,
  type RetourRpc,
} from "../aides/supabase-connexion";

const AUTRE = CATEGORIES_DEPART[4];
const DEJA_PRIS = "Une catégorie active porte déjà ce nom.";
const PANNE = "La catégorie n'a pas pu être enregistrée. Réessayez.";
const OBLIGATOIRE = "Ce champ est obligatoire";
const TROP_LONG = "Le nom ne doit pas dépasser 50 caractères";
const NOMS_DEPART = CATEGORIES_DEPART.map((c) => c.nom);

const ajouter = (nom: unknown) => actionAjouterCategorie({ nom });
const renommer = (nom: unknown, categorieId: unknown = AUTRE.id) => actionRenommerCategorie({ categorieId, nom });
const noms = () => simulation.categories.map((c) => c.nom);

const renvoiVers = (chemin: string) => ({
  digest: expect.stringMatching(new RegExp(`^NEXT_REDIRECT;\\w+;${chemin.replace(/\//g, "\\/")};`)),
});

beforeEach(() => {
  simulation.reinitialiser();
  simulation.profils.set(ID_SOPHIE, { ...PROFIL_SOPHIE });
  // Sophie, administratrice, est connectée.
  simulation.session.id = ID_SOPHIE;
  refresh.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Lecture de A2
// ---------------------------------------------------------------------------

describe("lecture de l'écran A2", () => {
  it("toutes les catégories, dans l'ordre d'affichage, avec leur nombre de demandes", async () => {
    simulation.demandes.push(...fabriquerDemandes(6));
    const parCategorie = new Map<string, number>();
    for (const d of simulation.demandes) parCategorie.set(d.categorie, (parCategorie.get(d.categorie) ?? 0) + 1);

    const lecture = await lireCategoriesAdministration();
    expect(lecture).toEqual({
      ok: true,
      donnees: CATEGORIES_DEPART.map((c) => ({
        id: c.id,
        nom: c.nom,
        active: true,
        nombreDemandes: parCategorie.get(c.nom) ?? 0,
      })),
    });
    expect(simulation.rpcSession).toHaveBeenCalledWith("lister_categories_administration");
  });

  it("une catégorie désactivée (story 4.2) reste dans la liste, à sa place", async () => {
    simulation.categories[1].active = false;
    const lecture = await lireCategoriesAdministration();
    expect(lecture.ok && lecture.donnees.map((c) => [c.nom, c.active])).toEqual(
      CATEGORIES_DEPART.map((c, index) => [c.nom, index !== 1]),
    );
  });

  it("collaborateur : accesRefuse, sans appel à la base", async () => {
    simulation.session.id = ID_KARIM;
    await expect(lireCategoriesAdministration()).resolves.toEqual({ ok: false, accesRefuse: true });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("refus NV202 de la base (rôle retiré entre-temps) : accesRefuse, rien au journal", async () => {
    simulation.pannesRpc.lister_categories_administration = { data: null, error: { code: "NV202", message: "x" } };
    await expect(lireCategoriesAdministration()).resolves.toEqual({ ok: false, accesRefuse: true });
    expect(simulation.journal()).toEqual([]);
  });

  it.each([
    ["base injoignable", { data: null, error: { code: "57P01", message: "connexion perdue" } }],
    ["réponse inattendue", { data: [{ id: AUTRE.id, nom: "Autre", active: true }], error: null }],
    ["nombre négatif", { data: [{ id: AUTRE.id, nom: "Autre", active: true, nombre_demandes: -1 }], error: null }],
  ])("%s : { ok: false }, journalisée avec un code court", async (_, retour) => {
    simulation.pannesRpc.lister_categories_administration = retour as RetourRpc;
    await expect(lireCategoriesAdministration()).resolves.toEqual({ ok: false });
    expect(simulation.journal()).toEqual([
      { evenement: "erreur_inattendue", details: { type: "lecture", lecture: "lister_categories_administration" } },
    ]);
  });

  it("sans session : renvoi vers /connexion", async () => {
    simulation.session.id = null;
    await expect(lireCategoriesAdministration()).rejects.toMatchObject(renvoiVers("/connexion"));
  });
});

// ---------------------------------------------------------------------------
// Ajout
// ---------------------------------------------------------------------------

describe("ajout (administrateur)", () => {
  it("« Facturation » : créée active, en dernière position ; réponse, refresh(), rien au journal", async () => {
    const reponse = await ajouter("Facturation");
    expect(reponse).toEqual({ ok: true, donnees: { id: expect.any(String), nom: "Facturation" } });
    expect(simulation.rpcSession).toHaveBeenCalledWith("ajouter_categorie", { p_nom: "Facturation" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(simulation.journal()).toEqual([]);

    const lecture = await lireCategoriesAdministration();
    expect(lecture.ok && lecture.donnees.at(-1)).toEqual({
      id: reponse.ok ? reponse.donnees.id : "",
      nom: "Facturation",
      active: true,
      nombreDemandes: 0,
    });
  });

  it("proposée aussitôt partout où les catégories sont relues : filtre de I3 et formulaire I5", async () => {
    await ajouter("Facturation");
    const filtre = await lireCategoriesFiltre();
    expect(filtre.ok && filtre.donnees.map((c) => c.nom)).toEqual([...NOMS_DEPART, "Facturation"]);
    const formulaire = await lireFormulaireSaisie();
    expect(formulaire.categories.map((c) => c.nom)).toEqual([...NOMS_DEPART, "Facturation"]);
  });

  it("espaces de bord retirés avant l'envoi", async () => {
    await expect(ajouter("  Facturation  ")).resolves.toMatchObject({ ok: true, donnees: { nom: "Facturation" } });
    expect(simulation.rpcSession).toHaveBeenCalledWith("ajouter_categorie", { p_nom: "Facturation" });
  });

  it("« facturation » alors que Facturation est active : CONFLIT, message sous le champ, rien n'est écrit, refresh()", async () => {
    await ajouter("Facturation");
    refresh.mockClear();
    await expect(ajouter("facturation")).resolves.toEqual({
      ok: false,
      code: "CONFLIT",
      message: DEJA_PRIS,
      champs: { nom: DEJA_PRIS },
    });
    expect(noms()).toEqual([...NOMS_DEPART, "Facturation"]);
    // La liste recalculée montre la catégorie qui porte ce nom.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(simulation.journal()).toEqual([]);
  });

  it("nom d'une catégorie de départ, en majuscules : CONFLIT", async () => {
    await expect(ajouter("AUTRE")).resolves.toMatchObject({ code: "CONFLIT", champs: { nom: DEJA_PRIS } });
    expect(noms()).toEqual(NOMS_DEPART);
  });

  it("nom d'une catégorie désactivée : accepté (seules les actives comptent)", async () => {
    simulation.categories[4].active = false;
    await expect(ajouter("Autre")).resolves.toMatchObject({ ok: true, donnees: { nom: "Autre" } });
  });

  it.each([
    ["vide", "", OBLIGATOIRE],
    ["que des espaces", "   ", OBLIGATOIRE],
    ["absent", undefined, OBLIGATOIRE],
    ["pas un texte", 42, OBLIGATOIRE],
    ["51 caractères", "x".repeat(51), TROP_LONG],
  ])("nom %s : VALIDATION, message sous le champ, aucun appel à la base", async (_, nom, message) => {
    await expect(ajouter(nom)).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "1 champ est à corriger",
      champs: { nom: message },
    });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
    expect(noms()).toEqual(NOMS_DEPART);
  });

  it("50 caractères, accents et émojis comptés comme la base : accepté", async () => {
    const nom = `${"é".repeat(49)}🙂`;
    await expect(ajouter(nom)).resolves.toMatchObject({ ok: true, donnees: { nom } });
  });

  it("saisie qui n'est pas un objet : lue comme un formulaire vierge", async () => {
    await expect(actionAjouterCategorie(null)).resolves.toMatchObject({ code: "VALIDATION", champs: { nom: OBLIGATOIRE } });
  });
});

// ---------------------------------------------------------------------------
// Renommage
// ---------------------------------------------------------------------------

describe("renommage (administrateur)", () => {
  it("« Autre » → « Divers » : réponse, refresh(), rien au journal", async () => {
    await expect(renommer("Divers")).resolves.toEqual({
      ok: true,
      donnees: { id: AUTRE.id, nom: "Divers", change: true },
    });
    expect(simulation.rpcSession).toHaveBeenCalledWith("modifier_categorie", { p_categorie: AUTRE.id, p_nom: "Divers" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(simulation.journal()).toEqual([]);
    expect(noms()).toEqual([...NOMS_DEPART.slice(0, 4), "Divers"]);
  });

  it("le détail I4 et le filtre de I3 montrent le nouveau nom", async () => {
    const [demande] = fabriquerDemandes(1);
    simulation.demandes.push({ ...demande, categorie: "Autre" });
    await renommer("Divers");
    await expect(lireDemande(demande.reference)).resolves.toMatchObject({ categorie: "Divers" });
    const filtre = await lireCategoriesFiltre();
    expect(filtre.ok && filtre.donnees.find((c) => c.id === AUTRE.id)?.nom).toBe("Divers");
  });

  it("identifiant en majuscules : envoyé en minuscules", async () => {
    await renommer("Divers", AUTRE.id.toUpperCase());
    expect(simulation.rpcSession).toHaveBeenCalledWith("modifier_categorie", { p_categorie: AUTRE.id, p_nom: "Divers" });
  });

  it("espaces de bord retirés avant l'envoi", async () => {
    await expect(renommer("  Divers ")).resolves.toMatchObject({ ok: true, donnees: { nom: "Divers" } });
  });

  it("nom d'une autre catégorie active (sans tenir compte des majuscules) : CONFLIT, message sous le champ, rien n'est écrit, refresh()", async () => {
    await expect(renommer("problème TECHNIQUE")).resolves.toEqual({
      ok: false,
      code: "CONFLIT",
      message: DEJA_PRIS,
      champs: { nom: DEJA_PRIS },
    });
    expect(noms()).toEqual(NOMS_DEPART);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("même nom : rien n'est écrit, change faux, refresh() (la liste montre le nom réel)", async () => {
    await expect(renommer("Autre")).resolves.toEqual({ ok: true, donnees: { id: AUTRE.id, nom: "Autre", change: false } });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(noms()).toEqual(NOMS_DEPART);
  });

  it("seule la casse change (« autre ») : c'est un renommage, pas un doublon", async () => {
    await expect(renommer("autre")).resolves.toMatchObject({ ok: true, donnees: { nom: "autre", change: true } });
  });

  it("catégorie supprimée entre-temps (NV502) : INTROUVABLE et refresh()", async () => {
    await expect(renommer("Divers", "c0000000-0000-4000-8000-000000000099")).resolves.toEqual({
      ok: false,
      code: "INTROUVABLE",
      message: PANNE,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["vide", "", OBLIGATOIRE],
    ["que des espaces", "   ", OBLIGATOIRE],
    ["51 caractères", "x".repeat(51), TROP_LONG],
  ])("nom %s : VALIDATION, message sous le champ, aucun appel à la base", async (_, nom, message) => {
    await expect(renommer(nom)).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "1 champ est à corriger",
      champs: { nom: message },
    });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it.each([["pas un identifiant"], [undefined], [42]])("catégorie mal désignée (%s) : VALIDATION, aucun appel", async (id) => {
    await expect(actionRenommerCategorie({ categorieId: id, nom: "Divers" })).resolves.toMatchObject({
      ok: false,
      code: "VALIDATION",
      champs: { categorieId: PANNE },
    });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Droits, session, panne
// ---------------------------------------------------------------------------

describe.each([
  ["ajouter", "ajouter_categorie", () => ajouter("Facturation")],
  ["renommer", "modifier_categorie", () => renommer("Divers")],
] as const)("« %s » : droits, session et panne", (_, fonction, agir) => {
  it("collaborateur : ACCES_REFUSE, aucun appel à la base, refresh() (la page devient S1)", async () => {
    simulation.session.id = ID_KARIM;
    await expect(agir()).resolves.toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(noms()).toEqual(NOMS_DEPART);
  });

  it("rétrogradé entre la garde et la base (NV202) : ACCES_REFUSE et refresh()", async () => {
    simulation.pannesRpc[fonction] = { data: null, error: { code: "NV202", message: "Accès refusé" } };
    await expect(agir()).resolves.toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("sans session : renvoi vers /connexion, rien n'est écrit", async () => {
    simulation.session.id = null;
    await expect(agir()).rejects.toMatchObject(renvoiVers("/connexion"));
    expect(noms()).toEqual(NOMS_DEPART);
  });

  it.each([
    ["base injoignable", { data: null, error: { code: "57P01", message: "connexion perdue" } }],
    ["nom refusé par une contrainte", { data: null, error: { code: "23514", message: "contrainte" } }],
    ["réponse inattendue", { data: { resultat: "x" }, error: null }],
    ["réponse vide", { data: null, error: null }],
  ])("%s : ERREUR_INTERNE avec le message de l'écran et un code court, journalisé ; pas de refresh()", async (_, retour) => {
    simulation.pannesRpc[fonction] = retour as RetourRpc;
    const reponse = await agir();
    expect(reponse).toEqual({
      ok: false,
      code: "ERREUR_INTERNE",
      message: PANNE,
      codeSupport: expect.stringMatching(/^[0-9A-Z]{4,}$/),
    });
    expect(simulation.journal()).toEqual([
      { evenement: "erreur_inattendue", details: { type: "action", action: fonction } },
    ]);
    const journal = JSON.stringify(simulation.appels("ecrire_journal"));
    expect(journal).not.toMatch(/Facturation|Divers|connexion perdue/);
    expect(journal).toContain(reponse.ok ? "" : reponse.codeSupport!);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("réseau coupé (la promesse échoue) : ERREUR_INTERNE", async () => {
    simulation.rpcSession.mockImplementationOnce(() => ({
      abortSignal: () => Promise.reject(new TypeError("fetch failed")),
    }));
    await expect(agir()).resolves.toMatchObject({ ok: false, code: "ERREUR_INTERNE", message: PANNE });
  });
});

describe("le code (AD-2, AD-9)", () => {
  it.each([
    ["ajouter-categorie.ts", '.rpc("ajouter_categorie", { p_nom: validation.donnees.nom })'],
    [
      "renommer-categorie.ts",
      '.rpc("modifier_categorie", { p_categorie: validation.donnees.categorieId, p_nom: validation.donnees.nom })',
    ],
  ])("%s : passe par la fonction SQL avec la session, jamais par la table ni la clé secrète ; rien au journal", (fichier, appel) => {
    const source = readFileSync(join(process.cwd(), "src", "server", "actions", fichier), "utf8").replace(/\/\/.*$/gm, "");
    expect(source).toContain(appel);
    expect(source).toContain('from "@/lib/supabase/server"');
    expect(source).not.toMatch(/\.from\(|supabase-secret|creerClientSecret|@\/server\/admin|journaliser/);
  });
});

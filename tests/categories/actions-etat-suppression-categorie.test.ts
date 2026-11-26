import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Server Functions « Désactiver », « Réactiver » et « Supprimer » une
// catégorie (story 4.2 ; FR-26, RM-7, RM-11, AD-7, AD-9, AD-10, AD-11,
// AD-12), avec Supabase simulé : chaque ligne de la matrice de la story
// (désactiver, dernière active, réactiver, nom pris, supprimer, utilisée,
// déjà dans l'état voulu, introuvable, collaborateur, panne), la garde et
// le journal.

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
import { actionChangerEtatCategorie } from "@/server/actions/changer-etat-categorie";
import { actionRenommerCategorie } from "@/server/actions/renommer-categorie";
import { actionSupprimerCategorie } from "@/server/actions/supprimer-categorie";
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
const DERNIERE = "Impossible : au moins une catégorie doit rester active, sinon le formulaire serait inutilisable.";
const UTILISEE = "Impossible de supprimer une catégorie utilisée par des demandes. Vous pouvez la désactiver.";
const DEJA_PRIS = "Une catégorie active porte déjà ce nom.";
const PANNE = "La catégorie n'a pas pu être modifiée. Réessayez.";
const INCONNUE = "c0000000-0000-4000-8000-000000000099";

const changer = (active: unknown, categorieId: unknown = AUTRE.id) => actionChangerEtatCategorie({ categorieId, active });
const supprimer = (categorieId: unknown = AUTRE.id) => actionSupprimerCategorie({ categorieId });
const etats = () => simulation.categories.map((c) => [c.nom, c.active]);
const ETATS_DEPART = CATEGORIES_DEPART.map((c) => [c.nom, true]);

/** Ne laisse active que la catégorie `index`. */
function seuleActive(index: number) {
  simulation.categories.forEach((c, i) => (c.active = i === index));
}

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
});

// ---------------------------------------------------------------------------
// Désactiver, réactiver
// ---------------------------------------------------------------------------

describe("désactiver (administrateur)", () => {
  it("« Autre », utilisée : réponse, refresh(), rien au journal ; badge dans A2", async () => {
    const [demande] = fabriquerDemandes(1);
    simulation.demandes.push({ ...demande, categorie: "Autre" });

    await expect(changer(false)).resolves.toEqual({ ok: true, donnees: { id: AUTRE.id, active: false, change: true } });
    expect(simulation.rpcSession).toHaveBeenCalledWith("modifier_categorie", { p_categorie: AUTRE.id, p_active: false });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(simulation.journal()).toEqual([]);

    const lecture = await lireCategoriesAdministration();
    expect(lecture.ok && lecture.donnees.at(-1)).toEqual({ id: AUTRE.id, nom: "Autre", active: false, nombreDemandes: 1 });
  });

  it("elle disparaît de la saisie I5, le filtre de I3 la propose encore, le détail I4 la marque désactivée", async () => {
    const [demande] = fabriquerDemandes(1);
    simulation.demandes.push({ ...demande, categorie: "Autre" });
    await changer(false);

    const formulaire = await lireFormulaireSaisie();
    expect(formulaire.categories.map((c) => c.nom)).not.toContain("Autre");
    const filtre = await lireCategoriesFiltre();
    expect(filtre.ok && filtre.donnees.find((c) => c.id === AUTRE.id)).toMatchObject({ nom: "Autre", active: false });
    await expect(lireDemande(demande.reference)).resolves.toMatchObject({ categorie: "Autre", categorieActive: false });
  });

  it("identifiant en majuscules : envoyé en minuscules", async () => {
    await changer(false, AUTRE.id.toUpperCase());
    expect(simulation.rpcSession).toHaveBeenCalledWith("modifier_categorie", { p_categorie: AUTRE.id, p_active: false });
  });

  it("dernière catégorie active : CONFLIT avec le message exact, rien n'est écrit, refresh()", async () => {
    seuleActive(4);
    await expect(changer(false)).resolves.toEqual({ ok: false, code: "CONFLIT", message: DERNIERE });
    expect(simulation.categories[4].active).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(simulation.journal()).toEqual([]);
  });

  it("déjà désactivée (par un autre administrateur) : rien n'est écrit, change faux, refresh(), pas d'erreur", async () => {
    simulation.categories[4].active = false;
    await expect(changer(false)).resolves.toEqual({ ok: true, donnees: { id: AUTRE.id, active: false, change: false } });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("deux désactivations à la suite des deux dernières actives : la seconde est refusée", async () => {
    seuleActive(3);
    simulation.categories[4].active = true;
    await expect(changer(false, CATEGORIES_DEPART[3].id)).resolves.toMatchObject({ ok: true });
    await expect(changer(false)).resolves.toMatchObject({ ok: false, code: "CONFLIT", message: DERNIERE });
    expect(simulation.categories.filter((c) => c.active).map((c) => c.nom)).toEqual(["Autre"]);
  });
});

describe("réactiver (administrateur)", () => {
  it("catégorie désactivée : active, revient dans la saisie I5", async () => {
    simulation.categories[4].active = false;
    await expect(changer(true)).resolves.toEqual({ ok: true, donnees: { id: AUTRE.id, active: true, change: true } });
    expect(simulation.rpcSession).toHaveBeenCalledWith("modifier_categorie", { p_categorie: AUTRE.id, p_active: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    const formulaire = await lireFormulaireSaisie();
    expect(formulaire.categories.map((c) => c.nom)).toContain("Autre");
  });

  it("une catégorie active porte déjà le même nom : CONFLIT « Une catégorie active porte déjà ce nom. », rien n'est écrit", async () => {
    simulation.categories[4].active = false;
    await expect(actionAjouterCategorie({ nom: "autre" })).resolves.toMatchObject({ ok: true });
    refresh.mockClear();
    await expect(changer(true)).resolves.toEqual({ ok: false, code: "CONFLIT", message: DEJA_PRIS });
    expect(simulation.categories[4].active).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("déjà active : rien n'est écrit, change faux", async () => {
    await expect(changer(true)).resolves.toEqual({ ok: true, donnees: { id: AUTRE.id, active: true, change: false } });
    expect(etats()).toEqual(ETATS_DEPART);
  });
});

describe("désactiver, réactiver : erreurs", () => {
  it("catégorie supprimée entre-temps (NV502) : INTROUVABLE et refresh()", async () => {
    await expect(changer(false, INCONNUE)).resolves.toEqual({ ok: false, code: "INTROUVABLE", message: PANNE });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["identifiant mal formé", { categorieId: "pas un identifiant", active: false }, "categorieId"],
    ["identifiant absent", { active: false }, "categorieId"],
    ["état absent", { categorieId: AUTRE.id }, "active"],
    ["état qui n'est pas un booléen", { categorieId: AUTRE.id, active: "false" }, "active"],
  ])("%s : VALIDATION, aucun appel à la base", async (_, saisie, champ) => {
    await expect(actionChangerEtatCategorie(saisie)).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: PANNE,
      champs: { [champ]: PANNE },
    });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("saisie qui n'est pas un objet : VALIDATION, aucun appel", async () => {
    await expect(actionChangerEtatCategorie(null)).resolves.toMatchObject({ ok: false, code: "VALIDATION" });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Supprimer
// ---------------------------------------------------------------------------

describe("supprimer (administrateur)", () => {
  it("catégorie sans demande : supprimée, réponse, refresh(), rien au journal ; la ligne disparaît de A2", async () => {
    await expect(supprimer()).resolves.toEqual({ ok: true, donnees: { id: AUTRE.id, nom: "Autre" } });
    expect(simulation.rpcSession).toHaveBeenCalledWith("modifier_categorie", { p_categorie: AUTRE.id, p_supprimer: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(simulation.journal()).toEqual([]);
    const lecture = await lireCategoriesAdministration();
    expect(lecture.ok && lecture.donnees.map((c) => c.nom)).toEqual(CATEGORIES_DEPART.slice(0, 4).map((c) => c.nom));
  });

  it("catégorie désactivée sans demande : supprimée (le nombre d'actives ne change pas)", async () => {
    seuleActive(0);
    await expect(supprimer()).resolves.toMatchObject({ ok: true });
    expect(simulation.categories.map((c) => c.nom)).not.toContain("Autre");
  });

  it("une demande est arrivée entre l'affichage et la confirmation : CONFLIT avec le message exact, rien d'effacé, refresh()", async () => {
    const [demande] = fabriquerDemandes(1);
    simulation.demandes.push({ ...demande, categorie: "Autre" });
    await expect(supprimer()).resolves.toEqual({ ok: false, code: "CONFLIT", message: UTILISEE });
    expect(simulation.categories.map((c) => c.nom)).toContain("Autre");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("dernière catégorie active, jamais utilisée : CONFLIT avec le message exact, rien d'effacé", async () => {
    seuleActive(4);
    await expect(supprimer()).resolves.toEqual({ ok: false, code: "CONFLIT", message: DERNIERE });
    expect(simulation.categories).toHaveLength(5);
  });

  it("déjà supprimée (NV502) : INTROUVABLE et refresh()", async () => {
    await expect(supprimer(INCONNUE)).resolves.toEqual({ ok: false, code: "INTROUVABLE", message: PANNE });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([["pas un identifiant"], [undefined], [42]])("catégorie mal désignée (%s) : VALIDATION, aucun appel", async (id) => {
    await expect(actionSupprimerCategorie({ categorieId: id })).resolves.toMatchObject({
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
  ["désactiver", "changer_etat_categorie", () => changer(false)],
  ["réactiver", "changer_etat_categorie", () => changer(true)],
  ["supprimer", "supprimer_categorie", () => supprimer()],
] as const)("« %s » : droits, session et panne", (_, action, agir) => {
  it("collaborateur : ACCES_REFUSE, aucun appel à la base, refresh() (la page devient S1)", async () => {
    simulation.session.id = ID_KARIM;
    await expect(agir()).resolves.toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(etats()).toEqual(ETATS_DEPART);
  });

  it("rétrogradé entre la garde et la base (NV202) : ACCES_REFUSE et refresh()", async () => {
    simulation.pannesRpc.modifier_categorie = { data: null, error: { code: "NV202", message: "Accès refusé" } };
    await expect(agir()).resolves.toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("sans session : renvoi vers /connexion, rien n'est écrit", async () => {
    simulation.session.id = null;
    await expect(agir()).rejects.toMatchObject(renvoiVers("/connexion"));
    expect(etats()).toEqual(ETATS_DEPART);
  });

  it.each([
    ["base injoignable", { data: null, error: { code: "57P01", message: "connexion perdue" } }],
    ["paramètres refusés", { data: null, error: { code: "22004", message: "absent" } }],
    ["réponse inattendue", { data: { resultat: "x" }, error: null }],
    ["réponse vide", { data: null, error: null }],
  ])("%s : ERREUR_INTERNE avec le message de l'écran et un code court, journalisé ; pas de refresh()", async (_, retour) => {
    simulation.pannesRpc.modifier_categorie = retour as RetourRpc;
    const reponse = await agir();
    expect(reponse).toEqual({
      ok: false,
      code: "ERREUR_INTERNE",
      message: PANNE,
      codeSupport: expect.stringMatching(/^[0-9A-Z]{4,}$/),
    });
    expect(simulation.journal()).toEqual([{ evenement: "erreur_inattendue", details: { type: "action", action } }]);
    expect(JSON.stringify(simulation.appels("ecrire_journal"))).not.toMatch(/Autre|connexion perdue/);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("réseau coupé (la promesse échoue) : ERREUR_INTERNE", async () => {
    simulation.rpcSession.mockImplementationOnce(() => ({
      abortSignal: () => Promise.reject(new TypeError("fetch failed")),
    }));
    await expect(agir()).resolves.toMatchObject({ ok: false, code: "ERREUR_INTERNE", message: PANNE });
  });
});

describe("réponses d'une autre opération : refusées comme inattendues", () => {
  it("désactiver qui reçoit une suppression, supprimer qui reçoit un changement d'état : ERREUR_INTERNE", async () => {
    simulation.pannesRpc.modifier_categorie = {
      data: { id: AUTRE.id, nom: "Autre", active: false, change: true, supprimee: true },
      error: null,
    };
    await expect(changer(false)).resolves.toMatchObject({ code: "ERREUR_INTERNE" });
    simulation.pannesRpc.modifier_categorie = {
      data: { id: AUTRE.id, nom: "Autre", active: false, change: true, supprimee: false },
      error: null,
    };
    await expect(supprimer()).resolves.toMatchObject({ code: "ERREUR_INTERNE" });
  });
});

describe("le renommage (story 4.1) marche toujours avec la nouvelle fonction", () => {
  it("il n'envoie que p_categorie et p_nom : aucune autre opération", async () => {
    await expect(actionRenommerCategorie({ categorieId: AUTRE.id, nom: "Divers" })).resolves.toMatchObject({
      ok: true,
      donnees: { nom: "Divers", change: true },
    });
    expect(simulation.rpcSession).toHaveBeenCalledWith("modifier_categorie", { p_categorie: AUTRE.id, p_nom: "Divers" });
  });
});

describe("le code (AD-2, AD-9)", () => {
  it.each([
    [
      "changer-etat-categorie.ts",
      '.rpc("modifier_categorie", { p_categorie: validation.donnees.categorieId, p_active: validation.donnees.active })',
    ],
    ["supprimer-categorie.ts", '.rpc("modifier_categorie", { p_categorie: validation.donnees.categorieId, p_supprimer: true })'],
  ])("%s : passe par la fonction SQL avec la session, jamais par la table ni la clé secrète ; rien au journal", (fichier, appel) => {
    const source = readFileSync(join(process.cwd(), "src", "server", "actions", fichier), "utf8").replace(/\/\/.*$/gm, "");
    expect(source).toContain(appel);
    expect(source).toContain('from "@/lib/supabase/server"');
    expect(source).not.toMatch(/\.from\(|supabase-secret|creerClientSecret|@\/server\/admin|journaliser/);
  });
});

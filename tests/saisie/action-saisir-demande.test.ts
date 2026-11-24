import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Server Function « saisir une demande » (story 2.3 ; FR-30, RM-12, AD-2,
// AD-7, AD-11, AD-12, AD-13, AD-20), avec Supabase simulé : chaque ligne de
// la matrice de la story (saisie complète, case oubliée, canal oublié ou
// interdit, champs de P1, double envoi, catégorie désactivée, panne), la
// garde, l'auteur de l'historique, le filtre par canal et le journal.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `refresh()` n'a de sens que pendant une vraie Server Function de Next.js.
vi.mock("next/cache", () => ({ refresh }));

import { actionSaisirDemande } from "@/server/actions/saisir-demande";
import { lireDemande } from "@/server/lectures/demande";
import { compterATraiter, lireListeDemandes } from "@/server/lectures/demandes";
import { MESSAGES_DEPOT, MESSAGES_SAISIE } from "@/shared/messages";

import { NUMERO_ENVOI } from "../aides/formulaire-depot";
import { fabriquerDemandes, ID_KARIM, ID_PROBLEME_TECHNIQUE } from "../aides/supabase-connexion";

/** Ce que Karim saisit pendant l'appel (EXPERIENCE.md, Flux 4). */
const SAISIE = {
  canal: "telephone",
  nom: "Hélène Durand",
  email: "helene.durand@exemple.fr",
  telephone: " 06 12 34 56 78 ",
  entreprise: "",
  categorieId: ID_PROBLEME_TECHNIQUE,
  objet: "Production à l'arrêt",
  description: "La machine de conditionnement ne démarre plus depuis ce matin.",
  personneInformee: true,
};

const saisir = (modifications: Record<string, unknown> = {}, numero: unknown = NUMERO_ENVOI) =>
  actionSaisirDemande({ ...SAISIE, ...modifications }, numero);

const refus = (champs: Record<string, string>) => ({
  ok: false,
  code: "VALIDATION",
  message: Object.keys(champs).length === 1 ? "1 champ est à corriger" : `${Object.keys(champs).length} champs sont à corriger`,
  champs,
});

beforeEach(() => {
  simulation.reinitialiser();
  simulation.session.id = ID_KARIM;
  simulation.demandes.push(...fabriquerDemandes(42, 5));
  refresh.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("saisie complète", () => {
  it("créée : référence suivante, appel de saisir_demande avec la session, page recalculée", async () => {
    await expect(saisir()).resolves.toEqual({ ok: true, donnees: { reference: "NOVA-2026-0043" } });
    expect(simulation.rpcSession).toHaveBeenCalledWith("saisir_demande", {
      p_canal: "telephone",
      p_nom: "Hélène Durand",
      p_email: "helene.durand@exemple.fr",
      p_telephone: "06 12 34 56 78",
      p_entreprise: null,
      p_categorie_id: ID_PROBLEME_TECHNIQUE,
      p_objet: "Production à l'arrêt",
      p_description: "La machine de conditionnement ne démarre plus depuis ce matin.",
      p_personne_informee: true,
      p_numero_envoi: NUMERO_ENVOI,
    });
    // Jamais la clé secrète (AD-9).
    expect(simulation.creerClientSecret).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("le détail : canal Téléphone, Nouvelle, historique « Demande créée » au nom de Karim", async () => {
    await saisir();
    const demande = await lireDemande("NOVA-2026-0043");
    expect(demande).toMatchObject({ canal: "telephone", statut: "nouvelle", telephone: "06 12 34 56 78", entreprise: null });
    expect(demande?.evenements).toEqual([
      { type: "creation", auteur: { interne: true, nom: "Karim Benali" }, date: "2026-11-20T09:00:00.000Z" },
    ]);
  });

  it("canal Email accepté", async () => {
    await expect(saisir({ canal: "email" })).resolves.toMatchObject({ ok: true });
    expect((await lireDemande("NOVA-2026-0043"))?.canal).toBe("email");
  });

  it("la liste filtrée sur le canal Téléphone la montre ; le compteur « à traiter » monte de 1", async () => {
    const avant = await compterATraiter();
    await saisir();
    const liste = await lireListeDemandes(1, "", { canal: "telephone" });
    expect(liste).toMatchObject({ ok: true, donnees: { total: 1 } });
    expect(liste.ok && liste.donnees.demandes.map((d) => d.reference)).toEqual(["NOVA-2026-0043"]);
    const apres = await compterATraiter();
    expect(apres.ok && avant.ok && apres.donnees - avant.donnees).toBe(1);
  });

  it("numéro d'envoi en majuscules : envoyé en minuscules", async () => {
    await saisir({}, NUMERO_ENVOI.toUpperCase());
    expect(simulation.rpcSession).toHaveBeenCalledWith(
      "saisir_demande",
      expect.objectContaining({ p_numero_envoi: NUMERO_ENVOI }),
    );
  });
});

describe("double envoi (AD-20)", () => {
  it("même numéro d'envoi : la demande déjà créée, aucune seconde", async () => {
    const premier = await saisir();
    const second = await saisir({ objet: "Autre objet" });
    expect(second).toEqual(premier);
    expect(simulation.demandes).toHaveLength(43);
  });

  it("autre numéro : une autre demande", async () => {
    await saisir();
    await expect(saisir({}, "7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d")).resolves.toEqual({
      ok: true,
      donnees: { reference: "NOVA-2026-0044" },
    });
  });
});

describe("refus prévus : rien n'est créé, réponse VALIDATION avec les champs", () => {
  it("case oubliée : message sous la case, sans appel à la base", async () => {
    await expect(saisir({ personneInformee: false })).resolves.toEqual(
      refus({ personneInformee: MESSAGES_SAISIE.caseObligatoire }),
    );
    expect(simulation.rpcSession).not.toHaveBeenCalledWith("saisir_demande", expect.anything());
    expect(simulation.demandes).toHaveLength(42);
  });

  it("canal oublié : « Le canal est obligatoire »", async () => {
    await expect(saisir({ canal: "" })).resolves.toEqual(refus({ canal: "Le canal est obligatoire" }));
    expect(simulation.rpcSession).not.toHaveBeenCalledWith("saisir_demande", expect.anything());
  });

  it.each(["formulaire", "fax"])("canal interdit (%s), appel direct : refusé", async (canal) => {
    await expect(saisir({ canal })).resolves.toEqual(refus({ canal: MESSAGES_SAISIE.canalInconnu }));
    expect(simulation.rpcSession).not.toHaveBeenCalledWith("saisir_demande", expect.anything());
    expect(simulation.demandes).toHaveLength(42);
  });

  it("champs de P1 : mêmes messages qu'en P1, tous à la fois", async () => {
    await expect(saisir({ nom: "", email: "helene", description: "Court" })).resolves.toEqual(
      refus({
        nom: MESSAGES_DEPOT.nomObligatoire,
        email: MESSAGES_DEPOT.emailForme,
        description: MESSAGES_DEPOT.descriptionTropCourte,
      }),
    );
  });

  it("catégorie désactivée entre-temps : refus de la base (NV002), message de P1", async () => {
    simulation.categories.find((c) => c.id === ID_PROBLEME_TECHNIQUE)!.active = false;
    await expect(saisir()).resolves.toEqual(refus({ categorieId: MESSAGES_DEPOT.categorieIndisponible }));
    expect(simulation.demandes).toHaveLength(42);
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    ["NV001", { personneInformee: MESSAGES_SAISIE.caseObligatoire }],
    ["NV401", { canal: MESSAGES_SAISIE.canalInconnu }],
  ])("la base refuse (%s) : traduit en erreur de saisie", async (code, champs) => {
    simulation.pannesRpc.saisir_demande = { data: null, error: { code, message: "refus" } };
    await expect(saisir()).resolves.toEqual(refus(champs));
  });

  it.each([undefined, "", "pas-un-uuid"])("numéro d'envoi absent ou mal formé (%s) : VALIDATION sans champ", async (numero) => {
    await expect(actionSaisirDemande(SAISIE, numero)).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: MESSAGES_SAISIE.formulaireIncomplet,
    });
    expect(simulation.rpcSession).not.toHaveBeenCalledWith("saisir_demande", expect.anything());
  });

  it("pas de limite d'envois : dix saisies de suite passent", async () => {
    for (let i = 0; i < 10; i += 1) {
      const numero = `7a2b3c4d-5e6f-4a7b-8c9d-${String(i).padStart(12, "0")}`;
      await expect(saisir({}, numero)).resolves.toMatchObject({ ok: true });
    }
    expect(simulation.demandes).toHaveLength(52);
  });
});

describe("panne", () => {
  it("base injoignable : ERREUR_INTERNE avec un code, journalisée sans donnée saisie", async () => {
    simulation.pannesRpc.saisir_demande = { data: null, error: { code: "57P01", message: "x" } };
    const reponse = await saisir();
    expect(reponse).toMatchObject({ ok: false, code: "ERREUR_INTERNE", codeSupport: expect.any(String) });
    expect(simulation.journal()).toEqual([
      { evenement: "erreur_inattendue", details: { type: "action", action: "saisir_demande" } },
    ]);
    const ecrit = JSON.stringify(simulation.appels("ecrire_journal"));
    for (const valeur of ["Hélène", "helene", "Production", "06 12"]) expect(ecrit).not.toContain(valeur);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("réponse inattendue (pas de référence) : ERREUR_INTERNE", async () => {
    simulation.pannesRpc.saisir_demande = { data: [{ reference: "abc" }], error: null };
    await expect(saisir()).resolves.toMatchObject({ ok: false, code: "ERREUR_INTERNE" });
  });
});

describe("garde (AD-7)", () => {
  it("sans session : renvoi vers /connexion, rien n'est appelé", async () => {
    simulation.session.id = null;
    await expect(saisir()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("compte désactivé : renvoi vers /connexion", async () => {
    simulation.profils.get(ID_KARIM)!.actif = false;
    await expect(saisir()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
  });
});

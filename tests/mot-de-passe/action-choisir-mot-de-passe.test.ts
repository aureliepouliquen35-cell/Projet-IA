import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Choix du mot de passe (story 1.7 ; FR-21, AD-6, AD-7, AD-12), avec
// Supabase simulé : matrice de la story (connexion d'un compte à mot de
// passe temporaire, autres pages pendant le changement, trop court,
// différents, temporaire réutilisé, valide, `same_password` après une panne,
// panne) et garde de l'écran I2.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `connection()` n'a de sens que pendant une vraie requête Next.js.
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));

import { actionChoisirMotDePasse } from "@/server/actions/choisir-mot-de-passe";
import { actionSeConnecter } from "@/server/actions/se-connecter";
import { exigerChangementMotDePasse, exigerUtilisateur, lireUtilisateur } from "@/server/garde";
import { activiteValide, COOKIE_ACTIVITE } from "@/server/garde/activite";
import { COOKIE_MESSAGE_CONNEXION } from "@/server/passage";
import { ContenuDemandes } from "@/app/(interne)/demandes/contenu-demandes";

import { EMAIL_KARIM, ID_KARIM } from "../aides/supabase-connexion";

const TEMPORAIRE = "Temporaire-2026-abc";
const NOUVEAU = "Mon nouveau mot de passe 2026";

/** Karim vient d'être créé : mot de passe temporaire, drapeau vrai. */
function compteACreer() {
  simulation.comptes.set(EMAIL_KARIM, { motDePasse: TEMPORAIRE, id: ID_KARIM });
  simulation.temporaires.set(ID_KARIM, TEMPORAIRE);
  simulation.profils.get(ID_KARIM)!.doit_changer_mdp = true;
}

async function leve(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (erreur) {
    return erreur;
  }
  return null;
}

const renvoiVers = (chemin: string) => ({
  digest: expect.stringMatching(new RegExp(`^NEXT_REDIRECT;\\w+;${chemin.replace(/\//g, "\\/")};`)),
});

const choisir = (motDePasse: string, confirmation = motDePasse) =>
  actionChoisirMotDePasse({ motDePasse, confirmation });

beforeEach(() => {
  simulation.reinitialiser();
  compteACreer();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("connexion d'un compte qui doit changer son mot de passe", () => {
  it("bons identifiants : arrivée directe sur I2, session ouverte", async () => {
    const erreur = await leve(() => actionSeConnecter({ email: EMAIL_KARIM, motDePasse: TEMPORAIRE }));
    expect(erreur).toMatchObject(renvoiVers("/connexion/nouveau-mot-de-passe"));
    expect(simulation.session.id).toBe(ID_KARIM);
    expect(simulation.journal()).toEqual([
      { evenement: "connexion_reussie", details: { email: EMAIL_KARIM, compte_id: ID_KARIM } },
    ]);
  });

  it("pose le cookie d'activité et efface le message « session expirée »", async () => {
    await leve(() => actionSeConnecter({ email: EMAIL_KARIM, motDePasse: TEMPORAIRE }));
    const activite = simulation.cookiesPoses.get(COOKIE_ACTIVITE);
    expect(activiteValide(activite?.valeur)).toBe(true);
    expect(activite?.options).toMatchObject({ httpOnly: true, path: "/", sameSite: "lax" });
    expect(simulation.cookiesPoses.get(COOKIE_MESSAGE_CONNEXION)).toMatchObject({
      valeur: "",
      options: { path: "/connexion", maxAge: 0 },
    });
  });

  it("compte au mot de passe déjà choisi : « Demandes », cookie d'activité posé", async () => {
    simulation.profils.get(ID_KARIM)!.doit_changer_mdp = false;
    const erreur = await leve(() => actionSeConnecter({ email: EMAIL_KARIM, motDePasse: TEMPORAIRE }));
    expect(erreur).toMatchObject(renvoiVers("/demandes"));
    expect(activiteValide(simulation.cookiesPoses.get(COOKIE_ACTIVITE)?.valeur)).toBe(true);
  });

  it("cookie d'activité impossible à poser (secret absent) : session refermée, panne", async () => {
    vi.stubEnv("SECRET_COOKIES", "");
    const reponse = await actionSeConnecter({ email: EMAIL_KARIM, motDePasse: TEMPORAIRE });
    expect(reponse).toMatchObject({ ok: false, code: "ERREUR_INTERNE" });
    expect(simulation.session.id).toBeNull();
  });
});

describe("garde pendant le changement (AD-7)", () => {
  beforeEach(() => {
    simulation.session.id = ID_KARIM;
  });

  it("lireUtilisateur dit que le mot de passe doit être changé", async () => {
    await expect(lireUtilisateur()).resolves.toMatchObject({ id: ID_KARIM, doitChangerMdp: true });
  });

  it("exigerUtilisateur (page interne, Server Function) : renvoi vers I2", async () => {
    expect(await leve(exigerUtilisateur)).toMatchObject(renvoiVers("/connexion/nouveau-mot-de-passe"));
  });

  it("/demandes : rien n'est affiché, renvoi vers I2", async () => {
    expect(await leve(() => ContenuDemandes({ searchParams: Promise.resolve({}) }))).toMatchObject(renvoiVers("/connexion/nouveau-mot-de-passe"));
  });

  it("exigerChangementMotDePasse : la personne", async () => {
    await expect(exigerChangementMotDePasse()).resolves.toMatchObject({ id: ID_KARIM });
  });

  it("I2 sans changement à faire : renvoi vers /demandes", async () => {
    simulation.profils.get(ID_KARIM)!.doit_changer_mdp = false;
    expect(await leve(exigerChangementMotDePasse)).toMatchObject(renvoiVers("/demandes"));
  });

  it.each([
    ["sans session", () => {
      simulation.session.id = null;
    }],
    ["compte inactif", () => {
      simulation.profils.get(ID_KARIM)!.actif = false;
    }],
  ])("I2 %s : renvoi vers /connexion", async (_, preparer) => {
    preparer();
    expect(await leve(exigerChangementMotDePasse)).toMatchObject(renvoiVers("/connexion"));
  });

  it("drapeau illisible : erreur (écran S3)", async () => {
    (simulation.profils.get(ID_KARIM) as unknown as Record<string, unknown>).doit_changer_mdp = null;
    await expect(lireUtilisateur()).rejects.toThrow(/mot de passe/);
  });
});

describe("actionChoisirMotDePasse", () => {
  beforeEach(() => {
    simulation.session.id = ID_KARIM;
  });

  it("valide : Auth modifié, drapeau faux, empreinte effacée, succès", async () => {
    await expect(choisir(NOUVEAU)).resolves.toEqual({ ok: true, donnees: null });
    expect(simulation.updateUser).toHaveBeenCalledWith({ password: NOUVEAU });
    expect(simulation.comptes.get(EMAIL_KARIM)?.motDePasse).toBe(NOUVEAU);
    expect(simulation.profils.get(ID_KARIM)?.doit_changer_mdp).toBe(false);
    expect(simulation.temporaires.has(ID_KARIM)).toBe(false);
    expect(simulation.appels("terminer_changement_mdp")).toEqual([{ p_id: ID_KARIM, p_mdp: NOUVEAU }]);
  });

  it("compare d'abord au temporaire (empreinte en base), avant Auth", async () => {
    await choisir(NOUVEAU);
    expect(simulation.appels("est_mot_de_passe_temporaire")).toEqual([{ p_id: ID_KARIM, p_mdp: NOUVEAU }]);
    const ordreComparaison = simulation.rpc.mock.invocationCallOrder[
      simulation.rpc.mock.calls.findIndex(([nom]) => nom === "est_mot_de_passe_temporaire")
    ];
    const ordreFin = simulation.rpc.mock.invocationCallOrder[
      simulation.rpc.mock.calls.findIndex(([nom]) => nom === "terminer_changement_mdp")
    ];
    expect(ordreComparaison).toBeLessThan(simulation.updateUser.mock.invocationCallOrder[0]);
    expect(simulation.updateUser.mock.invocationCallOrder[0]).toBeLessThan(ordreFin);
  });

  it("aucun nouvel événement au journal, jamais de mot de passe", async () => {
    await choisir(NOUVEAU);
    expect(simulation.journal()).toEqual([]);
    expect(JSON.stringify(simulation.journal())).not.toContain(NOUVEAU);
  });

  it("puis reconnexion avec le nouveau mot de passe : « Demandes », sans repasser par I2", async () => {
    await choisir(NOUVEAU);
    simulation.session.id = null;
    expect(await leve(() => actionSeConnecter({ email: EMAIL_KARIM, motDePasse: NOUVEAU }))).toMatchObject(
      renvoiVers("/demandes"),
    );
    await expect(exigerUtilisateur()).resolves.toMatchObject({ id: ID_KARIM, doitChangerMdp: false });
  });

  it("temporaire réutilisé : message sous le 1er champ, Auth non modifié, rien ne change", async () => {
    await expect(choisir(TEMPORAIRE)).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "1 champ est à corriger",
      champs: { motDePasse: "Choisissez un mot de passe différent du mot de passe temporaire" },
    });
    expect(simulation.updateUser).not.toHaveBeenCalled();
    expect(simulation.appels("terminer_changement_mdp")).toEqual([]);
    expect(simulation.profils.get(ID_KARIM)?.doit_changer_mdp).toBe(true);
    // Le temporaire fonctionne toujours.
    simulation.session.id = null;
    expect(await leve(() => actionSeConnecter({ email: EMAIL_KARIM, motDePasse: TEMPORAIRE }))).toMatchObject(
      renvoiVers("/connexion/nouveau-mot-de-passe"),
    );
  });

  it.each([
    [{ motDePasse: "court", confirmation: "court" }, { motDePasse: "12 caractères minimum" }],
    [{ motDePasse: NOUVEAU, confirmation: `${NOUVEAU}?` }, { confirmation: "Les deux mots de passe ne sont pas identiques" }],
    [{}, { motDePasse: "12 caractères minimum", confirmation: "Les deux mots de passe ne sont pas identiques" }],
  ])("%o : VALIDATION, rien n'est appelé", async (saisie, champs) => {
    await expect(actionChoisirMotDePasse(saisie)).resolves.toMatchObject({ ok: false, code: "VALIDATION", champs });
    expect(simulation.updateUser).not.toHaveBeenCalled();
    expect(simulation.rpc).not.toHaveBeenCalled();
  });

  it("déjà changé dans Auth, drapeau resté vrai (panne précédente) : same_password traité comme fait", async () => {
    simulation.pannesRpc.terminer_changement_mdp = { data: null, error: { code: "PGRST000", message: "panne" } };
    await expect(choisir(NOUVEAU)).resolves.toMatchObject({ ok: false, code: "ERREUR_INTERNE" });
    expect(simulation.comptes.get(EMAIL_KARIM)?.motDePasse).toBe(NOUVEAU);
    expect(simulation.profils.get(ID_KARIM)?.doit_changer_mdp).toBe(true);

    delete simulation.pannesRpc.terminer_changement_mdp;
    await expect(choisir(NOUVEAU)).resolves.toEqual({ ok: true, donnees: null });
    expect(simulation.updateUser).toHaveLastResolvedWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "same_password" }) }),
    );
    expect(simulation.profils.get(ID_KARIM)?.doit_changer_mdp).toBe(false);
    expect(simulation.temporaires.has(ID_KARIM)).toBe(false);
  });

  it("temporaire remis entre-temps (NV106 renvoyé par la base) : même message que le temporaire", async () => {
    simulation.pannesRpc.terminer_changement_mdp = { data: null, error: { code: "NV106", message: "temporaire" } };
    await expect(choisir(NOUVEAU)).resolves.toMatchObject({
      ok: false,
      code: "VALIDATION",
      champs: { motDePasse: "Choisissez un mot de passe différent du mot de passe temporaire" },
    });
  });

  describe("panne", () => {
    it.each([
      ["base injoignable (comparaison)", () => {
        simulation.pannesRpc.est_mot_de_passe_temporaire = { data: null, error: { code: "PGRST000", message: "panne" } };
      }],
      ["Auth injoignable", () => {
        simulation.updateUser.mockResolvedValueOnce({
          data: { user: null },
          error: { message: "fetch failed", status: 0 },
        } as never);
      }],
      ["Auth refuse (weak_password)", () => {
        simulation.updateUser.mockResolvedValueOnce({
          data: { user: null },
          error: { code: "weak_password", message: "weak", status: 422 },
        } as never);
      }],
      ["base injoignable (fin du changement)", () => {
        simulation.pannesRpc.terminer_changement_mdp = { data: null, error: { code: "PGRST000", message: "panne" } };
      }],
    ])("%s : ERREUR_INTERNE journalisée, drapeau inchangé", async (_, preparer) => {
      preparer();
      await expect(choisir(NOUVEAU)).resolves.toMatchObject({
        ok: false,
        code: "ERREUR_INTERNE",
        codeSupport: expect.any(String),
      });
      expect(simulation.profils.get(ID_KARIM)?.doit_changer_mdp).toBe(true);
      expect(simulation.journal()).toEqual([
        { evenement: "erreur_inattendue", details: { type: "action", action: "choisir_mot_de_passe" } },
      ]);
      expect(JSON.stringify(simulation.rpc.mock.calls.filter(([nom]) => nom === "ecrire_journal"))).not.toContain(NOUVEAU);
    });
  });

  describe("garde de la Server Function", () => {
    it("sans session (session expirée) : renvoi vers /connexion, rien n'est appelé", async () => {
      simulation.session.id = null;
      expect(await leve(() => choisir(NOUVEAU))).toMatchObject(renvoiVers("/connexion"));
      expect(simulation.updateUser).not.toHaveBeenCalled();
      expect(simulation.rpc).not.toHaveBeenCalled();
    });

    it("mot de passe déjà choisi : renvoi vers /demandes, rien n'est appelé", async () => {
      simulation.profils.get(ID_KARIM)!.doit_changer_mdp = false;
      expect(await leve(() => choisir(NOUVEAU))).toMatchObject(renvoiVers("/demandes"));
      expect(simulation.updateUser).not.toHaveBeenCalled();
    });

    it("garde avant la validation : une saisie vide sans session renvoie aussi vers /connexion", async () => {
      simulation.session.id = null;
      expect(await leve(() => actionChoisirMotDePasse({}))).toMatchObject(renvoiVers("/connexion"));
    });
  });
});

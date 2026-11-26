import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// « Réinitialiser le mot de passe » de l'écran A1 (story 3.5 ; FR-23, RM-7,
// AD-6, AD-7, AD-12, AD-13) : la Server Function
// `actionReinitialiserMotDePasse` et `reinitialiserMotDePasse` de
// `src/server/admin`, avec Supabase simulé (session, profils,
// `reinitialiser_mdp`, mot de passe dans Auth). Aucun vrai compte n'est
// réinitialisé.
//
// Matrice de la story : réinitialiser, ancien mot de passe, nouveau
// temporaire (I2, temporaire refusé), collègue déjà connecté, trop court,
// soi-même, compte désactivé, panne (base ou Auth), collaborateur.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `connection()` n'a de sens que pendant une vraie requête Next.js.
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/cache", () => ({ refresh }));

import { actionChoisirMotDePasse } from "@/server/actions/choisir-mot-de-passe";
import { actionReinitialiserMotDePasse } from "@/server/actions/reinitialiser-mot-de-passe";
import { actionSeConnecter } from "@/server/actions/se-connecter";
import { reinitialiserMotDePasse } from "@/server/admin";
import { exigerUtilisateur } from "@/server/garde";
import { MESSAGES_COMPTE } from "@/shared/messages";

import {
  EMAIL_KARIM,
  EMAIL_SOPHIE,
  ID_KARIM,
  ID_SOPHIE,
  MOT_DE_PASSE_KARIM,
  PROFIL_SOPHIE,
} from "../aides/supabase-connexion";

const TEMPORAIRE = "Kp7mWq2xTz9aBc4d";
const MOT_DE_PASSE_SOPHIE = "Le mot de passe de Sophie 2026";
const PANNE = "Le mot de passe n'a pas pu être réinitialisé. Réessayez.";

const reinitialiser = (compteId: string, motDePasseTemporaire = TEMPORAIRE) =>
  actionReinitialiserMotDePasse({ compteId, motDePasseTemporaire });

const evenements = () => simulation.journal().map((ligne) => ligne.evenement);

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

beforeEach(() => {
  simulation.reinitialiser();
  simulation.profils.set(ID_SOPHIE, { ...PROFIL_SOPHIE });
  simulation.comptes.set(EMAIL_SOPHIE, { motDePasse: MOT_DE_PASSE_SOPHIE, id: ID_SOPHIE });
  // Sophie, administratrice, est connectée.
  simulation.session.id = ID_SOPHIE;
  refresh.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("réinitialiser", () => {
  it("réponse : identifiant, nom, email ; jamais le mot de passe", async () => {
    const reponse = await reinitialiser(ID_KARIM);
    expect(reponse).toEqual({ ok: true, donnees: { id: ID_KARIM, nom: "Karim Benali", email: EMAIL_KARIM } });
    expect(JSON.stringify(reponse)).not.toContain(TEMPORAIRE);
  });

  it("la base d'abord (reinitialiser_mdp, avec l'administratrice comme auteur), puis le mot de passe dans Auth", async () => {
    await reinitialiser(ID_KARIM);
    expect(simulation.appels("reinitialiser_mdp")).toEqual([
      { p_auteur: ID_SOPHIE, p_compte: ID_KARIM, p_mdp_temporaire: TEMPORAIRE },
    ]);
    expect(simulation.updateUserById).toHaveBeenCalledExactlyOnceWith(ID_KARIM, { password: TEMPORAIRE });
    const ordreBase = simulation.rpc.mock.invocationCallOrder[
      simulation.rpc.mock.calls.findIndex(([nom]) => nom === "reinitialiser_mdp")
    ];
    expect(ordreBase).toBeLessThan(simulation.updateUserById.mock.invocationCallOrder[0]);
  });

  it("« doit changer son mot de passe », nouveau temporaire enregistré, mot de passe Auth remplacé", async () => {
    await reinitialiser(ID_KARIM);
    expect(simulation.profils.get(ID_KARIM)).toMatchObject({ doit_changer_mdp: true, actif: true });
    expect(simulation.temporaires.get(ID_KARIM)).toBe(TEMPORAIRE);
    expect(simulation.comptes.get(EMAIL_KARIM)!.motDePasse).toBe(TEMPORAIRE);
  });

  it("mot_de_passe_reinitialise au journal : compte, email, auteur ; jamais le mot de passe", async () => {
    await reinitialiser(ID_KARIM);
    expect(simulation.journal()).toEqual([
      { evenement: "mot_de_passe_reinitialise", details: { compte_id: ID_KARIM, email: EMAIL_KARIM, auteur: ID_SOPHIE } },
    ]);
    expect(JSON.stringify(simulation.appels("ecrire_journal"))).not.toContain(TEMPORAIRE);
  });

  it("pas de refresh : le tableau ne change pas, la fenêtre reste ouverte", async () => {
    await reinitialiser(ID_KARIM);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("identifiant en majuscules : ramené en minuscules, comme dans la base", async () => {
    await expect(reinitialiser(ID_KARIM.toUpperCase())).resolves.toMatchObject({ ok: true });
    expect(simulation.appels("reinitialiser_mdp")[0]).toMatchObject({ p_compte: ID_KARIM });
  });

  it("mot de passe gardé tel quel (espaces compris, jamais nettoyé)", async () => {
    await reinitialiser(ID_KARIM, "  avec espaces  ");
    expect(simulation.updateUserById).toHaveBeenCalledWith(ID_KARIM, { password: "  avec espaces  " });
  });

  it("Auth répond « même mot de passe » : déjà en place, réussite", async () => {
    simulation.updateUserById.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "same_password", message: "same", status: 422 },
    } as never);
    await expect(reinitialiser(ID_KARIM)).resolves.toMatchObject({ ok: true });
    expect(evenements()).toEqual(["mot_de_passe_reinitialise"]);
  });
});

describe("après la réinitialisation, côté collègue", () => {
  beforeEach(async () => {
    await reinitialiser(ID_KARIM);
    simulation.session.id = null;
  });

  it("ancien mot de passe : « Identifiants incorrects »", async () => {
    await expect(actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM })).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "Identifiants incorrects",
    });
  });

  it("nouveau temporaire : I2 avant toute autre page", async () => {
    expect(await leve(() => actionSeConnecter({ email: EMAIL_KARIM, motDePasse: TEMPORAIRE }))).toMatchObject(
      renvoiVers("/connexion/nouveau-mot-de-passe"),
    );
    expect(await leve(exigerUtilisateur)).toMatchObject(renvoiVers("/connexion/nouveau-mot-de-passe"));
  });

  it("sur I2, le temporaire est refusé ; un autre mot de passe est accepté et l'empreinte effacée", async () => {
    await leve(() => actionSeConnecter({ email: EMAIL_KARIM, motDePasse: TEMPORAIRE }));
    await expect(
      actionChoisirMotDePasse({ motDePasse: TEMPORAIRE, confirmation: TEMPORAIRE }),
    ).resolves.toMatchObject({ ok: false });
    expect(simulation.profils.get(ID_KARIM)!.doit_changer_mdp).toBe(true);

    const nouveau = "Mon mot de passe définitif 2026";
    await leve(() => actionChoisirMotDePasse({ motDePasse: nouveau, confirmation: nouveau }));
    expect(simulation.profils.get(ID_KARIM)!.doit_changer_mdp).toBe(false);
    expect(simulation.temporaires.has(ID_KARIM)).toBe(false);
  });
});

describe("collègue déjà connecté pendant la réinitialisation", () => {
  it("à sa prochaine page : renvoi vers I2", async () => {
    await reinitialiser(ID_KARIM);
    simulation.session.id = ID_KARIM;
    expect(await leve(exigerUtilisateur)).toMatchObject(renvoiVers("/connexion/nouveau-mot-de-passe"));
  });
});

describe("soi-même", () => {
  it("réussite, réponse sans mot de passe, session gardée ; à sa prochaine page, I2", async () => {
    await expect(reinitialiser(ID_SOPHIE)).resolves.toEqual({
      ok: true,
      donnees: { id: ID_SOPHIE, nom: "Sophie Martin", email: EMAIL_SOPHIE },
    });
    expect(simulation.session.id).toBe(ID_SOPHIE);
    expect(simulation.signOut).not.toHaveBeenCalled();
    expect(await leve(exigerUtilisateur)).toMatchObject(renvoiVers("/connexion/nouveau-mot-de-passe"));
  });
});

describe("compte désactivé", () => {
  it("réinitialisation permise ; le compte reste désactivé et bloqué", async () => {
    simulation.profils.get(ID_KARIM)!.actif = false;
    simulation.bannis.add(ID_KARIM);
    await expect(reinitialiser(ID_KARIM)).resolves.toMatchObject({ ok: true });
    expect(simulation.profils.get(ID_KARIM)).toMatchObject({ actif: false, doit_changer_mdp: true });
    expect(simulation.updateUserById).toHaveBeenCalledExactlyOnceWith(ID_KARIM, { password: TEMPORAIRE });
    expect(simulation.bannis.has(ID_KARIM)).toBe(true);
    simulation.session.id = null;
    await expect(actionSeConnecter({ email: EMAIL_KARIM, motDePasse: TEMPORAIRE })).resolves.toMatchObject({
      message: "Identifiants incorrects",
    });
  });
});

describe("trop court", () => {
  it.each(["", "court", "onze caract"])("« %s » : « 12 caractères minimum » sous le champ, aucun appel", async (motDePasse) => {
    await expect(reinitialiser(ID_KARIM, motDePasse)).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "1 champ est à corriger",
      champs: { motDePasseTemporaire: "12 caractères minimum" },
    });
    expect(simulation.creerClientSecret).not.toHaveBeenCalled();
    expect(simulation.updateUserById).not.toHaveBeenCalled();
  });

  it("refus de la base (NV205) : même message, Auth non touché", async () => {
    simulation.pannesRpc.reinitialiser_mdp = { data: null, error: { code: "NV205", message: "trop court" } };
    await expect(reinitialiser(ID_KARIM)).resolves.toMatchObject({
      code: "VALIDATION",
      champs: { motDePasseTemporaire: MESSAGES_COMPTE.motDePasseTropCourt },
    });
    expect(simulation.updateUserById).not.toHaveBeenCalled();
  });

  it("refus d'Auth (weak_password) : même message", async () => {
    simulation.updateUserById.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "weak_password", message: "weak", status: 422 },
    } as never);
    await expect(reinitialiser(ID_KARIM)).resolves.toMatchObject({
      code: "VALIDATION",
      champs: { motDePasseTemporaire: "12 caractères minimum" },
    });
    expect(evenements()).not.toContain("mot_de_passe_reinitialise");
  });
});

describe("RM-7 : réservée aux administrateurs", () => {
  it("collaborateur qui appelle la Server Function directement : ACCES_REFUSE, aucun appel", async () => {
    simulation.session.id = ID_KARIM;
    await expect(reinitialiser(ID_SOPHIE)).resolves.toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(simulation.creerClientSecret).not.toHaveBeenCalled();
    expect(simulation.updateUserById).not.toHaveBeenCalled();
    expect(simulation.comptes.get(EMAIL_SOPHIE)!.motDePasse).toBe(MOT_DE_PASSE_SOPHIE);
    // La page est recalculée : S1, menu sans Administration (story 3.3).
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("auteur refusé par la base pendant l'action (NV202) : ACCES_REFUSE, page recalculée", async () => {
    simulation.pannesRpc.reinitialiser_mdp = { data: null, error: { code: "NV202", message: "Accès refusé" } };
    await expect(reinitialiser(ID_KARIM)).resolves.toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(simulation.updateUserById).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("sans session : renvoi vers la connexion, rien n'est changé", async () => {
    simulation.session.id = null;
    expect(await leve(() => reinitialiser(ID_KARIM))).toMatchObject(renvoiVers("/connexion"));
    expect(simulation.appels("reinitialiser_mdp")).toEqual([]);
  });

  it("auteur refusé par la base (NV202, désactivé entre-temps) : ACCES_REFUSE, Auth non touché", async () => {
    await expect(reinitialiserMotDePasse({ compteId: ID_SOPHIE, motDePasseTemporaire: TEMPORAIRE }, { auteur: ID_KARIM }))
      .resolves.toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(simulation.updateUserById).not.toHaveBeenCalled();
    expect(simulation.profils.get(ID_SOPHIE)!.doit_changer_mdp).toBe(false);
  });
});

describe("saisie et compte", () => {
  it.each([
    ["identifiant mal formé", { compteId: "pas-un-uuid", motDePasseTemporaire: TEMPORAIRE }],
    ["identifiant absent", { motDePasseTemporaire: TEMPORAIRE }],
    ["mot de passe en nombre", { compteId: ID_KARIM, motDePasseTemporaire: 123456789012 }],
    ["rien", undefined],
  ])("%s : VALIDATION, aucun appel à la base", async (_, saisie) => {
    await expect(actionReinitialiserMotDePasse(saisie)).resolves.toMatchObject({ ok: false, code: "VALIDATION" });
    expect(simulation.appels("reinitialiser_mdp")).toEqual([]);
    expect(simulation.updateUserById).not.toHaveBeenCalled();
  });

  it("compte inconnu : INTROUVABLE, Auth non touché", async () => {
    await expect(reinitialiser("00000000-0000-4000-8000-000000000000")).resolves.toMatchObject({
      ok: false,
      code: "INTROUVABLE",
    });
    expect(simulation.updateUserById).not.toHaveBeenCalled();
  });
});

describe("panne", () => {
  it("base injoignable : message de l'écran, code court au journal, Auth non touché, ancien mot de passe gardé", async () => {
    simulation.pannesRpc.reinitialiser_mdp = { data: null, error: { code: "57P01", message: "panne" } };
    const reponse = await reinitialiser(ID_KARIM);
    expect(reponse).toMatchObject({ ok: false, code: "ERREUR_INTERNE", message: PANNE, codeSupport: expect.any(String) });
    expect(simulation.updateUserById).not.toHaveBeenCalled();
    expect(simulation.comptes.get(EMAIL_KARIM)!.motDePasse).toBe(MOT_DE_PASSE_KARIM);
    const erreur = simulation.journal().find((l) => l.evenement === "erreur_inattendue");
    expect(erreur?.details).toMatchObject({ action: "reinitialiser_mot_de_passe", etape: "reinitialiser_mdp", code_base: "57P01" });
    const codes = simulation.appels("ecrire_journal").map((p) => p.p_code_erreur);
    expect(codes).toContain(!reponse.ok && reponse.codeSupport);
  });

  it("base levée (réseau) : même message", async () => {
    simulation.rpc.mockImplementationOnce(() => ({
      abortSignal: async () => {
        throw new Error("fetch failed");
      },
    }));
    await expect(reinitialiser(ID_KARIM)).resolves.toMatchObject({ code: "ERREUR_INTERNE", message: PANNE });
  });

  it("Auth injoignable : message de l'écran ; pas de retour arrière : l'ancien mot de passe marche encore et doit être changé", async () => {
    simulation.updateUserById.mockRejectedValueOnce(new Error("fetch failed"));
    const reponse = await reinitialiser(ID_KARIM);
    expect(reponse).toMatchObject({ ok: false, code: "ERREUR_INTERNE", message: PANNE, codeSupport: expect.any(String) });
    expect(evenements()).toEqual(["erreur_inattendue"]);
    expect(simulation.journal()[0].details).toMatchObject({ etape: "auth", code_base: "injoignable", compte_id: ID_KARIM });
    expect(simulation.profils.get(ID_KARIM)!.doit_changer_mdp).toBe(true);
    simulation.session.id = null;
    expect(await leve(() => actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM }))).toMatchObject(
      renvoiVers("/connexion/nouveau-mot-de-passe"),
    );
  });

  it("Auth refuse : code d'Auth au journal ; un nouvel essai répare", async () => {
    simulation.updateUserById.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "unexpected_failure", message: "panne", status: 500 },
    } as never);
    await expect(reinitialiser(ID_KARIM)).resolves.toMatchObject({ code: "ERREUR_INTERNE", message: PANNE });
    expect(simulation.journal()[0].details).toMatchObject({ etape: "auth", code_base: "unexpected_failure" });

    await expect(reinitialiser(ID_KARIM)).resolves.toMatchObject({ ok: true });
    expect(simulation.comptes.get(EMAIL_KARIM)!.motDePasse).toBe(TEMPORAIRE);
  });

  it("réponse illisible de reinitialiser_mdp : message de panne, Auth non touché", async () => {
    simulation.pannesRpc.reinitialiser_mdp = { data: { inattendu: true }, error: null };
    await expect(reinitialiser(ID_KARIM)).resolves.toMatchObject({ code: "ERREUR_INTERNE", message: PANNE });
    expect(simulation.updateUserById).not.toHaveBeenCalled();
    expect(simulation.journal()[0].details).toMatchObject({ code_base: "reponse_inattendue", compte_id: ID_KARIM });
  });

  it("clés absentes : message de l'écran et code court, rien n'est changé", async () => {
    simulation.creerClientSecret.mockImplementationOnce(() => {
      throw new Error("SUPABASE_SECRET_KEY manquante");
    });
    const reponse = await reinitialiser(ID_KARIM);
    expect(reponse).toMatchObject({ ok: false, code: "ERREUR_INTERNE", message: PANNE, codeSupport: expect.any(String) });
    expect(JSON.stringify(reponse)).not.toMatch(/SUPABASE|\.env/);
    const { codeSupport } = reponse as { codeSupport: string };
    expect(simulation.appels("ecrire_journal")).toEqual([
      {
        p_niveau: "erreur",
        p_evenement: "erreur_inattendue",
        p_details: { type: "action", action: "reinitialiser_mot_de_passe" },
        p_code_erreur: codeSupport,
      },
    ]);
  });

  it("jamais de mot de passe ni d'email dans une réponse d'erreur ou au journal", async () => {
    simulation.updateUserById.mockRejectedValueOnce(new Error(`fetch failed ${TEMPORAIRE}`));
    const reponse = await reinitialiser(ID_KARIM);
    expect(JSON.stringify(reponse)).not.toContain(TEMPORAIRE);
    expect(JSON.stringify(reponse)).not.toContain(EMAIL_KARIM);
    expect(JSON.stringify(simulation.appels("ecrire_journal"))).not.toContain(TEMPORAIRE);
  });
});

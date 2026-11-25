import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// « Désactiver » et « Réactiver » de l'écran A1 (story 3.4 ; FR-22, FR-25,
// RM-7, RM-9, RM-10, AD-6, AD-7, AD-10, AD-12, AD-13) : la Server Function
// `actionChangerEtatCompte` et `changerEtatCompte` de `src/server/admin`,
// avec Supabase simulé (session, profils, `modifier_compte`,
// `retablir_compte`, blocage dans Auth). Aucun compte n'est désactivé.
//
// Matrice de la story : désactiver, réactiver, dernier administrateur (soi
// ou autre), deux administrateurs simultanés, se désactiver soi-même,
// panne (base ou Auth injoignable, retour arrière), collaborateur, saisie
// mal formée.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `refresh()` n'a de sens que pendant une vraie Server Function de Next.js.
vi.mock("next/cache", () => ({ refresh }));

import { actionChangerEtatCompte } from "@/server/actions/changer-etat-compte";
import { changerEtatCompte, DUREE_BLOCAGE_AUTH } from "@/server/admin";
import { COOKIE_MESSAGE_CONNEXION, dechiffrerPassage } from "@/server/passage";
import { MESSAGES_COMPTE } from "@/shared/messages";

import {
  EMAIL_KARIM,
  EMAIL_SOPHIE,
  ID_KARIM,
  ID_SOPHIE,
  PROFIL_SOPHIE,
  type ProfilSimule,
} from "../aides/supabase-connexion";

const DERNIER_ADMINISTRATEUR = "Impossible : il doit rester au moins un administrateur actif.";

/** Second administrateur, pour les cas à deux administrateurs actifs. */
const ID_LEA = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const PROFIL_LEA: ProfilSimule = {
  id: ID_LEA,
  nom: "Léa Garnier",
  role: "administrateur",
  actif: true,
  doit_changer_mdp: false,
  email: "lea.garnier@nova-services.example",
};

const desactiver = (compteId: string) => actionChangerEtatCompte({ compteId, actif: false });
const reactiver = (compteId: string) => actionChangerEtatCompte({ compteId, actif: true });

const evenements = () => simulation.journal().map((ligne) => ligne.evenement);

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

describe("désactiver", () => {
  it("compte désactivé dans profils (jamais supprimé), puis bloqué dans Auth ; réponse avec le nouvel état", async () => {
    await expect(desactiver(ID_KARIM)).resolves.toEqual({
      ok: true,
      donnees: { id: ID_KARIM, nom: "Karim Benali", email: EMAIL_KARIM, actif: false, change: true },
    });
    expect(simulation.profils.get(ID_KARIM)).toMatchObject({ actif: false });
    expect(simulation.updateUserById).toHaveBeenCalledExactlyOnceWith(ID_KARIM, { ban_duration: DUREE_BLOCAGE_AUTH });
    expect(simulation.bannis.has(ID_KARIM)).toBe(true);
  });

  it("la base d'abord (modifier_compte, avec l'administratrice comme auteur), puis Auth", async () => {
    await desactiver(ID_KARIM);
    expect(simulation.appels("modifier_compte")).toEqual([{ p_auteur: ID_SOPHIE, p_compte: ID_KARIM, p_actif: false }]);
    const ordreBase = simulation.rpc.mock.invocationCallOrder[
      simulation.rpc.mock.calls.findIndex(([nom]) => nom === "modifier_compte")
    ];
    expect(ordreBase).toBeLessThan(simulation.updateUserById.mock.invocationCallOrder[0]);
  });

  it("compte_desactive au journal : compte, email, auteur", async () => {
    await desactiver(ID_KARIM);
    expect(simulation.journal()).toEqual([
      { evenement: "compte_desactive", details: { compte_id: ID_KARIM, email: EMAIL_KARIM, auteur: ID_SOPHIE } },
    ]);
  });

  it("le tableau est recalculé (refresh)", async () => {
    await desactiver(ID_KARIM);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("identifiant en majuscules : ramené en minuscules, comme dans la base", async () => {
    await expect(desactiver(ID_KARIM.toUpperCase())).resolves.toMatchObject({ ok: true });
    expect(simulation.appels("modifier_compte")[0]).toMatchObject({ p_compte: ID_KARIM });
  });

  it("déjà désactivé : réussite sans changement ni journal ; Auth remis d'accord (bloqué)", async () => {
    simulation.profils.get(ID_KARIM)!.actif = false;
    await expect(desactiver(ID_KARIM)).resolves.toMatchObject({ ok: true, donnees: { actif: false, change: false } });
    expect(simulation.updateUserById).toHaveBeenCalledExactlyOnceWith(ID_KARIM, { ban_duration: DUREE_BLOCAGE_AUTH });
    expect(simulation.bannis.has(ID_KARIM)).toBe(true);
    expect(simulation.journal()).toEqual([]);
  });

  it("nouvel essai après un retour arrière manqué (profil désactivé, Auth non bloqué) : Auth bloqué", async () => {
    simulation.updateUserById.mockRejectedValueOnce(new Error("fetch failed"));
    simulation.pannesRpc.retablir_compte = { data: null, error: { code: "57P01", message: "panne" } };
    await expect(desactiver(ID_KARIM)).resolves.toMatchObject({ code: "ERREUR_INTERNE" });
    expect(simulation.profils.get(ID_KARIM)!.actif).toBe(false);
    expect(simulation.bannis.has(ID_KARIM)).toBe(false);

    await expect(desactiver(ID_KARIM)).resolves.toMatchObject({ ok: true, donnees: { change: false } });
    expect(simulation.bannis.has(ID_KARIM)).toBe(true);
    expect(simulation.journal().map((l) => l.evenement)).not.toContain("compte_desactive");
  });

  it("déjà dans l'état voulu, Auth en panne : message de panne, code court, sans retour arrière ni journal d'état", async () => {
    simulation.profils.get(ID_KARIM)!.actif = false;
    simulation.updateUserById.mockRejectedValueOnce(new Error("fetch failed"));
    const reponse = await desactiver(ID_KARIM);
    expect(reponse).toMatchObject({
      ok: false,
      code: "ERREUR_INTERNE",
      message: "Le compte n'a pas pu être désactivé. Réessayez.",
      codeSupport: expect.any(String),
    });
    expect(simulation.appels("retablir_compte")).toEqual([]);
    expect(simulation.profils.get(ID_KARIM)!.actif).toBe(false);
    expect(simulation.journal().map((l) => l.evenement)).toEqual(["erreur_inattendue"]);
    expect(simulation.journal()[0].details).toMatchObject({ etape: "auth", code_base: "injoignable", compte_id: ID_KARIM });
  });

  it("un autre administrateur, s'il en reste un actif : désactivé", async () => {
    simulation.profils.set(ID_LEA, { ...PROFIL_LEA });
    await expect(desactiver(ID_LEA)).resolves.toMatchObject({ ok: true });
    expect(simulation.profils.get(ID_LEA)!.actif).toBe(false);
  });
});

describe("réactiver", () => {
  beforeEach(async () => {
    await desactiver(ID_KARIM);
    vi.clearAllMocks();
    refresh.mockClear();
  });

  it("compte réactivé dans profils, débloqué dans Auth ; compte_reactive au journal", async () => {
    await expect(reactiver(ID_KARIM)).resolves.toEqual({
      ok: true,
      donnees: { id: ID_KARIM, nom: "Karim Benali", email: EMAIL_KARIM, actif: true, change: true },
    });
    expect(simulation.profils.get(ID_KARIM)!.actif).toBe(true);
    expect(simulation.updateUserById).toHaveBeenCalledExactlyOnceWith(ID_KARIM, { ban_duration: "none" });
    expect(simulation.bannis.has(ID_KARIM)).toBe(false);
    expect(simulation.journal()).toEqual([
      { evenement: "compte_reactive", details: { compte_id: ID_KARIM, email: EMAIL_KARIM, auteur: ID_SOPHIE } },
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("RM-9 : dernier administrateur actif", () => {
  it("se désactiver quand on est le seul administrateur actif : refus, message exact, rien ne change, Auth non touché", async () => {
    await expect(desactiver(ID_SOPHIE)).resolves.toEqual({
      ok: false,
      code: "CONFLIT",
      message: DERNIER_ADMINISTRATEUR,
    });
    expect(MESSAGES_COMPTE.dernierAdministrateur).toBe(DERNIER_ADMINISTRATEUR);
    expect(simulation.profils.get(ID_SOPHIE)!.actif).toBe(true);
    expect(simulation.updateUserById).not.toHaveBeenCalled();
    expect(simulation.journal()).toEqual([]);
    expect(simulation.signOut).not.toHaveBeenCalled();
  });

  it("deux administrateurs dont un déjà désactivé : l'autre ne peut pas l'être", async () => {
    simulation.profils.set(ID_LEA, { ...PROFIL_LEA, actif: false });
    await expect(desactiver(ID_SOPHIE)).resolves.toMatchObject({ code: "CONFLIT", message: DERNIER_ADMINISTRATEUR });
  });

  it("deux administrateurs simultanés qui se désactivent l'un l'autre : un seul réussit, l'autre est refusé (NV202)", async () => {
    simulation.profils.set(ID_LEA, { ...PROFIL_LEA });
    // Sophie désactive Léa ; puis l'appel de Léa (vérifiée avant par sa
    // garde) arrive à la base, qui le traite après celui de Sophie.
    await expect(desactiver(ID_LEA)).resolves.toMatchObject({ ok: true });
    await expect(changerEtatCompte(ID_SOPHIE, false, { auteur: ID_LEA })).resolves.toEqual({
      ok: false,
      code: "ACCES_REFUSE",
      message: "Accès refusé.",
    });
    expect(simulation.profils.get(ID_SOPHIE)!.actif).toBe(true);
    expect([...simulation.profils.values()].filter((p) => p.role === "administrateur" && p.actif)).toHaveLength(1);
  });

  it("deux administrateurs simultanés qui se désactivent chacun eux-mêmes : le second reçoit le message du dernier administrateur", async () => {
    simulation.profils.set(ID_LEA, { ...PROFIL_LEA });
    await expect(changerEtatCompte(ID_LEA, false, { auteur: ID_LEA })).resolves.toMatchObject({ ok: true });
    await expect(changerEtatCompte(ID_SOPHIE, false, { auteur: ID_SOPHIE })).resolves.toMatchObject({
      code: "CONFLIT",
      message: DERNIER_ADMINISTRATEUR,
    });
    expect(simulation.profils.get(ID_SOPHIE)!.actif).toBe(true);
  });
});

describe("se désactiver soi-même, avec un autre administrateur actif", () => {
  beforeEach(() => {
    simulation.profils.set(ID_LEA, { ...PROFIL_LEA });
  });

  it("réussite, puis session fermée et renvoi vers I1 avec « Votre session a pris fin… »", async () => {
    await expect(desactiver(ID_SOPHIE)).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
    expect(simulation.profils.get(ID_SOPHIE)!.actif).toBe(false);
    expect(simulation.bannis.has(ID_SOPHIE)).toBe(true);
    expect(simulation.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(simulation.session.id).toBeNull();
    const message = simulation.cookiesPoses.get(COOKIE_MESSAGE_CONNEXION);
    expect(message?.options).toMatchObject({ httpOnly: true, path: "/connexion" });
    expect(dechiffrerPassage(COOKIE_MESSAGE_CONNEXION, message!.valeur)).toEqual({
      type: "message_connexion",
      message: "session_terminee",
    });
    expect(evenements()).toEqual(["compte_desactive"]);
  });
});

describe("RM-7 : réservée aux administrateurs", () => {
  it("collaborateur qui appelle la Server Function directement : ACCES_REFUSE, aucun appel", async () => {
    simulation.session.id = ID_KARIM;
    await expect(desactiver(ID_SOPHIE)).resolves.toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(simulation.creerClientSecret).not.toHaveBeenCalled();
    expect(simulation.updateUserById).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("sans session : renvoi vers la connexion, rien n'est changé", async () => {
    simulation.session.id = null;
    await expect(desactiver(ID_KARIM)).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
    expect(simulation.appels("modifier_compte")).toEqual([]);
  });

  it("auteur refusé par la base (désactivé entre-temps) : ACCES_REFUSE, rien ne change", async () => {
    simulation.pannesRpc.modifier_compte = { data: null, error: { code: "NV202", message: "Accès refusé" } };
    await expect(desactiver(ID_KARIM)).resolves.toMatchObject({ ok: false, code: "ACCES_REFUSE" });
    expect(simulation.updateUserById).not.toHaveBeenCalled();
  });
});

describe("saisie et compte", () => {
  it.each([
    ["identifiant mal formé", { compteId: "pas-un-uuid", actif: false }],
    ["état absent", { compteId: ID_KARIM }],
    ["état en texte", { compteId: ID_KARIM, actif: "false" }],
    ["rien", undefined],
  ])("%s : VALIDATION, aucun appel à la base", async (_, saisie) => {
    await expect(actionChangerEtatCompte(saisie)).resolves.toMatchObject({ ok: false, code: "VALIDATION" });
    expect(simulation.appels("modifier_compte")).toEqual([]);
    expect(simulation.updateUserById).not.toHaveBeenCalled();
  });

  it("compte inconnu : INTROUVABLE, Auth non touché, tableau recalculé", async () => {
    await expect(desactiver("00000000-0000-4000-8000-000000000000")).resolves.toMatchObject({
      ok: false,
      code: "INTROUVABLE",
    });
    expect(simulation.updateUserById).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("panne", () => {
  it("base injoignable : « Le compte n'a pas pu être désactivé. Réessayez. », code court, rien ne change", async () => {
    simulation.pannesRpc.modifier_compte = { data: null, error: { code: "57P01", message: "panne" } };
    const reponse = await desactiver(ID_KARIM);
    expect(reponse).toMatchObject({
      ok: false,
      code: "ERREUR_INTERNE",
      message: "Le compte n'a pas pu être désactivé. Réessayez.",
      codeSupport: expect.any(String),
    });
    expect(simulation.updateUserById).not.toHaveBeenCalled();
    expect(simulation.profils.get(ID_KARIM)!.actif).toBe(true);
    const erreur = simulation.journal().find((l) => l.evenement === "erreur_inattendue");
    expect(erreur?.details).toMatchObject({ action: "desactiver_compte", etape: "modifier_compte", code_base: "57P01" });
    const codes = simulation.appels("ecrire_journal").map((p) => p.p_code_erreur);
    expect(codes).toContain(!reponse.ok && reponse.codeSupport);
  });

  it("Auth refuse le blocage : profil remis comme avant, message de panne, code court au journal", async () => {
    simulation.updateUserById.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "unexpected_failure", message: "panne", status: 500 },
    } as never);
    await expect(desactiver(ID_KARIM)).resolves.toMatchObject({
      ok: false,
      code: "ERREUR_INTERNE",
      message: "Le compte n'a pas pu être désactivé. Réessayez.",
    });
    expect(simulation.profils.get(ID_KARIM)!.actif).toBe(true);
    expect(simulation.appels("retablir_compte")).toEqual([{ p_compte: ID_KARIM, p_actif: true }]);
    expect(evenements()).toEqual(["erreur_inattendue"]);
    expect(simulation.journal()[0].details).toMatchObject({
      etape: "auth",
      code_base: "unexpected_failure",
      profil_retabli: true,
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("Auth injoignable en se désactivant soi-même : profil remis actif (retour arrière sans auteur), session gardée", async () => {
    simulation.profils.set(ID_LEA, { ...PROFIL_LEA });
    simulation.updateUserById.mockRejectedValueOnce(new Error("fetch failed"));
    await expect(desactiver(ID_SOPHIE)).resolves.toMatchObject({ ok: false, code: "ERREUR_INTERNE" });
    expect(simulation.profils.get(ID_SOPHIE)!.actif).toBe(true);
    expect(simulation.signOut).not.toHaveBeenCalled();
    expect(simulation.session.id).toBe(ID_SOPHIE);
  });

  it("Auth refuse le déblocage : profil remis désactivé, « Le compte n'a pas pu être réactivé. Réessayez. »", async () => {
    simulation.profils.get(ID_KARIM)!.actif = false;
    simulation.bannis.add(ID_KARIM);
    simulation.updateUserById.mockRejectedValueOnce(new Error("fetch failed"));
    await expect(reactiver(ID_KARIM)).resolves.toMatchObject({
      ok: false,
      code: "ERREUR_INTERNE",
      message: "Le compte n'a pas pu être réactivé. Réessayez.",
    });
    expect(simulation.profils.get(ID_KARIM)!.actif).toBe(false);
    expect(simulation.bannis.has(ID_KARIM)).toBe(true);
  });

  it("retour arrière lui-même en panne : signalé au journal (profil_retabli faux)", async () => {
    simulation.updateUserById.mockRejectedValueOnce(new Error("fetch failed"));
    simulation.pannesRpc.retablir_compte = { data: null, error: { code: "57P01", message: "panne" } };
    await expect(desactiver(ID_KARIM)).resolves.toMatchObject({ code: "ERREUR_INTERNE" });
    expect(simulation.journal()[0].details).toMatchObject({ profil_retabli: false, compte_id: ID_KARIM });
  });

  it("clés absentes : message de l'écran et code court, rien n'est changé", async () => {
    simulation.creerClientSecret.mockImplementationOnce(() => {
      throw new Error("SUPABASE_SECRET_KEY manquante");
    });
    const reponse = await desactiver(ID_KARIM);
    expect(reponse).toMatchObject({
      ok: false,
      code: "ERREUR_INTERNE",
      message: "Le compte n'a pas pu être désactivé. Réessayez.",
      codeSupport: expect.any(String),
    });
    expect(JSON.stringify(reponse)).not.toMatch(/SUPABASE|\.env/);
    const { codeSupport } = reponse as { codeSupport: string };
    expect(simulation.appels("ecrire_journal")).toEqual([
      {
        p_niveau: "erreur",
        p_evenement: "erreur_inattendue",
        p_details: { type: "action", action: "changer_etat_compte" },
        p_code_erreur: codeSupport,
      },
    ]);
    expect(simulation.profils.get(ID_KARIM)!.actif).toBe(true);
  });

  it("réponse illisible de modifier_compte : message de panne, aucun retour arrière ni appel à Auth", async () => {
    simulation.pannesRpc.modifier_compte = { data: { inattendu: true }, error: null };
    const reponse = await desactiver(ID_KARIM);
    expect(reponse).toMatchObject({
      ok: false,
      code: "ERREUR_INTERNE",
      message: "Le compte n'a pas pu être désactivé. Réessayez.",
      codeSupport: expect.any(String),
    });
    expect(simulation.appels("retablir_compte")).toEqual([]);
    expect(simulation.updateUserById).not.toHaveBeenCalled();
    expect(simulation.profils.get(ID_KARIM)!.actif).toBe(true);
    expect(simulation.journal()).toEqual([
      {
        evenement: "erreur_inattendue",
        details: expect.objectContaining({
          action: "desactiver_compte",
          etape: "modifier_compte",
          code_base: "reponse_inattendue",
          compte_id: ID_KARIM,
        }),
      },
    ]);
  });

  it("jamais d'email de Sophie ni de mot de passe dans un message d'erreur", async () => {
    simulation.pannesRpc.modifier_compte = { data: null, error: { code: "57P01", message: "panne" } };
    const reponse = await desactiver(ID_KARIM);
    expect(JSON.stringify(reponse)).not.toContain(EMAIL_SOPHIE);
    expect(JSON.stringify(reponse)).not.toContain(EMAIL_KARIM);
  });
});

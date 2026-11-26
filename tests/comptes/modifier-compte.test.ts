import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// « Modifier » de l'écran A1 (story 3.3 ; FR-22, FR-25, RM-7, RM-9, AD-7,
// AD-10, AD-12, AD-13) : la Server Function `actionModifierCompte` et
// `modifierCompte` de `src/server/admin`, avec Supabase simulé (session,
// profils, `modifier_compte` de la migration 3.3). Aucun vrai compte n'est
// modifié.
//
// Matrice de la story : corriger le nom, changer le rôle, rien changé,
// dernier administrateur (soi), simultané, se rétrograder, compte
// désactivé, nom invalide, panne, collaborateur.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `refresh()` n'a de sens que pendant une vraie Server Function de Next.js.
vi.mock("next/cache", () => ({ refresh }));

import { actionModifierCompte } from "@/server/actions/modifier-compte";
import { modifierCompte } from "@/server/admin";
import { MESSAGES_COMPTE } from "@/shared/messages";

import { EMAIL_KARIM, EMAIL_SOPHIE, ID_KARIM, ID_SOPHIE, PROFIL_SOPHIE, type ProfilSimule } from "../aides/supabase-connexion";

const DERNIER_ADMINISTRATEUR = "Impossible : il doit rester au moins un administrateur actif.";
const PANNE = "Le compte n'a pas pu être modifié. Réessayez.";

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

const modifier = (compteId: string, nom: string, role: string) => actionModifierCompte({ compteId, nom, role });

const evenements = () => simulation.journal().map((ligne) => ligne.evenement);
const administrateursActifs = () =>
  [...simulation.profils.values()].filter((p) => p.role === "administrateur" && p.actif).map((p) => p.id);

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

describe("corriger le nom", () => {
  it("nom enregistré ; réponse avec le compte modifié ; email et état inchangés", async () => {
    await expect(modifier(ID_KARIM, "Karim Ben Ali", "collaborateur")).resolves.toEqual({
      ok: true,
      donnees: { id: ID_KARIM, nom: "Karim Ben Ali", email: EMAIL_KARIM, role: "collaborateur", actif: true, change: true },
    });
    expect(simulation.profils.get(ID_KARIM)).toMatchObject({ nom: "Karim Ben Ali", role: "collaborateur", actif: true });
  });

  it("la base seule (modifier_compte, avec l'administratrice comme auteur) ; jamais l'état, jamais Supabase Auth", async () => {
    await modifier(ID_KARIM, "Karim Ben Ali", "collaborateur");
    expect(simulation.appels("modifier_compte")).toEqual([
      { p_auteur: ID_SOPHIE, p_compte: ID_KARIM, p_nom: "Karim Ben Ali", p_role: "collaborateur" },
    ]);
    expect(simulation.updateUserById).not.toHaveBeenCalled();
  });

  it("espaces de bord retirés, comme à la création", async () => {
    await modifier(ID_KARIM, "  Karim Ben Ali  ", "collaborateur");
    expect(simulation.appels("modifier_compte")[0]).toMatchObject({ p_nom: "Karim Ben Ali" });
  });

  it("rien au journal pour un simple changement de nom (FR-22 ne trace que les rôles)", async () => {
    await modifier(ID_KARIM, "Karim Ben Ali", "collaborateur");
    expect(simulation.journal()).toEqual([]);
  });

  it("le tableau (et le menu) sont recalculés (refresh)", async () => {
    await modifier(ID_KARIM, "Karim Ben Ali", "collaborateur");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("l'email n'est jamais modifiable : un email ajouté à la saisie est ignoré", async () => {
    await expect(
      actionModifierCompte({ compteId: ID_KARIM, nom: "Karim", role: "collaborateur", email: "pirate@exemple.fr" }),
    ).resolves.toMatchObject({ ok: true, donnees: { email: EMAIL_KARIM } });
    expect(JSON.stringify(simulation.appels("modifier_compte"))).not.toContain("pirate");
  });

  it("identifiant en majuscules : ramené en minuscules, comme dans la base", async () => {
    await expect(modifier(ID_KARIM.toUpperCase(), "Karim", "collaborateur")).resolves.toMatchObject({ ok: true });
    expect(simulation.appels("modifier_compte")[0]).toMatchObject({ p_compte: ID_KARIM });
  });
});

describe("changer le rôle", () => {
  it("Collaborateur → Administrateur : enregistré, role_modifie au journal (compte, email, ancien et nouveau rôle, auteur)", async () => {
    await expect(modifier(ID_KARIM, "Karim Benali", "administrateur")).resolves.toMatchObject({
      ok: true,
      donnees: { role: "administrateur", change: true },
    });
    expect(simulation.profils.get(ID_KARIM)!.role).toBe("administrateur");
    expect(simulation.journal()).toEqual([
      {
        evenement: "role_modifie",
        details: {
          compte_id: ID_KARIM,
          email: EMAIL_KARIM,
          ancien_role: "collaborateur",
          nouveau_role: "administrateur",
          auteur: ID_SOPHIE,
        },
      },
    ]);
  });

  it("Administrateur → Collaborateur, avec un autre administrateur actif : enregistré, role_modifie", async () => {
    simulation.profils.set(ID_LEA, { ...PROFIL_LEA });
    await expect(modifier(ID_LEA, "Léa Garnier", "collaborateur")).resolves.toMatchObject({ ok: true });
    expect(administrateursActifs()).toEqual([ID_SOPHIE]);
    expect(simulation.journal()).toEqual([
      {
        evenement: "role_modifie",
        details: expect.objectContaining({ ancien_role: "administrateur", nouveau_role: "collaborateur", compte_id: ID_LEA }),
      },
    ]);
  });

  it("nom et rôle changés ensemble : une seule ligne au journal (le rôle)", async () => {
    await modifier(ID_KARIM, "Karim Ben Ali", "administrateur");
    expect(evenements()).toEqual(["role_modifie"]);
    expect(simulation.profils.get(ID_KARIM)).toMatchObject({ nom: "Karim Ben Ali", role: "administrateur" });
  });

  it("jamais de mot de passe ni de nom dans le journal", async () => {
    await modifier(ID_KARIM, "Karim Ben Ali", "administrateur");
    expect(JSON.stringify(simulation.journal())).not.toMatch(/Karim Ben Ali|mot_de_passe|password/);
  });
});

describe("rien changé", () => {
  it("« Enregistrer » sans modification : réussite (change faux), rien écrit, rien au journal", async () => {
    await expect(modifier(ID_KARIM, "Karim Benali", "collaborateur")).resolves.toEqual({
      ok: true,
      donnees: { id: ID_KARIM, nom: "Karim Benali", email: EMAIL_KARIM, role: "collaborateur", actif: true, change: false },
    });
    expect(simulation.journal()).toEqual([]);
  });

  it("seule administratrice, elle enregistre son propre compte sans rien changer : réussite, pas de refus", async () => {
    await expect(modifier(ID_SOPHIE, "Sophie Martin", "administrateur")).resolves.toMatchObject({
      ok: true,
      donnees: { change: false },
    });
  });
});

describe("RM-9 : dernier administrateur actif", () => {
  it("seule administratrice active, elle se passe collaboratrice : message exact, rien ne change (ni le nom)", async () => {
    await expect(modifier(ID_SOPHIE, "Sophie Martin-Durand", "collaborateur")).resolves.toEqual({
      ok: false,
      code: "CONFLIT",
      message: DERNIER_ADMINISTRATEUR,
    });
    expect(MESSAGES_COMPTE.dernierAdministrateur).toBe(DERNIER_ADMINISTRATEUR);
    expect(simulation.profils.get(ID_SOPHIE)).toMatchObject({ nom: "Sophie Martin", role: "administrateur", actif: true });
    expect(simulation.journal()).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("un second administrateur désactivé ne compte pas : toujours refusé", async () => {
    simulation.profils.set(ID_LEA, { ...PROFIL_LEA, actif: false });
    await expect(modifier(ID_SOPHIE, "Sophie Martin", "collaborateur")).resolves.toMatchObject({
      code: "CONFLIT",
      message: DERNIER_ADMINISTRATEUR,
    });
  });

  it("seule administratrice : elle peut changer son propre nom", async () => {
    await expect(modifier(ID_SOPHIE, "Sophie Martin-Durand", "administrateur")).resolves.toMatchObject({ ok: true });
    expect(simulation.profils.get(ID_SOPHIE)).toMatchObject({ nom: "Sophie Martin-Durand", role: "administrateur" });
  });

  it("deux administrateurs simultanés qui se rétrogradent l'un l'autre : un seul réussit, l'autre est refusé (NV202)", async () => {
    simulation.profils.set(ID_LEA, { ...PROFIL_LEA });
    // Sophie rétrograde Léa ; puis l'appel de Léa (vérifiée avant par sa
    // garde) arrive à la base, qui le traite après celui de Sophie.
    await expect(modifier(ID_LEA, "Léa Garnier", "collaborateur")).resolves.toMatchObject({ ok: true });
    await expect(
      modifierCompte({ compteId: ID_SOPHIE, nom: "Sophie Martin", role: "collaborateur" }, { auteur: ID_LEA }),
    ).resolves.toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(administrateursActifs()).toEqual([ID_SOPHIE]);
  });

  it("deux administrateurs simultanés qui se rétrogradent chacun eux-mêmes : le second reçoit le message exact", async () => {
    simulation.profils.set(ID_LEA, { ...PROFIL_LEA });
    const premier = await modifierCompte({ compteId: ID_LEA, nom: "Léa Garnier", role: "collaborateur" }, { auteur: ID_LEA });
    const second = await modifierCompte(
      { compteId: ID_SOPHIE, nom: "Sophie Martin", role: "collaborateur" },
      { auteur: ID_SOPHIE },
    );
    expect(premier.ok).toBe(true);
    expect(second).toMatchObject({ code: "CONFLIT", message: DERNIER_ADMINISTRATEUR });
    expect(administrateursActifs()).toEqual([ID_SOPHIE]);
  });
});

describe("se rétrograder soi-même, avec un autre administrateur actif", () => {
  beforeEach(() => {
    simulation.profils.set(ID_LEA, { ...PROFIL_LEA });
  });

  it("réussite, role_modifie, puis la page recalculée (S1 à la place d'A1, menu sans Administration) ; la session reste ouverte", async () => {
    await expect(modifier(ID_SOPHIE, "Sophie Martin", "collaborateur")).resolves.toMatchObject({
      ok: true,
      donnees: { role: "collaborateur", change: true },
    });
    expect(simulation.profils.get(ID_SOPHIE)!.role).toBe("collaborateur");
    expect(evenements()).toEqual(["role_modifie"]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(simulation.session.id).toBe(ID_SOPHIE);
    expect(simulation.signOut).not.toHaveBeenCalled();
  });

  it("l'action suivante d'administration est refusée : « Accès refusé. », aucun appel", async () => {
    await modifier(ID_SOPHIE, "Sophie Martin", "collaborateur");
    vi.clearAllMocks();
    refresh.mockClear();
    await expect(modifier(ID_KARIM, "Karim", "administrateur")).resolves.toEqual({
      ok: false,
      code: "ACCES_REFUSE",
      message: "Accès refusé.",
    });
    expect(simulation.creerClientSecret).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("compte désactivé", () => {
  it("modification permise ; il reste désactivé", async () => {
    simulation.profils.get(ID_KARIM)!.actif = false;
    await expect(modifier(ID_KARIM, "Karim Ben Ali", "administrateur")).resolves.toMatchObject({
      ok: true,
      donnees: { actif: false, role: "administrateur" },
    });
    expect(simulation.profils.get(ID_KARIM)).toMatchObject({ nom: "Karim Ben Ali", role: "administrateur", actif: false });
    expect(simulation.updateUserById).not.toHaveBeenCalled();
  });

  it("un administrateur désactivé passé collaborateur : permis (la règle ne compte que les administrateurs actifs)", async () => {
    simulation.profils.set(ID_LEA, { ...PROFIL_LEA, actif: false });
    await expect(modifier(ID_LEA, "Léa Garnier", "collaborateur")).resolves.toMatchObject({ ok: true });
    expect(simulation.profils.get(ID_LEA)).toMatchObject({ role: "collaborateur", actif: false });
  });
});

describe("nom invalide et saisie mal formée", () => {
  it.each([
    ["vide", "", "Le nom est obligatoire"],
    ["seulement des espaces", "   ", "Le nom est obligatoire"],
    ["plus de 100 caractères", "a".repeat(101), "Le nom ne doit pas dépasser 100 caractères"],
  ])("nom %s : VALIDATION avec le message de la création, aucun appel à la base", async (_, nom, message) => {
    await expect(modifier(ID_KARIM, nom, "collaborateur")).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "1 champ est à corriger",
      champs: { nom: message },
    });
    expect(simulation.appels("modifier_compte")).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("100 caractères : accepté (même limite qu'à la création)", async () => {
    await expect(modifier(ID_KARIM, "é".repeat(100), "collaborateur")).resolves.toMatchObject({ ok: true });
  });

  it.each([
    ["rôle inconnu", { compteId: ID_KARIM, nom: "Karim", role: "admin" }, "role"],
    ["identifiant mal formé", { compteId: "pas-un-uuid", nom: "Karim", role: "collaborateur" }, "compteId"],
    ["rien", undefined, "compteId"],
  ])("%s : VALIDATION, aucun appel à la base", async (_, saisie, champ) => {
    const reponse = await actionModifierCompte(saisie);
    expect(reponse).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(reponse.ok ? {} : reponse.champs).toHaveProperty(champ);
    expect(simulation.appels("modifier_compte")).toEqual([]);
  });

  it("nom refusé par la base (contrainte profils_nom_check, 23514) : VALIDATION sous le champ Nom, rien au journal d'erreur", async () => {
    simulation.pannesRpc.modifier_compte = {
      data: null,
      error: { code: "23514", message: 'new row for relation "profils" violates check constraint "profils_nom_check"' },
    };
    await expect(modifier(ID_KARIM, "Karim", "collaborateur")).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "1 champ est à corriger",
      champs: { nom: "Le nom ne doit pas dépasser 100 caractères" },
    });
    expect(evenements()).toEqual([]);
  });

  it("rôle refusé par la base (profils_role_check, 23514) : VALIDATION sous le champ Rôle", async () => {
    simulation.pannesRpc.modifier_compte = {
      data: null,
      error: { code: "23514", message: 'violates check constraint "profils_role_check"' },
    };
    await expect(modifier(ID_KARIM, "Karim", "collaborateur")).resolves.toMatchObject({
      code: "VALIDATION",
      champs: { role: MESSAGES_COMPTE.roleInconnu },
    });
  });

  it("autre contrainte (23514 sans profils_nom_check ni profils_role_check) : panne avec code court, pas un faux message sous un champ", async () => {
    simulation.pannesRpc.modifier_compte = {
      data: null,
      error: { code: "23514", message: 'violates check constraint "profils_autre_check"' },
    };
    const reponse = await modifier(ID_KARIM, "Karim", "collaborateur");
    expect(reponse).toMatchObject({ ok: false, code: "ERREUR_INTERNE", message: MESSAGES_COMPTE.modificationImpossible });
    expect(reponse.ok ? undefined : reponse.champs).toBeUndefined();
    expect(reponse.ok ? undefined : reponse.codeSupport).toMatch(/\S/);
  });

  it("compte inconnu : INTROUVABLE avec le message de panne, tableau recalculé", async () => {
    await expect(modifier("00000000-0000-4000-8000-000000000000", "Inconnu", "collaborateur")).resolves.toEqual({
      ok: false,
      code: "INTROUVABLE",
      message: PANNE,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("RM-7 : réservée aux administrateurs", () => {
  it("collaborateur qui appelle la Server Function directement : ACCES_REFUSE, aucun appel, page recalculée", async () => {
    simulation.session.id = ID_KARIM;
    await expect(modifier(ID_KARIM, "Karim", "administrateur")).resolves.toEqual({
      ok: false,
      code: "ACCES_REFUSE",
      message: "Accès refusé.",
    });
    expect(simulation.creerClientSecret).not.toHaveBeenCalled();
    expect(simulation.profils.get(ID_KARIM)!.role).toBe("collaborateur");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("sans session : renvoi vers la connexion, rien n'est changé", async () => {
    simulation.session.id = null;
    await expect(modifier(ID_KARIM, "Karim", "administrateur")).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
    expect(simulation.appels("modifier_compte")).toEqual([]);
  });

  it("auteur refusé par la base (rétrogradé entre la garde et la base, NV202) : ACCES_REFUSE, page recalculée", async () => {
    simulation.pannesRpc.modifier_compte = { data: null, error: { code: "NV202", message: "Accès refusé" } };
    await expect(modifier(ID_KARIM, "Karim", "administrateur")).resolves.toEqual({
      ok: false,
      code: "ACCES_REFUSE",
      message: "Accès refusé.",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("panne", () => {
  it("base en panne : « Le compte n'a pas pu être modifié. Réessayez. », code court au journal, rien ne change", async () => {
    simulation.pannesRpc.modifier_compte = { data: null, error: { code: "57P01", message: "panne" } };
    const reponse = await modifier(ID_KARIM, "Karim Ben Ali", "administrateur");
    expect(reponse).toMatchObject({ ok: false, code: "ERREUR_INTERNE", message: PANNE, codeSupport: expect.any(String) });
    expect(simulation.profils.get(ID_KARIM)).toMatchObject({ nom: "Karim Benali", role: "collaborateur" });
    const erreur = simulation.journal().find((l) => l.evenement === "erreur_inattendue");
    expect(erreur?.details).toMatchObject({ action: "modifier_compte", etape: "modifier_compte", code_base: "57P01", compte_id: ID_KARIM });
    const codes = simulation.appels("ecrire_journal").map((p) => p.p_code_erreur);
    expect(codes).toContain(!reponse.ok && reponse.codeSupport);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("base injoignable (appel qui lève) : même message, code_base « injoignable »", async () => {
    simulation.rpc.mockImplementationOnce(() => {
      throw new TypeError("fetch failed");
    });
    await expect(modifier(ID_KARIM, "Karim", "administrateur")).resolves.toMatchObject({ code: "ERREUR_INTERNE", message: PANNE });
    expect(simulation.journal().find((l) => l.evenement === "erreur_inattendue")?.details).toMatchObject({
      code_base: "injoignable",
    });
  });

  it("réponse illisible de modifier_compte (ancienne fonction, sans le rôle) : message de panne, rien au journal comme rôle", async () => {
    simulation.pannesRpc.modifier_compte = { data: { nom: "Karim", email: EMAIL_KARIM, change: true }, error: null };
    await expect(modifier(ID_KARIM, "Karim", "administrateur")).resolves.toMatchObject({ code: "ERREUR_INTERNE", message: PANNE });
    expect(simulation.journal()).toEqual([
      {
        evenement: "erreur_inattendue",
        details: expect.objectContaining({ code_base: "reponse_inattendue", compte_id: ID_KARIM }),
      },
    ]);
  });

  it("clés absentes : message de l'écran et code court, rien n'est changé", async () => {
    simulation.creerClientSecret.mockImplementationOnce(() => {
      throw new Error("SUPABASE_SECRET_KEY manquante");
    });
    const reponse = await modifier(ID_KARIM, "Karim", "administrateur");
    expect(reponse).toMatchObject({ ok: false, code: "ERREUR_INTERNE", message: PANNE, codeSupport: expect.any(String) });
    expect(JSON.stringify(reponse)).not.toMatch(/SUPABASE|\.env/);
    const { codeSupport } = reponse as { codeSupport: string };
    expect(simulation.appels("ecrire_journal")).toEqual([
      {
        p_niveau: "erreur",
        p_evenement: "erreur_inattendue",
        p_details: { type: "action", action: "modifier_compte" },
        p_code_erreur: codeSupport,
      },
    ]);
    expect(simulation.profils.get(ID_KARIM)!.role).toBe("collaborateur");
  });

  it("jamais d'email dans un message d'erreur", async () => {
    simulation.pannesRpc.modifier_compte = { data: null, error: { code: "57P01", message: "panne" } };
    const reponse = await modifier(ID_KARIM, "Karim", "administrateur");
    expect(JSON.stringify(reponse)).not.toContain(EMAIL_SOPHIE);
    expect(JSON.stringify(reponse)).not.toContain(EMAIL_KARIM);
  });
});

describe("désactivation et réactivation (story 3.4) : sans changement", () => {
  it("modifier_compte appelée par noms de paramètres, sans nom ni rôle : l'état seul change", async () => {
    const { actionChangerEtatCompte } = await import("@/server/actions/changer-etat-compte");
    await expect(actionChangerEtatCompte({ compteId: ID_KARIM, actif: false })).resolves.toMatchObject({
      ok: true,
      donnees: { actif: false, change: true, nom: "Karim Benali" },
    });
    expect(simulation.appels("modifier_compte")).toEqual([{ p_auteur: ID_SOPHIE, p_compte: ID_KARIM, p_actif: false }]);
    expect(simulation.profils.get(ID_KARIM)).toMatchObject({ nom: "Karim Benali", role: "collaborateur", actif: false });
    expect(evenements()).toEqual(["compte_desactive"]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Server Function « Créer un compte » de l'écran A1 (story 3.2 ; FR-21,
// RM-7, RM-8, AD-6, AD-7, AD-11, AD-12, AD-13), avec Supabase simulé : la
// session et les profils par la simulation de la connexion (garde), l'API
// d'administration d'Auth et les fonctions SQL par celle de
// `src/server/admin`. Aucun compte n'est créé.
//
// Matrice de la story : création réussie, collaborateur, sans session,
// saisie invalide, email déjà pris (casse différente comprise), panne
// (Supabase injoignable, profil refusé, retour arrière manqué, clés
// absentes), et jamais de mot de passe dans la réponse ni le journal.

const { connexion, admin } = await vi.hoisted(async () => ({
  connexion: (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
  admin: (await import("../aides/supabase-admin")).creerSimulation(),
}));
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: admin.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: connexion.createClient }));
vi.mock("next/headers", () => ({ cookies: connexion.cookies }));
// `refresh()` n'a de sens que pendant une vraie Server Function de Next.js.
vi.mock("next/cache", () => ({ refresh }));

import { actionCreerCompte } from "@/server/actions/creer-compte";
import { MESSAGE_ERREUR_INATTENDUE, MESSAGES_COMPTE } from "@/shared/messages";

import { ID_COMPTE } from "../aides/supabase-admin";
import { ID_KARIM, ID_SOPHIE, PROFIL_SOPHIE } from "../aides/supabase-connexion";

const MOT_DE_PASSE = "Kp7mWq2xTz9aBc4d";
const SAISIE = {
  nom: "Lucas Bernard",
  email: "lucas.bernard@nova-services.example",
  role: "collaborateur",
  motDePasseTemporaire: MOT_DE_PASSE,
};

const creer = (modifications: Record<string, unknown> = {}) => actionCreerCompte({ ...SAISIE, ...modifications });

/** Tout ce qui est parti vers le journal, en texte. */
const journal = () => JSON.stringify(admin.appels("ecrire_journal"));

beforeEach(() => {
  connexion.reinitialiser();
  admin.reinitialiser();
  connexion.profils.set(ID_SOPHIE, { ...PROFIL_SOPHIE });
  // Sophie, administratrice, est connectée.
  connexion.session.id = ID_SOPHIE;
  refresh.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("création réussie", () => {
  it("répond avec le compte créé (identifiant, nom, email, rôle), jamais le mot de passe", async () => {
    const reponse = await creer();
    expect(reponse).toEqual({
      ok: true,
      donnees: {
        id: ID_COMPTE,
        nom: "Lucas Bernard",
        email: "lucas.bernard@nova-services.example",
        role: "collaborateur",
      },
    });
    expect(JSON.stringify(reponse)).not.toContain(MOT_DE_PASSE);
  });

  it("compte Auth « email confirmé » (aucun email envoyé), puis creer_profil", async () => {
    await creer();
    expect(admin.createUser).toHaveBeenCalledExactlyOnceWith({
      email: "lucas.bernard@nova-services.example",
      password: MOT_DE_PASSE,
      email_confirm: true,
    });
    expect(admin.appels("creer_profil")).toEqual([
      {
        p_id: ID_COMPTE,
        p_nom: "Lucas Bernard",
        p_email: "lucas.bernard@nova-services.example",
        p_role: "collaborateur",
        p_mdp_temporaire: MOT_DE_PASSE,
      },
    ]);
  });

  it("compte_cree au journal, avec l'administratrice comme auteur, sans mot de passe", async () => {
    await creer();
    const lignes = admin.appels("ecrire_journal");
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({
      p_niveau: "info",
      p_evenement: "compte_cree",
      p_details: { compte_id: ID_COMPTE, role: "collaborateur", auteur: ID_SOPHIE },
    });
    expect(journal()).not.toContain(MOT_DE_PASSE);
  });

  it("le tableau des comptes est recalculé (refresh)", async () => {
    await creer();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("rôle Administrateur : créé tel quel", async () => {
    await expect(creer({ role: "administrateur" })).resolves.toMatchObject({
      ok: true,
      donnees: { role: "administrateur" },
    });
    expect(admin.appels("creer_profil")[0]).toMatchObject({ p_role: "administrateur" });
  });
});

describe("RM-7 : réservée aux administrateurs", () => {
  it("collaborateur qui appelle la Server Function directement : ACCES_REFUSE, aucun appel à Supabase", async () => {
    connexion.session.id = ID_KARIM;
    await expect(creer()).resolves.toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(admin.creerClientSecret).not.toHaveBeenCalled();
    expect(admin.createUser).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("administratrice rétrogradée entre deux actions : ACCES_REFUSE dès l'action suivante", async () => {
    connexion.profils.get(ID_SOPHIE)!.role = "collaborateur";
    await expect(creer()).resolves.toMatchObject({ ok: false, code: "ACCES_REFUSE" });
    expect(admin.createUser).not.toHaveBeenCalled();
  });

  it("sans session : renvoi vers la connexion, rien n'est créé", async () => {
    connexion.session.id = null;
    await expect(creer()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
    expect(admin.createUser).not.toHaveBeenCalled();
  });

  it("compte désactivé : renvoi vers la connexion, rien n'est créé", async () => {
    connexion.profils.get(ID_SOPHIE)!.actif = false;
    await expect(creer()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
    expect(admin.createUser).not.toHaveBeenCalled();
  });

  it("administratrice qui doit encore choisir son mot de passe : renvoi vers I2, rien n'est créé", async () => {
    connexion.profils.get(ID_SOPHIE)!.doit_changer_mdp = true;
    await expect(creer()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion\/nouveau-mot-de-passe;/),
    });
    expect(admin.createUser).not.toHaveBeenCalled();
  });
});

describe("saisie invalide : le serveur refuse aussi (AD-11)", () => {
  it.each([
    ["nom vide", { nom: "  " }, { nom: MESSAGES_COMPTE.nomObligatoire }],
    ["email mal formé", { email: "lucas@exemple" }, { email: MESSAGES_COMPTE.emailForme }],
    ["mot de passe de 11 caractères", { motDePasseTemporaire: "Kp7mWq2xTz9" }, { motDePasseTemporaire: "12 caractères minimum" }],
    ["rôle inconnu", { role: "superadmin" }, { role: MESSAGES_COMPTE.roleInconnu }],
  ])("%s : VALIDATION avec le champ, rien n'est créé", async (_, modifications, champs) => {
    await expect(creer(modifications)).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "1 champ est à corriger",
      champs,
    });
    expect(admin.createUser).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("tout vide : un message par champ, dans l'ordre de l'écran", async () => {
    const reponse = await actionCreerCompte({});
    expect(reponse).toMatchObject({ ok: false, code: "VALIDATION", message: "4 champs sont à corriger" });
    expect(Object.keys((reponse as { champs: object }).champs)).toEqual(["nom", "email", "role", "motDePasseTemporaire"]);
  });

  it.each([null, "texte", 42, ["Lucas"]])("saisie qui n'est pas un objet (%j) : VALIDATION", async (saisie) => {
    await expect(actionCreerCompte(saisie)).resolves.toMatchObject({ ok: false, code: "VALIDATION" });
    expect(admin.createUser).not.toHaveBeenCalled();
  });

  it("la réponse de refus ne contient pas le mot de passe saisi", async () => {
    const reponse = await creer({ nom: "", motDePasseTemporaire: "Secret court" });
    expect(JSON.stringify(reponse)).not.toContain("Secret court");
  });
});

describe("email déjà pris", () => {
  it.each(["email_exists", "user_already_exists"])(
    "Supabase Auth répond %s : CONFLIT, « Cet email est déjà utilisé par un autre compte. » sous Email",
    async (code) => {
      admin.createUser.mockResolvedValueOnce({
        data: { user: null },
        error: { code, message: "already registered", status: 422 },
      } as never);
      await expect(creer()).resolves.toEqual({
        ok: false,
        code: "CONFLIT",
        message: MESSAGES_COMPTE.compteExistant,
        champs: { email: "Cet email est déjà utilisé par un autre compte." },
      });
      expect(admin.appels("creer_profil")).toEqual([]);
      expect(refresh).not.toHaveBeenCalled();
    },
  );

  it("casse différente : l'email part en minuscules, le conflit est le même", async () => {
    admin.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "email_exists", message: "already registered", status: 422 },
    } as never);
    await expect(creer({ email: " Lucas.Bernard@Nova-Services.example " })).resolves.toMatchObject({
      code: "CONFLIT",
      champs: { email: MESSAGES_COMPTE.emailDejaUtilise },
    });
    expect(admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "lucas.bernard@nova-services.example" }),
    );
  });

  it("profil déjà présent avec cet email (23505) : compte Auth supprimé, même CONFLIT", async () => {
    admin.retoursRpc.creer_profil = async () => ({ data: null, error: { code: "23505", message: "doublon" } });
    await expect(creer()).resolves.toMatchObject({
      code: "CONFLIT",
      champs: { email: MESSAGES_COMPTE.emailDejaUtilise },
    });
    expect(admin.deleteUser).toHaveBeenCalledExactlyOnceWith(ID_COMPTE);
  });
});

describe("panne : « Le compte n'a pas pu être créé. Réessayez. », journalisée avec un code court", () => {
  const panne = {
    ok: false,
    code: "ERREUR_INTERNE",
    message: "Le compte n'a pas pu être créé. Réessayez.",
    codeSupport: expect.any(String),
  };

  it("Supabase Auth injoignable", async () => {
    admin.createUser.mockRejectedValueOnce(new Error("fetch failed"));
    await expect(creer()).resolves.toEqual(panne);
    expect(admin.appels("ecrire_journal")).toEqual([
      expect.objectContaining({ p_niveau: "erreur", p_evenement: "erreur_inattendue" }),
    ]);
    expect(journal()).not.toContain(MOT_DE_PASSE);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("profil refusé : compte Auth supprimé, rien n'est créé", async () => {
    admin.retoursRpc.creer_profil = async () => ({ data: null, error: { code: "57P01", message: "panne" } });
    await expect(creer()).resolves.toEqual(panne);
    expect(admin.deleteUser).toHaveBeenCalledExactlyOnceWith(ID_COMPTE);
    expect(journal()).not.toContain("compte_cree");
  });

  it("retour arrière manqué : le message technique de l'installation ne part pas vers le navigateur", async () => {
    admin.retoursRpc.creer_profil = async () => ({ data: null, error: { code: "57P01", message: "panne" } });
    admin.deleteUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "panne" } } as never);
    const reponse = await creer();
    expect(reponse).toEqual(panne);
    expect(JSON.stringify(reponse)).not.toContain(ID_COMPTE);
    // Le support retrouve l'identifiant dans le journal.
    expect(journal()).toContain(ID_COMPTE);
  });

  it("clés absentes : même message, sans nom de variable d'environnement, journalisée avec un code court", async () => {
    // Le client secret manque pour la création ; le journal, appelé ensuite, est simulé.
    admin.creerClientSecret.mockImplementationOnce(() => {
      throw new Error("SUPABASE_SECRET_KEY manquante");
    });
    const reponse = await creer();
    expect(reponse).toEqual(panne);
    expect(JSON.stringify(reponse)).not.toMatch(/SUPABASE|\.env/);
    const { codeSupport } = reponse as { codeSupport: string };
    expect(admin.appels("ecrire_journal")).toEqual([
      {
        p_niveau: "erreur",
        p_evenement: "erreur_inattendue",
        p_details: { type: "action", action: "creer_compte" },
        p_code_erreur: codeSupport,
      },
    ]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(`code ${codeSupport}`));
    expect(journal()).not.toMatch(/Lucas|lucas|Kp7m/);
    expect(admin.createUser).not.toHaveBeenCalled();
  });

  it("panne imprévue levée (lecture du profil) : l'enveloppe répond ERREUR_INTERNE", async () => {
    connexion.getClaims.mockRejectedValueOnce(new Error("panne"));
    await expect(creer()).resolves.toMatchObject({
      ok: false,
      code: "ERREUR_INTERNE",
      message: MESSAGE_ERREUR_INATTENDUE,
    });
    expect(admin.createUser).not.toHaveBeenCalled();
    expect(admin.appels("ecrire_journal")).toEqual([
      expect.objectContaining({
        p_evenement: "erreur_inattendue",
        p_details: { type: "action", action: "creer_compte" },
      }),
    ]);
  });
});

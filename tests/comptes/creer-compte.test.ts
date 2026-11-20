import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Création d'un compte (FR-21, AD-6, AD-13) par `src/server/admin`, avec un
// client Supabase simulé : matrice de la story 1.5 (création, saisie
// invalide, email déjà utilisé, profil refusé, clés absentes).

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-admin")).creerSimulation(),
);

vi.mock("@/server/supabase-secret", () => ({
  creerClientSecret: simulation.creerClientSecret,
}));

import { creerCompte, MESSAGE_CLES_ABSENTES, preparerInstallation } from "@/server/admin";
import { MESSAGES_COMPTE } from "@/shared/messages";

import { ID_COMPTE } from "../aides/supabase-admin";

const MOT_DE_PASSE = "Kp7mWq2xTz9aBc4d";
const SAISIE = {
  nom: "Sophie Martin",
  email: "sophie@exemple.fr",
  role: "administrateur",
  motDePasseTemporaire: MOT_DE_PASSE,
};

beforeEach(() => {
  simulation.reinitialiser();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Tout ce qui est parti vers le journal, en texte. */
const journal = () => JSON.stringify(simulation.appels("ecrire_journal"));

describe("création", () => {
  it("crée le compte Auth confirmé, sans métadonnée ni rôle", async () => {
    await creerCompte(SAISIE);
    expect(simulation.createUser).toHaveBeenCalledTimes(1);
    expect(simulation.createUser).toHaveBeenCalledWith({
      email: "sophie@exemple.fr",
      password: MOT_DE_PASSE,
      email_confirm: true,
    });
  });

  it("appelle creer_profil avec l'identifiant du compte Auth et la saisie nettoyée", async () => {
    await creerCompte({ ...SAISIE, nom: "  Sophie Martin ", email: " sophie@exemple.fr " });
    expect(simulation.appels("creer_profil")).toEqual([
      {
        p_id: ID_COMPTE,
        p_nom: "Sophie Martin",
        p_email: "sophie@exemple.fr",
        p_role: "administrateur",
        p_mdp_temporaire: MOT_DE_PASSE,
      },
    ]);
  });

  it("répond avec le compte créé, sans le mot de passe", async () => {
    const reponse = await creerCompte(SAISIE);
    expect(reponse).toEqual({
      ok: true,
      donnees: { id: ID_COMPTE, nom: "Sophie Martin", email: "sophie@exemple.fr", role: "administrateur" },
    });
    expect(JSON.stringify(reponse)).not.toContain(MOT_DE_PASSE);
  });

  it("écrit compte_cree au journal, sans mot de passe ni nom", async () => {
    await creerCompte(SAISIE);
    const lignes = simulation.appels("ecrire_journal");
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({
      p_niveau: "info",
      p_evenement: "compte_cree",
      p_details: { compte_id: ID_COMPTE, email: "sophie@exemple.fr", role: "administrateur", auteur: "installation" },
    });
    expect(journal()).not.toContain(MOT_DE_PASSE);
  });

  it("crée un collaborateur de la même façon", async () => {
    const reponse = await creerCompte({ ...SAISIE, role: "collaborateur" });
    expect(reponse.ok).toBe(true);
    expect(simulation.appels("creer_profil")[0]).toMatchObject({ p_role: "collaborateur" });
  });

  it("n'efface jamais le compte Auth quand tout réussit", async () => {
    await creerCompte(SAISIE);
    expect(simulation.deleteUser).not.toHaveBeenCalled();
  });
});

describe("saisie invalide : rien n'est créé", () => {
  it.each([
    ["email mal formé", { email: "sophie.exemple.fr" }, "email", MESSAGES_COMPTE.emailForme],
    ["nom vide", { nom: "   " }, "nom", MESSAGES_COMPTE.nomObligatoire],
    ["nom de plus de 100 caractères", { nom: "a".repeat(101) }, "nom", MESSAGES_COMPTE.nomTropLong],
    ["rôle inconnu", { role: "chef" }, "role", MESSAGES_COMPTE.roleInconnu],
    ["mot de passe de 11 caractères", { motDePasseTemporaire: "a".repeat(11) }, "motDePasseTemporaire", MESSAGES_COMPTE.motDePasseTropCourt],
  ])("%s", async (_cas, changement, champ, message) => {
    const reponse = await creerCompte({ ...SAISIE, ...changement });
    expect(reponse).toMatchObject({ ok: false, code: "VALIDATION", champs: { [champ]: message } });
    expect(simulation.createUser).not.toHaveBeenCalled();
    expect(simulation.rpc).not.toHaveBeenCalled();
  });

  it("refuse une saisie qui n'est pas un objet", async () => {
    const reponse = await creerCompte("Sophie");
    expect(reponse).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(simulation.createUser).not.toHaveBeenCalled();
  });

  it("refuse le mot de passe jugé trop faible par Supabase Auth", async () => {
    simulation.createUser.mockResolvedValueOnce({
      data: { user: null } as never,
      error: { code: "weak_password", message: "Password should be at least 12 characters." },
    });
    const reponse = await creerCompte(SAISIE);
    expect(reponse).toMatchObject({
      ok: false,
      code: "VALIDATION",
      champs: { motDePasseTemporaire: MESSAGES_COMPTE.motDePasseTropCourt },
    });
    expect(simulation.rpc).not.toHaveBeenCalled();
  });
});

describe("email déjà utilisé", () => {
  it.each(["email_exists", "user_already_exists"])("code %s : CONFLIT, rien créé", async (code) => {
    simulation.createUser.mockResolvedValueOnce({
      data: { user: null } as never,
      error: { code, message: "A user with this email address has already been registered", status: 422 },
    });
    const reponse = await creerCompte(SAISIE);
    expect(reponse).toEqual({
      ok: false,
      code: "CONFLIT",
      message: "Un compte existe déjà avec cet email.",
      champs: { email: MESSAGES_COMPTE.emailDejaUtilise },
    });
    expect(simulation.appels("creer_profil")).toHaveLength(0);
    expect(simulation.deleteUser).not.toHaveBeenCalled();
  });
});

describe("profil refusé : le compte Auth est supprimé (AD-6)", () => {
  it("supprime le compte Auth et répond par un échec", async () => {
    simulation.retoursRpc.creer_profil = async () => ({
      data: null,
      error: { code: "NV101", message: "Profil refusé" },
    });
    const reponse = await creerCompte(SAISIE);
    expect(simulation.deleteUser).toHaveBeenCalledWith(ID_COMPTE);
    expect(reponse).toMatchObject({
      ok: false,
      code: "ERREUR_INTERNE",
      message: MESSAGES_COMPTE.creationImpossible,
    });
    expect(reponse.ok === false && reponse.codeSupport).toMatch(/^[0-9A-Z]{1,7}$/);
  });

  it("supprime aussi le compte quand la base ne répond pas", async () => {
    simulation.retoursRpc.creer_profil = () => Promise.reject(new Error("délai dépassé"));
    const reponse = await creerCompte(SAISIE);
    expect(simulation.deleteUser).toHaveBeenCalledWith(ID_COMPTE);
    expect(reponse).toMatchObject({ ok: false, code: "ERREUR_INTERNE" });
  });

  it("répond CONFLIT si un profil porte déjà cet email (23505), après suppression", async () => {
    simulation.retoursRpc.creer_profil = async () => ({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    const reponse = await creerCompte(SAISIE);
    expect(simulation.deleteUser).toHaveBeenCalledWith(ID_COMPTE);
    expect(reponse).toMatchObject({ ok: false, code: "CONFLIT", message: MESSAGES_COMPTE.compteExistant });
  });

  it("journalise l'erreur sans mot de passe, et sans compte_cree", async () => {
    simulation.retoursRpc.creer_profil = async () => ({
      data: null,
      error: { code: "XX000", message: "Profil refusé" },
    });
    await creerCompte(SAISIE);
    const lignes = simulation.appels("ecrire_journal");
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({
      p_niveau: "erreur",
      p_evenement: "erreur_inattendue",
      p_details: { etape: "creer_profil", code_base: "XX000", compte_auth_supprime: true },
    });
    expect(journal()).not.toContain(MOT_DE_PASSE);
  });

  it("si la suppression échoue : l'identifiant est donné pour un nettoyage manuel", async () => {
    simulation.retoursRpc.creer_profil = async () => ({
      data: null,
      error: { code: "NV101", message: "Profil refusé" },
    });
    simulation.deleteUser.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "unexpected_failure", message: "Database error deleting user" },
    });
    const reponse = await creerCompte(SAISIE);
    expect(reponse).toMatchObject({ ok: false, code: "ERREUR_INTERNE" });
    expect(reponse.ok === false && reponse.message).toContain(ID_COMPTE);
    // Le profil a pu être créé malgré tout (délai dépassé après l'écriture).
    expect(reponse.ok === false && reponse.message).toContain("Table Editor > profils");
    expect(reponse.ok === false && reponse.message).toContain("Authentication > Users");
    expect(simulation.appels("ecrire_journal")[0]).toMatchObject({
      p_details: { compte_id: ID_COMPTE, compte_auth_supprime: false },
    });
  });

  it("si la suppression lève une erreur : même chose", async () => {
    simulation.retoursRpc.creer_profil = async () => ({ data: null, error: { code: "NV101", message: "" } });
    simulation.deleteUser.mockRejectedValueOnce(new Error("réseau coupé"));
    const reponse = await creerCompte(SAISIE);
    expect(reponse.ok === false && reponse.message).toContain(ID_COMPTE);
  });
});

describe("Auth en panne", () => {
  it("répond ERREUR_INTERNE sans appeler creer_profil", async () => {
    simulation.createUser.mockRejectedValueOnce(new Error("réseau coupé"));
    const reponse = await creerCompte(SAISIE);
    expect(reponse).toMatchObject({ ok: false, code: "ERREUR_INTERNE", message: MESSAGES_COMPTE.creationImpossible });
    expect(simulation.appels("creer_profil")).toHaveLength(0);
  });

  it("répond ERREUR_INTERNE pour un refus imprévu d'Auth", async () => {
    simulation.createUser.mockResolvedValueOnce({
      data: { user: null } as never,
      error: { code: "unexpected_failure", message: "boom", status: 500 },
    });
    const reponse = await creerCompte(SAISIE);
    expect(reponse).toMatchObject({ ok: false, code: "ERREUR_INTERNE" });
    expect(simulation.deleteUser).not.toHaveBeenCalled();
  });
});

describe("clés absentes", () => {
  beforeEach(() => {
    simulation.creerClientSecret.mockImplementation(() => {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY manquante (voir .env.example).");
    });
  });

  it("creerCompte répond par un message qui renvoie à .env.example", async () => {
    const reponse = await creerCompte(SAISIE);
    expect(reponse).toMatchObject({ ok: false, message: MESSAGE_CLES_ABSENTES });
    expect(MESSAGE_CLES_ABSENTES).toContain(".env.example");
  });

  it("preparerInstallation le signale avant toute action", () => {
    expect(preparerInstallation()).toMatchObject({ ok: false, message: MESSAGE_CLES_ABSENTES });
  });
});

describe("preparerInstallation", () => {
  it("donne l'adresse du projet, jamais la clé", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dev-essai.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "cle-secrete-d-essai");
    const reponse = preparerInstallation();
    expect(reponse).toEqual({ ok: true, donnees: { adresseProjet: "https://dev-essai.supabase.co" } });
    expect(JSON.stringify(reponse)).not.toContain("cle-secrete-d-essai");
  });
});

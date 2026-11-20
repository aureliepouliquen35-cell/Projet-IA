import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Server Function de la connexion I1 et module `src/server/connexion`
// (FR-8, AD-8, AD-12, AD-13), avec Supabase simulé : matrice de la story 1.6
// (bons identifiants, mauvais mot de passe ou email inconnu, compte inactif,
// blocage, saisie vide ou mal formée, panne).

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));

import { actionSeConnecter } from "@/server/actions/se-connecter";
import { MESSAGE_ERREUR_INATTENDUE } from "@/shared/messages";

import { EMAIL_KARIM, ID_KARIM, MOT_DE_PASSE_KARIM } from "../aides/supabase-connexion";

const IDENTIFIANTS_INCORRECTS = {
  ok: false,
  code: "VALIDATION",
  message: "Identifiants incorrects",
};
const TROP_DE_TENTATIVES = {
  ok: false,
  code: "TROP_DE_TENTATIVES",
  message: "Trop de tentatives, réessayez plus tard",
};

/** Connexion réussie : la Server Function lève le renvoi de Next.js vers `/demandes`. */
async function connexionReussie(saisie: unknown) {
  let levee: unknown;
  try {
    await actionSeConnecter(saisie);
  } catch (erreur) {
    levee = erreur;
  }
  expect(levee).toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/demandes;/) });
}

const mauvaisEssai = (email = EMAIL_KARIM) =>
  actionSeConnecter({ email, motDePasse: "mauvais mot de passe" });

beforeEach(() => {
  simulation.reinitialiser();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bons identifiants (compte actif)", () => {
  it("ouvre la session et renvoie vers /demandes", async () => {
    await connexionReussie({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM });
    expect(simulation.session.id).toBe(ID_KARIM);
    expect(simulation.signOut).not.toHaveBeenCalled();
  });

  it("vérifie le blocage avant d'appeler Supabase Auth (AD-8)", async () => {
    await connexionReussie({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM });
    const ordreBlocage = simulation.rpc.mock.invocationCallOrder[
      simulation.rpc.mock.calls.findIndex(([nom]) => nom === "connexion_bloquee")
    ];
    expect(ordreBlocage).toBeLessThan(simulation.signInWithPassword.mock.invocationCallOrder[0]);
  });

  it("enregistre une tentative réussie et écrit connexion_reussie, sans mot de passe", async () => {
    await connexionReussie({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM });
    expect(simulation.appels("enregistrer_tentative")).toEqual([
      { p_email: EMAIL_KARIM, p_reussite: true },
    ]);
    expect(simulation.journal()).toEqual([
      { evenement: "connexion_reussie", details: { email: EMAIL_KARIM, compte_id: ID_KARIM } },
    ]);
    expect(JSON.stringify(simulation.rpc.mock.calls)).not.toContain(MOT_DE_PASSE_KARIM);
  });

  it("l'email est mis en minuscules et sans espaces ; le mot de passe est transmis tel quel", async () => {
    await connexionReussie({ email: "  Karim.Benali@Nova-Services.example ", motDePasse: MOT_DE_PASSE_KARIM });
    expect(simulation.signInWithPassword).toHaveBeenCalledWith({
      email: EMAIL_KARIM,
      password: MOT_DE_PASSE_KARIM,
    });
  });

  it("relit le profil (actif) dans profils, avec la session ouverte", async () => {
    await connexionReussie({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM });
    expect(simulation.from).toHaveBeenCalledWith("profils");
    expect(simulation.lectureProfils).toHaveBeenCalledWith("actif", ID_KARIM);
  });
});

describe("mauvais mot de passe ou email inconnu (1er à 4e échec)", () => {
  it("mauvais mot de passe : « Identifiants incorrects », échec enregistré, connexion_echouee", async () => {
    await expect(mauvaisEssai()).resolves.toEqual(IDENTIFIANTS_INCORRECTS);
    expect(simulation.session.id).toBeNull();
    expect(simulation.appels("enregistrer_tentative")).toEqual([
      { p_email: EMAIL_KARIM, p_reussite: false },
    ]);
    expect(simulation.journal()).toEqual([
      { evenement: "connexion_echouee", details: { email: EMAIL_KARIM, motif: "invalid_credentials" } },
    ]);
    expect(JSON.stringify(simulation.rpc.mock.calls)).not.toContain("mauvais mot de passe");
  });

  it("email inconnu : exactement la même réponse", async () => {
    await expect(mauvaisEssai("personne@exemple.fr")).resolves.toEqual(IDENTIFIANTS_INCORRECTS);
    expect(simulation.appels("enregistrer_tentative")).toEqual([
      { p_email: "personne@exemple.fr", p_reussite: false },
    ]);
  });

  it("compte bloqué dans Supabase Auth (user_banned) : même réponse", async () => {
    simulation.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "user_banned", message: "User is banned", status: 400 },
    } as never);
    await expect(
      actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM }),
    ).resolves.toEqual(IDENTIFIANTS_INCORRECTS);
  });

  it("quatre échecs : toujours « Identifiants incorrects »", async () => {
    for (let essai = 1; essai <= 4; essai += 1) {
      await expect(mauvaisEssai()).resolves.toEqual(IDENTIFIANTS_INCORRECTS);
    }
    await connexionReussie({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM });
  });
});

describe("compte inactif", () => {
  beforeEach(() => {
    simulation.profils.get(ID_KARIM)!.actif = false;
  });

  it("bons identifiants : session refermée aussitôt, « Identifiants incorrects »", async () => {
    await expect(
      actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM }),
    ).resolves.toEqual(IDENTIFIANTS_INCORRECTS);
    expect(simulation.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(simulation.session.id).toBeNull();
  });

  it("compté comme un échec, connexion_echouee au journal", async () => {
    await actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM });
    expect(simulation.appels("enregistrer_tentative")).toEqual([
      { p_email: EMAIL_KARIM, p_reussite: false },
    ]);
    expect(simulation.journal()).toEqual([
      {
        evenement: "connexion_echouee",
        details: { email: EMAIL_KARIM, compte_id: ID_KARIM, motif: "compte_inactif" },
      },
    ]);
  });

  it("compte sans profil : même réponse, session refermée", async () => {
    simulation.profils.clear();
    await expect(
      actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM }),
    ).resolves.toEqual(IDENTIFIANTS_INCORRECTS);
    expect(simulation.session.id).toBeNull();
  });
});

describe("blocage (5 échecs d'affilée en moins de 15 minutes)", () => {
  async function cinqEchecs(email = EMAIL_KARIM) {
    for (let essai = 1; essai <= 5; essai += 1) {
      await expect(mauvaisEssai(email)).resolves.toEqual(IDENTIFIANTS_INCORRECTS);
      simulation.avancer(1);
    }
  }

  it("6e essai, même avec le bon mot de passe : « Trop de tentatives », Supabase non appelé", async () => {
    await cinqEchecs();
    simulation.signInWithPassword.mockClear();

    await expect(
      actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM }),
    ).resolves.toEqual(TROP_DE_TENTATIVES);
    expect(simulation.signInWithPassword).not.toHaveBeenCalled();
    expect(simulation.session.id).toBeNull();
  });

  it("essai non compté, connexion_bloquee au journal", async () => {
    await cinqEchecs();
    simulation.rpc.mockClear();

    await mauvaisEssai();
    expect(simulation.appels("enregistrer_tentative")).toEqual([]);
    expect(simulation.journal()).toEqual([
      { evenement: "connexion_bloquee", details: { email: EMAIL_KARIM } },
    ]);
  });

  it("email inconnu : bloqué de la même façon", async () => {
    await cinqEchecs("personne@exemple.fr");
    await expect(mauvaisEssai("personne@exemple.fr")).resolves.toEqual(TROP_DE_TENTATIVES);
  });

  it("le blocage d'un email ne touche pas les autres", async () => {
    await cinqEchecs("personne@exemple.fr");
    await connexionReussie({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM });
  });

  it("fin du blocage 15 minutes après le 1er des 5 échecs, même avec des essais entre-temps", async () => {
    await cinqEchecs(); // échecs à 0, 1, 2, 3 et 4 minutes ; on est à 5 minutes.
    simulation.avancer(5); // 10 minutes
    await expect(mauvaisEssai()).resolves.toEqual(TROP_DE_TENTATIVES);
    simulation.avancer(4); // 14 minutes
    await expect(
      actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM }),
    ).resolves.toEqual(TROP_DE_TENTATIVES);
    simulation.avancer(1.5); // 15 min 30 s : le 1er échec a plus de 15 minutes.
    await connexionReussie({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM });
  });

  it("une réussite remet le compte à zéro : il faut 5 nouveaux échecs d'affilée", async () => {
    for (let essai = 1; essai <= 4; essai += 1) await mauvaisEssai();
    await connexionReussie({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM });
    for (let essai = 1; essai <= 4; essai += 1) {
      await expect(mauvaisEssai()).resolves.toEqual(IDENTIFIANTS_INCORRECTS);
    }
    await connexionReussie({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM });
  });
});

describe("saisie vide ou mal formée", () => {
  it.each([
    [{ email: "", motDePasse: "x" }, { email: "L'email est obligatoire" }],
    [{ email: "karim", motDePasse: "x" }, { email: "L'email doit avoir la forme nom@exemple.fr" }],
    [{ email: EMAIL_KARIM, motDePasse: "" }, { motDePasse: "Le mot de passe est obligatoire" }],
    [{}, { email: "L'email est obligatoire", motDePasse: "Le mot de passe est obligatoire" }],
  ])("%o : message sous le champ, rien n'est appelé ni enregistré", async (saisie, champs) => {
    const reponse = await actionSeConnecter(saisie);
    expect(reponse).toMatchObject({ ok: false, code: "VALIDATION", champs });
    expect(simulation.creerClientSecret).not.toHaveBeenCalled();
    expect(simulation.createClient).not.toHaveBeenCalled();
  });

  it("n'importe quoi envoyé directement : VALIDATION", async () => {
    for (const saisie of [null, "texte", 42, [EMAIL_KARIM], { email: 1, motDePasse: true }]) {
      await expect(actionSeConnecter(saisie)).resolves.toMatchObject({ ok: false, code: "VALIDATION" });
    }
    expect(simulation.createClient).not.toHaveBeenCalled();
  });
});

describe("panne", () => {
  const PANNE = { ok: false, code: "ERREUR_INTERNE", message: MESSAGE_ERREUR_INATTENDUE };

  it("base injoignable avant la connexion : ERREUR_INTERNE journalisée, Auth non appelé", async () => {
    simulation.pannesRpc.connexion_bloquee = { data: null, error: { code: "PGRST000", message: "panne" } };
    await expect(
      actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM }),
    ).resolves.toMatchObject({ ...PANNE, codeSupport: expect.any(String) });
    expect(simulation.signInWithPassword).not.toHaveBeenCalled();
    expect(simulation.journal()).toEqual([
      { evenement: "erreur_inattendue", details: { type: "action", action: "se_connecter" } },
    ]);
  });

  it("Auth injoignable : ERREUR_INTERNE, rien n'est enregistré", async () => {
    simulation.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "fetch failed", status: 0 },
    } as never);
    await expect(
      actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM }),
    ).resolves.toMatchObject(PANNE);
    expect(simulation.appels("enregistrer_tentative")).toEqual([]);
  });

  it("Auth refuse pour une autre raison (limite de débit) : ERREUR_INTERNE", async () => {
    simulation.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "over_request_rate_limit", message: "rate limit", status: 429 },
    } as never);
    await expect(
      actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM }),
    ).resolves.toMatchObject(PANNE);
  });

  it("panne après l'ouverture de la session : la session est refermée", async () => {
    simulation.pannesRpc.enregistrer_tentative = { data: null, error: { code: "PGRST000", message: "panne" } };
    await expect(
      actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM }),
    ).resolves.toMatchObject(PANNE);
    expect(simulation.session.id).toBeNull();
  });

  it("profil illisible : la session est refermée", async () => {
    simulation.pannesRpc.profils = { data: null, error: { code: "42501", message: "refus" } };
    await expect(
      actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM }),
    ).resolves.toMatchObject(PANNE);
    expect(simulation.session.id).toBeNull();
  });
});

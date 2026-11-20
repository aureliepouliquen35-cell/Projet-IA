import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Commandes d'installation (story 1.5) : `compte:creer` et
// `parametres:installer`, avec un client Supabase et une console simulés.
// Projet affiché et « oui » demandé avant d'agir ; mot de passe affiché une
// seule fois ; codes de sortie.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-admin")).creerSimulation(),
);

vi.mock("@/server/supabase-secret", () => ({
  creerClientSecret: simulation.creerClientSecret,
}));

import commandeCreerCompte from "../../scripts/installation/creer-compte";
import commandeInstallerParametres from "../../scripts/installation/installer-parametres";
import type { EntreesSorties } from "../../scripts/installation/commun";

import { ID_COMPTE } from "../aides/supabase-admin";

const ADRESSE = "https://dev-essai.supabase.co";
const CLE = "cle-secrete-d-essai-a-ne-jamais-afficher";

/** Console simulée : ce qui est écrit, et la réponse tapée. */
function console_(reponse = "oui") {
  const sortie: string[] = [];
  const erreurs: string[] = [];
  const questions: string[] = [];
  const es: EntreesSorties = {
    ecrire: (texte) => sortie.push(texte),
    erreur: (texte) => erreurs.push(texte),
    demander: async (question) => {
      questions.push(question);
      return reponse;
    },
  };
  return { es, sortie, erreurs, questions, tout: () => [...sortie, ...erreurs, ...questions].join("\n") };
}

const OPTIONS_COMPTE = ["--nom", "Sophie Martin", "--email", "sophie@exemple.fr", "--role", "administrateur"];
const OPTIONS_PARAMETRES = [
  "--telephone",
  "01 23 45 67 89",
  "--email-contact",
  "contact@nova-essai.fr",
  "--contact-donnees",
  "donnees@nova-essai.fr",
];

beforeEach(() => {
  simulation.reinitialiser();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ADRESSE);
  vi.stubEnv("SUPABASE_SECRET_KEY", CLE);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Mot de passe envoyé à Supabase Auth. */
const motDePasseEnvoye = () => String(simulation.createUser.mock.calls[0]?.[0]?.password ?? "");

describe("compte:creer — création", () => {
  it("affiche le projet, demande « oui », crée le compte et sort avec 0", async () => {
    const c = console_();
    await expect(commandeCreerCompte(OPTIONS_COMPTE, c.es)).resolves.toBe(0);
    expect(c.sortie).toContain(`Projet Supabase visé : ${ADRESSE}`);
    expect(c.questions).toEqual(["Tapez « oui » pour continuer : "]);
    expect(simulation.createUser).toHaveBeenCalledTimes(1);
    expect(simulation.appels("creer_profil")).toHaveLength(1);
  });

  it("affiche le mot de passe temporaire tiré au hasard, une seule fois", async () => {
    const c = console_();
    await commandeCreerCompte(OPTIONS_COMPTE, c.es);
    const motDePasse = motDePasseEnvoye();
    expect(motDePasse).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]{16}$/);
    const occurrences = c.tout().split(motDePasse).length - 1;
    expect(occurrences).toBe(1);
    expect(c.sortie).toContain(`Mot de passe temporaire : ${motDePasse}`);
    expect(simulation.appels("creer_profil")[0]).toMatchObject({ p_id: ID_COMPTE, p_mdp_temporaire: motDePasse });
  });

  it("n'affiche jamais la clé secrète", async () => {
    const c = console_();
    await commandeCreerCompte(OPTIONS_COMPTE, c.es);
    expect(c.tout()).not.toContain(CLE);
  });

  it("accepte le rôle écrit avec une majuscule (« Administrateur »)", async () => {
    const options = [...OPTIONS_COMPTE];
    options[options.indexOf("--role") + 1] = "Administrateur";
    await expect(commandeCreerCompte(options, console_().es)).resolves.toBe(0);
    expect(simulation.appels("creer_profil")[0]).toMatchObject({ p_role: "administrateur" });
  });

  it("crée un collaborateur de test de la même façon", async () => {
    const c = console_();
    const options = ["--nom", "Collaborateur Essai", "--email", "essai@exemple.fr", "--role", "collaborateur"];
    await expect(commandeCreerCompte(options, c.es)).resolves.toBe(0);
    expect(simulation.appels("creer_profil")[0]).toMatchObject({ p_role: "collaborateur" });
  });
});

describe("compte:creer — refus", () => {
  it("sans « oui » : rien n'est créé, sortie 1", async () => {
    for (const reponse of ["non", "", "o", "yes"]) {
      const c = console_(reponse);
      await expect(commandeCreerCompte(OPTIONS_COMPTE, c.es)).resolves.toBe(1);
      expect(c.erreurs).toContain("Annulé : rien n'a été fait.");
    }
    expect(simulation.createUser).not.toHaveBeenCalled();
  });

  it("« OUI » ou « oui » entouré d'espaces suffisent", async () => {
    await expect(commandeCreerCompte(OPTIONS_COMPTE, console_(" OUI ").es)).resolves.toBe(0);
  });

  it.each([
    ["email mal formé", ["--email", "sophie.exemple.fr"], "--email : L'email doit avoir la forme nom@exemple.fr"],
    ["nom vide", ["--nom", "  "], "--nom : Le nom est obligatoire"],
    ["nom trop long", ["--nom", "a".repeat(101)], "--nom : Le nom ne doit pas dépasser 100 caractères"],
    ["rôle inconnu", ["--role", "chef"], "--role : Le rôle doit être Collaborateur ou Administrateur"],
  ])("%s : message clair, sans confirmation, rien créé, sortie 1", async (_cas, changement, message) => {
    const options = [...OPTIONS_COMPTE];
    options[options.indexOf(changement[0]) + 1] = changement[1];
    const c = console_();
    await expect(commandeCreerCompte(options, c.es)).resolves.toBe(1);
    expect(c.erreurs).toContain(`  ${message}`);
    expect(c.questions).toHaveLength(0);
    expect(simulation.createUser).not.toHaveBeenCalled();
  });

  it("option inconnue ou manquante : mode d'emploi, sortie 1", async () => {
    const c = console_();
    await expect(commandeCreerCompte(["--prenom", "Sophie"], c.es)).resolves.toBe(1);
    expect(c.erreurs.join("\n")).toContain("Utilisation : npm run compte:creer");
    await expect(commandeCreerCompte([], console_().es)).resolves.toBe(1);
    expect(simulation.createUser).not.toHaveBeenCalled();
  });

  it("email déjà utilisé : « Un compte existe déjà avec cet email. », sortie 1", async () => {
    simulation.createUser.mockResolvedValueOnce({
      data: { user: null } as never,
      error: { code: "email_exists", message: "already registered", status: 422 },
    });
    const c = console_();
    await expect(commandeCreerCompte(OPTIONS_COMPTE, c.es)).resolves.toBe(1);
    expect(c.erreurs).toContain("Un compte existe déjà avec cet email.");
    expect(c.tout()).not.toContain("Mot de passe temporaire :");
  });

  it("profil refusé : compte Auth supprimé, message d'échec, sortie 1", async () => {
    simulation.retoursRpc.creer_profil = async () => ({ data: null, error: { code: "NV101", message: "" } });
    const c = console_();
    await expect(commandeCreerCompte(OPTIONS_COMPTE, c.es)).resolves.toBe(1);
    expect(simulation.deleteUser).toHaveBeenCalledWith(ID_COMPTE);
    expect(c.erreurs).toContain("Le compte n'a pas pu être créé. Réessayez.");
    expect(c.erreurs.some((ligne) => /^Code pour le support : [0-9A-Z]+$/.test(ligne))).toBe(true);
    expect(c.tout()).not.toContain(motDePasseEnvoye());
  });

  it("suppression impossible : l'identifiant est affiché pour un nettoyage manuel", async () => {
    simulation.retoursRpc.creer_profil = async () => ({ data: null, error: { code: "NV101", message: "" } });
    simulation.deleteUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "échec" } });
    const c = console_();
    await expect(commandeCreerCompte(OPTIONS_COMPTE, c.es)).resolves.toBe(1);
    expect(c.erreurs.join("\n")).toContain(ID_COMPTE);
  });

  it("clés absentes : message qui renvoie à .env.example, sortie 1, avant toute question", async () => {
    simulation.creerClientSecret.mockImplementation(() => {
      throw new Error("manquante");
    });
    const c = console_();
    await expect(commandeCreerCompte(OPTIONS_COMPTE, c.es)).resolves.toBe(1);
    expect(c.erreurs.join("\n")).toContain(".env.example");
    expect(c.questions).toHaveLength(0);
  });
});

describe("parametres:installer", () => {
  it("affiche le projet et les valeurs, demande « oui », enregistre, sortie 0", async () => {
    const c = console_();
    await expect(commandeInstallerParametres(OPTIONS_PARAMETRES, c.es)).resolves.toBe(0);
    expect(c.sortie).toContain(`Projet Supabase visé : ${ADRESSE}`);
    expect(c.sortie.join("\n")).toContain("contact@nova-essai.fr");
    expect(simulation.appels("modifier_parametres")).toEqual([
      {
        p_telephone: "01 23 45 67 89",
        p_email_contact: "contact@nova-essai.fr",
        p_contact_donnees: "donnees@nova-essai.fr",
      },
    ]);
    expect(c.sortie).toContain("Informations mises à jour. Elles sont visibles immédiatement.");
    expect(simulation.appels("ecrire_journal").map((p) => p.p_evenement)).toEqual(["parametres_modifies"]);
  });

  it("le téléphone est facultatif", async () => {
    const options = OPTIONS_PARAMETRES.slice(2);
    await expect(commandeInstallerParametres(options, console_().es)).resolves.toBe(0);
    expect(simulation.appels("modifier_parametres")[0]).toMatchObject({ p_telephone: null });
  });

  it("email mal formé : message de l'UX, rien modifié, sortie 1", async () => {
    const options = [...OPTIONS_PARAMETRES];
    options[options.indexOf("--email-contact") + 1] = "contact.nova";
    const c = console_();
    await expect(commandeInstallerParametres(options, c.es)).resolves.toBe(1);
    expect(c.erreurs).toContain("  --email-contact : L'email doit avoir la forme nom@exemple.fr");
    expect(simulation.rpc).not.toHaveBeenCalled();
  });

  it("sans « oui » : rien modifié", async () => {
    await expect(commandeInstallerParametres(OPTIONS_PARAMETRES, console_("non").es)).resolves.toBe(1);
    expect(simulation.rpc).not.toHaveBeenCalled();
  });

  it("clés absentes : message qui renvoie à .env.example, sortie 1", async () => {
    simulation.creerClientSecret.mockImplementation(() => {
      throw new Error("manquante");
    });
    const c = console_();
    await expect(commandeInstallerParametres(OPTIONS_PARAMETRES, c.es)).resolves.toBe(1);
    expect(c.erreurs.join("\n")).toContain(".env.example");
  });
});

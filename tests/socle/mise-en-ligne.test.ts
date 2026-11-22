import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseEnv } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ADRESSE_PAR_DEFAUT, adresseDev, identifiantsE2e } from "../e2e/environnement";

// Story 1.12 : l'application est prête à publier (AD-17, A-H2, A-H3) et le
// test de bout en bout SM-1 ne tourne que sur dev, sans identifiant dans le
// dépôt (AD-15).

const racine = process.cwd();
const lire = (chemin: string) => readFileSync(join(racine, chemin), "utf8");

const paquet = JSON.parse(lire("package.json")) as {
  version: string;
  engines?: { node?: string };
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

// Régions Vercel situées en Europe (Paris, Francfort, Dublin, Londres, Stockholm).
const REGIONS_EUROPE = ["cdg1", "fra1", "dub1", "lhr1", "arn1"];

describe("version et environnement d'exécution", () => {
  it("la version de package.json a la forme X.Y.Z, celle du tag vX.Y.Z", () => {
    expect(paquet.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("impose Node.js 24 (A-H3), lu par Vercel", () => {
    expect(paquet.engines?.node).toBe("24.x");
  });

  it("place les fonctions Vercel en Europe, à Paris (A-H2)", () => {
    const vercel = JSON.parse(lire("vercel.json")) as { regions?: string[] };
    expect(vercel.regions).toEqual(["cdg1"]);
    for (const region of vercel.regions ?? []) expect(REGIONS_EUROPE).toContain(region);
  });
});

describe("test de bout en bout SM-1", () => {
  it("existe, avec Playwright et le script test:e2e", () => {
    expect(existsSync(join(racine, "tests/e2e/parcours-sm1.spec.ts"))).toBe(true);
    expect(paquet.scripts["test:e2e"]).toBe("playwright test");
    expect(paquet.devDependencies["@playwright/test"]).toMatch(/1\.65\./);
    const configuration = lire("playwright.config.ts");
    expect(configuration).toContain('testDir: "tests/e2e"');
    expect(configuration).toContain("workers: 1");
    expect(configuration).toContain("adresseDev(process.env.E2E_ADRESSE)");
    expect(configuration).toContain("identifiantsE2e(process.env)");
  });

  it("n'est pas ramassé par Vitest (fichier *.spec.ts)", () => {
    expect(lire("vitest.config.mts")).toContain('include: ["tests/**/*.test.{ts,tsx}"]');
  });

  it("ignore les rapports et traces de Playwright", () => {
    const regles = lire(".gitignore").split(/\r?\n/).map((ligne) => ligne.trim());
    for (const dossier of ["/playwright-report/", "/test-results/", "/blob-report/", "/playwright/.cache/"]) {
      expect(regles).toContain(dossier);
    }
  });
});

describe("playwright.config.ts, réellement chargé", () => {
  // Le chargement lit `.env.local` (`process.loadEnvFile`), qui ne remplace
  // pas les valeurs déjà présentes : celles posées ici l'emportent. Tout
  // process.env est remis comme avant après chaque essai.
  const avant = { ...process.env };

  afterEach(() => {
    for (const nom of Object.keys(process.env)) if (!(nom in avant)) delete process.env[nom];
    Object.assign(process.env, avant);
  });

  async function chargerConfiguration(adresse: string) {
    process.env.E2E_EMAIL = "collaborateur.essai@exemple.fr";
    process.env.E2E_MOT_DE_PASSE = "exemple-mdp";
    process.env.E2E_ADRESSE = adresse;
    vi.resetModules();
    return (await import("../../playwright.config")).default;
  }

  it("refuse l'adresse de production", async () => {
    await expect(chargerConfiguration("https://nova-services.vercel.app")).rejects.toThrow(
      /le test ne tourne que sur dev/,
    );
  });

  it("refuse de démarrer sans identifiants", async () => {
    process.env.E2E_EMAIL = "";
    process.env.E2E_MOT_DE_PASSE = "";
    process.env.E2E_ADRESSE = "http://localhost:3000";
    vi.resetModules();
    await expect(import("../../playwright.config")).rejects.toThrow(/Identifiants du compte de test manquants/);
  });

  it("vise l'adresse locale donnée et lance next dev sur son port", async () => {
    const configuration = await chargerConfiguration("http://127.0.0.1:4000");
    expect(configuration.use?.baseURL).toBe("http://127.0.0.1:4000");
    const serveur = Array.isArray(configuration.webServer)
      ? configuration.webServer[0]
      : configuration.webServer;
    expect(serveur?.url).toBe("http://127.0.0.1:4000");
    expect(serveur?.command).toContain("--port 4000");
  });
});

describe("adresse visée par le test e2e", () => {
  it.each([undefined, "", "  "])("vaut %j : localhost:3000 par défaut", (valeur) => {
    expect(adresseDev(valeur).origin).toBe(ADRESSE_PAR_DEFAUT);
  });

  it.each(["http://localhost:3000", "http://127.0.0.1:4000", "http://localhost:3001/"])(
    "accepte l'adresse locale %s",
    (valeur) => {
      expect(() => adresseDev(valeur)).not.toThrow();
    },
  );

  it.each([
    "https://nova-services.vercel.app",
    "http://localhost.exemple.fr:3000",
    "http://192.168.1.10:3000",
    "ftp://localhost:3000",
    // `next dev` ne sert que du http, sur un port donné.
    "https://localhost:3001",
    "http://localhost",
    "http://127.0.0.1",
    "pas une adresse",
  ])("refuse %s : le test ne tourne que sur dev", (valeur) => {
    expect(() => adresseDev(valeur)).toThrow(/le test ne tourne que sur dev/);
  });
});

describe("identifiants du compte de test", () => {
  it("sont lus dans l'environnement", () => {
    expect(
      identifiantsE2e({ E2E_EMAIL: " collaborateur.essai@exemple.fr ", E2E_MOT_DE_PASSE: "exemple-mdp" }),
    ).toEqual({ email: "collaborateur.essai@exemple.fr", motDePasse: "exemple-mdp" });
  });

  it("manquants : le message dit quoi ajouter dans .env.local", () => {
    expect(() => identifiantsE2e({})).toThrow(/\.env\.local.*E2E_EMAIL=.*E2E_MOT_DE_PASSE=/);
    expect(() => identifiantsE2e({ E2E_EMAIL: "", E2E_MOT_DE_PASSE: "exemple-mdp" })).toThrow(
      /E2E_EMAIL=/,
    );
  });

  it("un mot de passe fait seulement d'espaces compte comme absent", () => {
    expect(() =>
      identifiantsE2e({ E2E_EMAIL: "collaborateur.essai@exemple.fr", E2E_MOT_DE_PASSE: "   " }),
    ).toThrow(/E2E_MOT_DE_PASSE=/);
  });

  it("le mot de passe est rendu tel quel, espaces compris", () => {
    expect(
      identifiantsE2e({ E2E_EMAIL: "collaborateur.essai@exemple.fr", E2E_MOT_DE_PASSE: " exemple mdp " })
        .motDePasse,
    ).toBe(" exemple mdp ");
  });

  it("le message n'affiche jamais une valeur déjà renseignée", () => {
    let message = "";
    try {
      identifiantsE2e({ E2E_EMAIL: "", E2E_MOT_DE_PASSE: "valeur-a-ne-pas-montrer" });
    } catch (erreur) {
      message = (erreur as Error).message;
    }
    expect(message).toMatch(/E2E_EMAIL=/);
    expect(message).not.toMatch(/E2E_MOT_DE_PASSE=/);
    expect(message).not.toContain("valeur-a-ne-pas-montrer");
  });
});

describe("aucun identifiant écrit en dur dans tests/e2e", () => {
  // Tout le dossier, sous-dossiers compris, fichiers seulement.
  const fichiers = readdirSync(join(racine, "tests/e2e"), { recursive: true, withFileTypes: true })
    .filter((entree) => entree.isFile())
    .map((entree) => {
      const chemin = join(entree.parentPath, entree.name);
      return { nom: relative(racine, chemin), contenu: readFileSync(chemin, "utf8") };
    });

  it("toutes les adresses email écrites sont fictives (@exemple.fr)", () => {
    for (const { nom, contenu } of fichiers) {
      for (const email of contenu.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []) {
        expect(email, `${nom} : adresse réelle`).toMatch(/@exemple\.fr$/);
      }
    }
  });

  it("le mot de passe vient de l'environnement, jamais d'un texte écrit", () => {
    const parcours = lire("tests/e2e/parcours-sm1.spec.ts");
    expect(parcours).toContain("identifiantsE2e(process.env)");
    expect(parcours).toContain('getByLabel("Mot de passe").fill(motDePasse)');
    for (const { nom, contenu } of fichiers) {
      expect(contenu, `${nom} : valeur E2E écrite`).not.toMatch(/E2E_(EMAIL|MOT_DE_PASSE)\s*[:=]\s*["'`]/);
    }
  });

  it("les vraies valeurs de .env.local n'y figurent pas", () => {
    const chemin = join(racine, ".env.local");
    if (!existsSync(chemin)) return;
    const env = parseEnv(readFileSync(chemin, "utf8"));
    const valeurs = [env.E2E_EMAIL, env.E2E_MOT_DE_PASSE].filter(
      (valeur): valeur is string => typeof valeur === "string" && valeur.trim() !== "",
    );
    for (const valeur of valeurs) {
      for (const { nom, contenu } of fichiers) {
        // Message sans la valeur : elle ne doit pas s'afficher.
        expect(contenu.includes(valeur.trim()), `${nom} contient un identifiant de .env.local`).toBe(false);
      }
    }
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// NFR-14 / AD-15 : `.env.example` liste toutes les variables attendues,
// avec des valeurs fictives, sans exposer de secret au navigateur.

const racine = process.cwd();

const VARIABLES_ATTENDUES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SECRET_EMPREINTE_IP",
  "SECRET_COOKIES",
] as const;

// Seules variables autorisées à être visibles dans le navigateur.
const VARIABLES_PUBLIQUES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

// Formes des vraies valeurs Supabase : elles ne doivent jamais apparaître.
const FORMES_DE_VRAIES_VALEURS = [
  /^sb_publishable_/,
  /^sb_secret_/,
  /^eyJ/, // ancien format de clé (jeton JWT)
  /^https:\/\/[a-z0-9]{20}\.supabase\.co/, // identifiant réel d'un projet
];

function lireVariables(): Map<string, string[]> {
  const contenu = readFileSync(join(racine, ".env.example"), "utf8");
  const variables = new Map<string, string[]>();
  for (const ligne of contenu.split(/\r?\n/)) {
    const propre = ligne.trim();
    if (propre === "" || propre.startsWith("#")) continue;
    const egal = propre.indexOf("=");
    expect(egal, `ligne invalide : « ${propre} »`).toBeGreaterThan(0);
    const nom = propre.slice(0, egal).trim();
    const valeur = propre.slice(egal + 1).trim();
    variables.set(nom, [...(variables.get(nom) ?? []), valeur]);
  }
  return variables;
}

describe(".env.example", () => {
  const variables = lireVariables();

  it("liste exactement les 5 variables d'AD-15, une seule fois chacune", () => {
    expect([...variables.keys()].sort()).toEqual([...VARIABLES_ATTENDUES].sort());
    for (const [nom, valeurs] of variables) {
      expect(valeurs, `${nom} est déclarée plusieurs fois`).toHaveLength(1);
    }
  });

  it("ne donne le préfixe NEXT_PUBLIC_ à aucun secret", () => {
    const publiques = [...variables.keys()].filter((nom) =>
      nom.startsWith("NEXT_PUBLIC_"),
    );
    expect(publiques.sort()).toEqual([...VARIABLES_PUBLIQUES].sort());
  });

  it("ne contient que des valeurs fictives", () => {
    for (const [nom, [valeur]] of variables) {
      expect(valeur, `${nom} n'a pas de valeur d'exemple`).not.toBe("");
      expect(valeur, `${nom} doit contenir « exemple »`).toContain("exemple");
      for (const forme of FORMES_DE_VRAIES_VALEURS) {
        expect(valeur, `${nom} ressemble à une vraie valeur`).not.toMatch(forme);
      }
    }
  });
});

describe(".gitignore", () => {
  const regles = readFileSync(join(racine, ".gitignore"), "utf8")
    .split(/\r?\n/)
    .map((ligne) => ligne.trim());

  it("ignore les fichiers .env*, sauf .env.example", () => {
    expect(regles).toContain(".env*");
    expect(regles).toContain("!.env.example");
    expect(regles.indexOf("!.env.example")).toBeGreaterThan(
      regles.lastIndexOf(".env*"),
    );
  });
});

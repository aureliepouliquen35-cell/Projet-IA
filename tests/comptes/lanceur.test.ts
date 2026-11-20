import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Lanceur des commandes d'installation (`scripts/lancer.mjs`), exécuté pour
// de vrai dans un processus à part. L'entrée est vide : la confirmation
// « oui » n'arrive jamais, donc rien n'est envoyé à Supabase (la création du
// client ne fait aucune requête).

const racine = process.cwd();
const FICHIER_ENV = ".env.test-lanceur.local";
const ADRESSE_FICHIER = "https://lanceur-essai.supabase.co";
const CLE_FICHIER = "cle-du-fichier-d-essai-du-lanceur";

const OPTIONS = ["--nom", "Sophie Martin", "--email", "sophie@exemple.fr", "--role", "Administrateur"];

function lancer(fichierEnv: string, env: Record<string, string> = {}) {
  const resultat = spawnSync(
    process.execPath,
    ["scripts/lancer.mjs", fichierEnv, "scripts/installation/creer-compte.ts", ...OPTIONS],
    { cwd: racine, input: "", encoding: "utf8", env: { ...process.env, ...env }, timeout: 60000 },
  );
  return { code: resultat.status, sortie: `${resultat.stdout}\n${resultat.stderr}` };
}

beforeAll(() => {
  writeFileSync(
    join(racine, FICHIER_ENV),
    `NEXT_PUBLIC_SUPABASE_URL=${ADRESSE_FICHIER}\nSUPABASE_SECRET_KEY=${CLE_FICHIER}\n`,
  );
});

afterAll(() => {
  rmSync(join(racine, FICHIER_ENV), { force: true });
});

describe("scripts/lancer.mjs", () => {
  it("affiche le projet du fichier, puis annule sans « oui » (sortie 1)", () => {
    const { code, sortie } = lancer(FICHIER_ENV);
    expect(sortie).toContain(`Projet Supabase visé : ${ADRESSE_FICHIER}`);
    expect(sortie).toContain("Rôle  : Administrateur");
    expect(sortie).toContain("Annulé : rien n'a été fait.");
    expect(sortie).not.toContain(CLE_FICHIER);
    expect(code).toBe(1);
  }, 60000);

  it("les valeurs du fichier l'emportent sur celles du terminal", () => {
    const { code, sortie } = lancer(FICHIER_ENV, {
      NEXT_PUBLIC_SUPABASE_URL: "https://terminal-essai.supabase.co",
      SUPABASE_SECRET_KEY: "cle-du-terminal",
    });
    expect(sortie).toContain(`Projet Supabase visé : ${ADRESSE_FICHIER}`);
    expect(sortie).not.toContain("terminal-essai");
    expect(code).toBe(1);
  }, 60000);

  it("refuse .env.example (sortie 1)", () => {
    const { code, sortie } = lancer(".env.example");
    expect(sortie).toContain("n'est pas un fichier de clés");
    expect(sortie).not.toContain("Projet Supabase visé");
    expect(code).toBe(1);
  }, 60000);

  it("refuse un fichier qui n'est pas un .env… (sortie 1)", () => {
    const { code, sortie } = lancer("package.json");
    expect(sortie).toContain("n'est pas un fichier de clés");
    expect(code).toBe(1);
  }, 60000);
});

describe("scripts/lancer.mjs — commande réservée au projet dev (story 1.8)", () => {
  it("demandes:essai avec un autre fichier que .env.local : refus, rien n'est demandé (sortie 1)", () => {
    const resultat = spawnSync(
      process.execPath,
      ["scripts/lancer.mjs", FICHIER_ENV, "scripts/essai/creer-demandes-essai.ts"],
      {
        cwd: racine,
        input: "oui\n",
        encoding: "utf8",
        // Une valeur restée dans le terminal ne compte pas : le lanceur la remplace.
        env: { ...process.env, NOVA_FICHIER_CLES: ".env.local" },
        timeout: 60000,
      },
    );
    const sortie = `${resultat.stdout}\n${resultat.stderr}`;
    expect(sortie).toContain("ne s'exécute qu'avec les clés du projet dev (.env.local)");
    expect(sortie).not.toContain("Projet Supabase visé");
    expect(resultat.status).toBe(1);
  }, 60000);
});

describe("scripts/lancer.mjs — NOVA_FICHIER_CLES", () => {
  const COMMANDE = join("tests", "comptes", ".commande-essai-fichier-cles.ts");

  beforeAll(() => {
    writeFileSync(
      join(racine, COMMANDE),
      "export default async function () {\n  process.stdout.write(`NOVA_FICHIER_CLES=${process.env.NOVA_FICHIER_CLES}\n`);\n  return 0;\n}\n",
    );
  });

  afterAll(() => {
    rmSync(join(racine, COMMANDE), { force: true });
  });

  it("vaut le chemin du fichier des clés depuis la racine du dépôt, pas une valeur du terminal", () => {
    const resultat = spawnSync(process.execPath, ["scripts/lancer.mjs", FICHIER_ENV, COMMANDE], {
      cwd: racine,
      input: "",
      encoding: "utf8",
      env: { ...process.env, NOVA_FICHIER_CLES: ".env.local" },
      timeout: 60000,
    });
    expect(resultat.stdout).toContain(`NOVA_FICHIER_CLES=${FICHIER_ENV}\n`);
    expect(resultat.status).toBe(0);
  }, 60000);
});

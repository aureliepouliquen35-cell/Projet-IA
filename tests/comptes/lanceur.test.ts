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

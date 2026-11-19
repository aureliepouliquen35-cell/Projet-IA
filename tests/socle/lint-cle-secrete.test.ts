import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// AD-9 : la clé secrète de Supabase n'existe que dans
// `src/server/supabase-secret.ts`, importable par quatre modules seulement.
// La règle ESLint d'`eslint.config.mjs` le vérifie : `npm run lint` signale
// une erreur partout ailleurs.

const MODULES_AUTORISES = ["admin", "depot", "connexion", "journal"];

let eslint: ESLint;

/** Erreurs de la règle « clé secrète » pour ce code, placé dans ce fichier. */
async function erreurs(code: string, fichier: string): Promise<string[]> {
  const [resultat] = await eslint.lintText(code, { filePath: fichier });
  return resultat.messages
    .filter((message) => message.severity === 2 && /Clé secrète \(AD-9\)/.test(message.message))
    .map((message) => `${message.ruleId} : ${message.message}`);
}

beforeAll(async () => {
  eslint = new ESLint({ cwd: process.cwd() });
  // Première vérification : ESLint charge sa configuration (plusieurs
  // secondes). Les suivantes sont immédiates.
  await eslint.lintText("export {};\n", { filePath: "src/shared/essai.ts" });
}, 120_000);

const IMPORT =
  'import { creerClientSecret } from "@/server/supabase-secret";\nexport const client = creerClientSecret();\n';

describe("import de supabase-secret", () => {
  it.each(MODULES_AUTORISES)("est permis dans src/server/%s", async (module) => {
    await expect(erreurs(IMPORT, `src/server/${module}/index.ts`)).resolves.toEqual([]);
    await expect(erreurs(IMPORT, `src/server/${module}/sous-dossier/outil.ts`)).resolves.toEqual([]);
  });

  it.each([
    "src/app/(public)/page.tsx",
    "src/app/(public)/formulaire-depot.tsx",
    "src/components/formulaire/champ.tsx",
    "src/server/actions/deposer-demande.ts",
    "src/server/lectures/demandes.ts",
    "src/server/garde/index.ts",
    "src/server/passage/index.ts",
    "src/lib/supabase/server.ts",
    "src/shared/schemas/depot.ts",
    "src/instrumentation.ts",
    "src/proxy.ts",
    "tests/depot/essai.test.ts",
  ])("est signalé comme une erreur dans %s", async (fichier) => {
    const trouvees = await erreurs(IMPORT, fichier);
    expect(trouvees).toHaveLength(1);
    expect(trouvees[0]).toMatch(/^no-restricted-imports : /);
    expect(trouvees[0]).toContain("src/server/depot");
  });

  it.each([
    ["chemin relatif", 'import { creerClientSecret } from "../supabase-secret";\nexport const c = creerClientSecret;\n'],
    ["chemin avec extension", 'import { creerClientSecret } from "@/server/supabase-secret.ts";\nexport const c = creerClientSecret;\n'],
    ["import de tout le module", 'import * as secret from "@/server/supabase-secret";\nexport const c = secret;\n'],
    ["réexport", 'export { creerClientSecret } from "@/server/supabase-secret";\n'],
    ["réexport de tout", 'export * from "@/server/supabase-secret";\n'],
    ["import dynamique", 'export const charger = () => import("@/server/supabase-secret");\n'],
    ["require", 'export const secret = require("@/server/supabase-secret");\n'],
    ["import dynamique entre accents graves", "export const charger = () => import(`@/server/supabase-secret`);\n"],
    ["require entre accents graves", "export const secret = require(`../supabase-secret`);\n"],
  ])("est signalé quelle que soit l'écriture : %s", async (_, code) => {
    const trouvees = await erreurs(code, "src/server/actions/essai.ts");
    expect(trouvees.length).toBeGreaterThanOrEqual(1);
  });

  it("ne confond pas avec les autres clients Supabase", async () => {
    const code = 'import { createClient } from "@/lib/supabase/server";\nexport const c = createClient;\n';
    await expect(erreurs(code, "src/server/lectures/demandes.ts")).resolves.toEqual([]);
  });
});

describe("lecture de SUPABASE_SECRET_KEY", () => {
  const LECTURES = [
    ["process.env.NOM", "export const cle = process.env.SUPABASE_SECRET_KEY;\n"],
    ['process.env["NOM"]', 'export const cle = process.env["SUPABASE_SECRET_KEY"];\n'],
    ["process.env[`NOM`]", "export const cle = process.env[`SUPABASE_SECRET_KEY`];\n"],
    ["déstructuration", "export const { SUPABASE_SECRET_KEY } = process.env;\n"],
    ["déstructuration renommée", "const { SUPABASE_SECRET_KEY: cle } = process.env;\nexport default cle;\n"],
  ] as const;

  it.each(LECTURES)("est permise dans src/server/supabase-secret.ts : %s", async (_, code) => {
    await expect(erreurs(code, "src/server/supabase-secret.ts")).resolves.toEqual([]);
  });

  it.each(LECTURES)("est signalée partout ailleurs : %s", async (_, code) => {
    for (const fichier of [
      "src/app/(public)/page.tsx",
      "src/server/actions/deposer-demande.ts",
      "src/lib/supabase/server.ts",
      "next.config.ts",
      // Même les modules autorisés à importer le client ne lisent pas la
      // variable eux-mêmes.
      "src/server/depot/index.ts",
      "src/server/journal/index.ts",
    ]) {
      const trouvees = await erreurs(code, fichier);
      expect(trouvees, fichier).toHaveLength(1);
      expect(trouvees[0]).toMatch(/^no-restricted-syntax : .*SUPABASE_SECRET_KEY/);
    }
  });

  it("ne signale pas le nom de la variable écrit dans un texte (message, liste de noms)", async () => {
    const code =
      'export const NOMS = ["SUPABASE_SECRET_KEY"];\nexport const message = "SUPABASE_SECRET_KEY manquante";\n';
    await expect(erreurs(code, "tests/socle/env-example.test.ts")).resolves.toEqual([]);
  });

  it("laisse lire les variables publiques", async () => {
    const code = "export const url = process.env.NEXT_PUBLIC_SUPABASE_URL;\n";
    await expect(erreurs(code, "src/lib/supabase/client.ts")).resolves.toEqual([]);
  });
});

describe("les fichiers du dépôt qui touchent à la clé secrète", () => {
  // Le dépôt entier est vérifié par `npm run lint` ; ici, seulement les
  // fichiers concernés, lus tels qu'ils sont.
  it.each([
    "src/server/supabase-secret.ts",
    "src/server/depot/index.ts",
    "src/server/journal/index.ts",
    "src/server/actions/deposer-demande.ts",
    "src/app/(public)/page.tsx",
  ])("%s respecte la règle", async (fichier) => {
    const [resultat] = await eslint.lintFiles([fichier]);
    expect(resultat.messages.filter((message) => message.severity === 2)).toEqual([]);
  }, 60_000);
});

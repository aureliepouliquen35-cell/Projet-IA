import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ---------------------------------------------------------------------------
// Clé secrète de Supabase (AD-9)
// ---------------------------------------------------------------------------
// Elle donne tous les droits sur la base. Elle n'est lue que dans
// `src/server/supabase-secret.ts`, et ce fichier n'est importable que par les
// quatre modules ci-dessous. Partout ailleurs, `npm run lint` signale une
// erreur.

const TOUS_LES_FICHIERS = ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"];

const FICHIER_CLE_SECRETE = "src/server/supabase-secret.ts";

const MODULES_AUTORISES = [
  "src/server/admin/**", // comptes (AD-6)
  "src/server/depot/**", // formulaire public
  "src/server/connexion/**", // tentatives de connexion (AD-8)
  "src/server/journal/**", // journal technique (AD-13)
];

const MESSAGE_IMPORT =
  "Clé secrète (AD-9) : `supabase-secret` n'est importable que par src/server/admin, src/server/depot, src/server/connexion et src/server/journal.";

const MESSAGE_LECTURE =
  "Clé secrète (AD-9) : SUPABASE_SECRET_KEY n'est lue que dans src/server/supabase-secret.ts.";

// `process.env.SUPABASE_SECRET_KEY`, `process.env["SUPABASE_SECRET_KEY"]`,
// process.env[`SUPABASE_SECRET_KEY`] et
// `const { SUPABASE_SECRET_KEY } = process.env`.
const LECTURES_INTERDITES = [
  {
    selector:
      ":matches(MemberExpression[property.name='SUPABASE_SECRET_KEY'], MemberExpression[property.value='SUPABASE_SECRET_KEY'], MemberExpression[property.type='TemplateLiteral'][property.quasis.0.value.raw='SUPABASE_SECRET_KEY'])",
    message: MESSAGE_LECTURE,
  },
  {
    selector:
      "ObjectPattern > Property:matches([key.name='SUPABASE_SECRET_KEY'], [key.value='SUPABASE_SECRET_KEY'])",
    message: MESSAGE_LECTURE,
  },
];

// `import("…/supabase-secret")` et `require("…/supabase-secret")`, que la
// règle `no-restricted-imports` ne voit pas — y compris quand le chemin est
// écrit entre accents graves.
const IMPORTS_DYNAMIQUES_INTERDITS = [
  {
    selector:
      ":matches(ImportExpression[source.value=/supabase-secret/], CallExpression[callee.name='require'][arguments.0.value=/supabase-secret/])",
    message: MESSAGE_IMPORT,
  },
  {
    selector:
      ":matches(ImportExpression[source.type='TemplateLiteral'][source.quasis.0.value.raw=/supabase-secret/], CallExpression[callee.name='require'][arguments.0.type='TemplateLiteral'][arguments.0.quasis.0.value.raw=/supabase-secret/])",
    message: MESSAGE_IMPORT,
  },
];

const regleCleSecrete = [
  {
    // Partout sauf dans les modules autorisés : aucun import du client secret
    // (`import … from` et `export … from`).
    name: "nova/cle-secrete/import",
    files: TOUS_LES_FICHIERS,
    ignores: MODULES_AUTORISES,
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: "supabase-secret", message: MESSAGE_IMPORT }] },
      ],
    },
  },
  {
    // Partout sauf dans le fichier du client secret : aucune lecture de la
    // variable, aucun import écrit autrement.
    name: "nova/cle-secrete/lecture",
    files: TOUS_LES_FICHIERS,
    ignores: [FICHIER_CLE_SECRETE],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...LECTURES_INTERDITES,
        ...IMPORTS_DYNAMIQUES_INTERDITS,
      ],
    },
  },
  {
    // Modules autorisés : ils importent le client secret, mais ne lisent pas
    // la variable eux-mêmes. (Cette entrée remplace la précédente pour leurs
    // fichiers : la dernière définition d'une règle l'emporte.)
    name: "nova/cle-secrete/modules-autorises",
    files: MODULES_AUTORISES,
    rules: {
      "no-restricted-syntax": ["error", ...LECTURES_INTERDITES],
    },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...regleCleSecrete,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

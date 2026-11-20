// Lanceur des commandes d'installation (story 1.5), exécutées depuis le poste.
//
//   node scripts/lancer.mjs <fichier .env> <commande .ts> [options…]
//
// Exemples : `npm run compte:creer -- --nom "…" --email … --role administrateur`
// (projet dev, `.env.local`), ou, pour la production, la même commande avec
// `.env.prod.local` (voir docs/deploiement.md).
//
// 1. Les clés sont lues dans un fichier `.env…` ignoré par git (AD-15) ; elles
//    ne sont jamais affichées.
// 2. La commande TypeScript est chargée par jiti, avec les mêmes alias que
//    les tests (vitest.config.mts) : `@/…` désigne `src/…`, et `server-only`
//    (fourni par Next.js à la compilation, absent de node_modules) est
//    remplacé par un module vide (scripts/installation/module-vide.ts).
// 3. La commande exporte par défaut une fonction qui reçoit les options et
//    renvoie le code de sortie (0 : réussite).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import { createJiti } from "jiti";

const racine = fileURLToPath(new URL("..", import.meta.url));

function arreter(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [fichierEnv, commande, ...options] = process.argv.slice(2);

if (!fichierEnv || !commande) {
  arreter("Utilisation : node scripts/lancer.mjs <fichier .env> <commande .ts> [options…]");
}

// --- Fichier des clés ------------------------------------------------------

const cheminEnv = resolve(racine, fichierEnv);
const nomEnv = basename(cheminEnv);

if (!nomEnv.startsWith(".env") || nomEnv === ".env.example") {
  arreter(
    `« ${fichierEnv} » n'est pas un fichier de clés : indiquez un fichier .env… ignoré par git (par exemple .env.local), rempli sur le modèle de .env.example.`,
  );
}

if (!existsSync(cheminEnv)) {
  arreter(
    `Fichier « ${fichierEnv} » introuvable : copiez .env.example sous ce nom, puis remplacez chaque valeur par la vraie.`,
  );
}

// Le fichier doit être ignoré par git : il ne doit jamais partir sur GitHub.
try {
  execFileSync("git", ["check-ignore", "-q", relative(racine, cheminEnv)], {
    cwd: racine,
    stdio: "ignore",
  });
} catch (erreur) {
  // Code 1 : git répond que le fichier n'est pas ignoré. Sans git (ENOENT),
  // on continue : la règle `.env*` de .gitignore suffit.
  if (erreur && erreur.status === 1) {
    arreter(`« ${fichierEnv} » n'est pas ignoré par git : les clés pourraient être publiées. Arrêt.`);
  }
}

// Les valeurs du fichier remplacent celles du terminal : une variable restée
// dans le terminal ne doit pas viser un autre projet que celui du fichier.
Object.assign(process.env, parseEnv(readFileSync(cheminEnv, "utf8")));

// --- Commande --------------------------------------------------------------

const cheminCommande = isAbsolute(commande) ? commande : resolve(racine, commande);
if (!existsSync(cheminCommande)) {
  arreter(`Commande « ${commande} » introuvable.`);
}

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": join(racine, "src"),
    "server-only": join(racine, "scripts", "installation", "module-vide.ts"),
  },
});

const charge = await jiti.import(cheminCommande);
const executer = typeof charge === "function" ? charge : charge?.default;
if (typeof executer !== "function") {
  arreter(`La commande « ${commande} » n'exporte pas de fonction par défaut.`);
}

process.exitCode = await executer(options);

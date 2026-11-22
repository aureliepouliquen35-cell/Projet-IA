import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Story 1.13 : chaque ligne de la matrice « I/O & Edge-Case » de la spec est
// vérifiée en lançant vraiment scripts/sauvegarde/sauvegarder.sh, avec de
// faux `supabase` et `psql` placés en tête du PATH, et les vrais gpg, tar,
// cmp et mktemp. Aucun accès réseau, aucune vraie base.

const racine = process.cwd();
const windows = process.platform === "win32";

/** Chemin vu par bash : sous Windows, « C:\a\b » devient « /c/a/b » (Git Bash). */
const cheminBash = (chemin: string) =>
  windows ? chemin.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, lecteur: string) => `/${lecteur.toLowerCase()}`) : chemin;

/**
 * Sous Windows, `bash` peut désigner celui de WSL (System32) : on prend celui
 * de Git for Windows, déduit de `git --exec-path` (« <git>/ucrt64/libexec/git-core »).
 */
function trouverBash(): string {
  if (!windows) return "bash";
  const resultat = spawnSync("git", ["--exec-path"], { encoding: "utf8" });
  const execPath = resultat.status === 0 ? resultat.stdout.trim() : "";
  const racineGit = execPath.replace(/[\\/][^\\/]+[\\/]libexec[\\/]git-core[\\/]?$/, "");
  const bash = join(racineGit, "bin", "bash.exe");
  if (!execPath || racineGit === execPath || !existsSync(bash)) {
    throw new Error(
      "Git Bash est introuvable (déduit de « git --exec-path ») : installez Git for Windows pour lancer ces tests.",
    );
  }
  return bash;
}

const BASH = trouverBash();

// Valeurs fictives. Le mot de passe de la base n'a que des caractères permis
// (lettres, chiffres, « . _ ~ - »).
const MDP_BASE = "MdpBase-tr3s.secret_~";
const adresse = (motDePasse: string, hote = "aws-0-eu-west-3.pooler.supabase.com", port = 5432) =>
  `postgresql://postgres.abcdefghij:${motDePasse}@${hote}:${port}/postgres`;
const URL_BONNE = adresse(MDP_BASE);
const MDP_CHIFFREMENT = "0123456789abcdef0123456789abcdef-chiffrement";
const SECRETS = [URL_BONNE, MDP_BASE, MDP_CHIFFREMENT];
// Texte d'une « demande » dans le faux export : il ne doit jamais sortir en clair.
const TEXTE_DEMANDEUR = "texte-demandeur-confidentiel";

const FAUX_SUPABASE = `#!/usr/bin/env bash
# Faux « supabase db dump » : garde ses arguments (un appel par ligne, un
# argument par tabulation), écrit un petit export selon le mode demandé.
( IFS=$'\\t'; echo "$*" ) >> "$FAUX_JOURNAL/supabase.log"
sortie=""; mode=structure
while [[ $# -gt 0 ]]; do
  case "$1" in
    -f) sortie="$2"; shift ;;
    --role-only) mode=roles ;;
    --data-only) mode=donnees ;;
  esac
  shift
done
if [[ "\${FAUX_SUPABASE:-}" == "echec_donnees" && $mode == donnees ]]; then
  echo 'COPY "public"."demandes" FROM stdin;' > "$sortie"
  echo "error: connection reset" >&2
  exit 1
fi
if [[ "\${FAUX_SUPABASE:-}" == "export_vide" && $mode == roles ]]; then
  : > "$sortie"
  exit 0
fi
case $mode in
  roles) echo 'CREATE ROLE "anon";' > "$sortie" ;;
  donnees) printf 'COPY "public"."demandes" FROM stdin;\\n${TEXTE_DEMANDEUR}\\n\\\\.\\n' > "$sortie" ;;
  structure)
    if [[ "\${FAUX_SUPABASE:-}" == "autre_base" ]]; then
      echo 'CREATE TABLE IF NOT EXISTS "public"."autre" ("id" integer);' > "$sortie"
    else
      echo 'CREATE TABLE IF NOT EXISTS "public"."demandes" ("id" uuid NOT NULL);' > "$sortie"
    fi ;;
esac
`;

const FAUX_PSQL = `#!/usr/bin/env bash
# Faux psql : garde ses arguments et le SQL reçu, échoue sur demande.
printf '%s\\n' "$@" > "$FAUX_JOURNAL/psql.args"
cat > "$FAUX_JOURNAL/psql.sql"
if [[ "\${FAUX_PSQL:-}" == "echec" ]]; then
  echo "psql: error: connection refused" >&2
  exit 2
fi
`;

// Enveloppe du vrai gpg : sur demande, le déchiffrement d'essai échoue, ou
// réussit mais rend d'autres octets que l'archive chiffrée.
const ENVELOPPE_GPG = `#!/usr/bin/env bash
if [[ " $* " == *" --decrypt "* ]]; then
  case "\${FAUX_GPG:-}" in
    echec_dechiffrement)
      echo "gpg: decryption failed: Bad session key" >&2
      exit 2 ;;
    dechiffrement_different)
      sortie=""
      while [[ $# -gt 0 ]]; do [[ "$1" == "--output" ]] && sortie="$2"; shift; done
      printf 'autre contenu' > "$sortie"
      exit 0 ;;
  esac
fi
exec "$VRAI_GPG" "$@"
`;

let dossierEssais = "";
let fauxBin = "";
let gnupgEssai = "";
let numeroEssai = 0;

// Dossiers propres à chaque essai.
let sortie = "";
let journal = "";
let temporaire = "";

type Resultat = { code: number | null; stdout: string; stderr: string };

function ecrireExecutable(chemin: string, contenu: string) {
  writeFileSync(chemin, contenu, { encoding: "utf8" });
  chmodSync(chemin, 0o755);
}

/** Lance une commande bash, avec les faux outils en tête du PATH et TMPDIR à part. */
function bash(commande: string, env: Record<string, string> = {}): Resultat {
  const base = { ...process.env };
  // Un lancement dans GitHub Actions ne doit pas déteindre sur les essais.
  for (const nom of ["GITHUB_ACTIONS", "GITHUB_OUTPUT", "GITHUB_RUN_NUMBER", "SAUVEGARDE_URL_BASE_PROD", "SAUVEGARDE_MOT_DE_PASSE"]) {
    delete base[nom];
  }
  const prelude = [
    'export VRAI_GPG="$(command -v gpg)"',
    'export PATH="$FAUX_BIN:$PATH"',
    'export TMPDIR="$ESSAI_TMPDIR"',
  ].join("; ");
  const resultat = spawnSync(BASH, ["-c", `${prelude}; ${commande}`], {
    cwd: racine,
    encoding: "utf8",
    env: {
      ...base,
      FAUX_BIN: cheminBash(fauxBin),
      FAUX_JOURNAL: cheminBash(journal),
      ESSAI_TMPDIR: cheminBash(temporaire),
      ...env,
    },
  });
  if (resultat.error) throw resultat.error;
  return { code: resultat.status, stdout: resultat.stdout, stderr: resultat.stderr };
}

function sauvegarder(action: "preparer" | "noter", argument: string, env: Record<string, string>): Resultat {
  const resultat = bash(`exec bash scripts/sauvegarde/sauvegarder.sh ${action} "$ESSAI_ARGUMENT"`, {
    ESSAI_ARGUMENT: cheminBash(argument),
    ...env,
  });
  // Hors de GitHub, aucun secret n'est jamais affiché.
  if (env.GITHUB_ACTIONS !== "true") verifierSansSecret(resultat.stdout + resultat.stderr);
  // Aucun dossier temporaire laissé derrière, quelle que soit l'issue.
  expect(readdirSync(temporaire), "dossier temporaire laissé derrière").toEqual([]);
  return resultat;
}

const preparer = (env: Record<string, string>) => sauvegarder("preparer", sortie, env);

function verifierSansSecret(texte: string) {
  for (const secret of SECRETS) expect(texte.includes(secret), "un secret est affiché").toBe(false);
}

/** Arguments de chaque appel du faux supabase, dans l'ordre. */
const appelsSupabase = () => {
  const chemin = join(journal, "supabase.log");
  return existsSync(chemin)
    ? readFileSync(chemin, "utf8")
        .trim()
        .split("\n")
        .map((ligne) => ligne.split("\t"))
    : [];
};

/** Tous les fichiers du dossier de sortie, sous-dossiers compris. */
const fichiersSortie = () =>
  existsSync(sortie)
    ? readdirSync(sortie, { recursive: true, withFileTypes: true })
        .filter((entree) => entree.isFile())
        .map((entree) => entree.name)
    : [];

const SECRETS_BONS = { SAUVEGARDE_URL_BASE_PROD: URL_BONNE, SAUVEGARDE_MOT_DE_PASSE: MDP_CHIFFREMENT };

beforeAll(() => {
  // Chemins courts : gpg-agent refuse un chemin de socket trop long (~100 caractères).
  dossierEssais = mkdtempSync(join(tmpdir(), "nsv-"));
  fauxBin = join(dossierEssais, "bin");
  gnupgEssai = join(dossierEssais, "g");
  mkdirSync(fauxBin);
  mkdirSync(gnupgEssai, { mode: 0o700 });
  ecrireExecutable(join(fauxBin, "supabase"), FAUX_SUPABASE);
  ecrireExecutable(join(fauxBin, "psql"), FAUX_PSQL);
  ecrireExecutable(join(fauxBin, "gpg"), ENVELOPPE_GPG);

  // Les vrais outils doivent exister : sinon, échec clair plutôt qu'essai sauté.
  journal = join(dossierEssais, "journal");
  temporaire = join(dossierEssais, "t");
  mkdirSync(journal);
  mkdirSync(temporaire);
  const outils = bash(
    'for outil in "$VRAI_GPG" gpgconf tar cmp mktemp; do command -v "$outil" >/dev/null || echo "$outil"; done; [[ -n "$VRAI_GPG" ]] || echo gpg',
  );
  if (outils.code !== 0 || outils.stdout.trim() !== "") {
    throw new Error(
      `Outils introuvables pour bash (${BASH}) : ${outils.stdout.trim() || outils.stderr.trim()}. Installez-les (gpg, tar, cmp, mktemp) pour lancer ces tests.`,
    );
  }
});

beforeEach(() => {
  numeroEssai += 1;
  const essai = join(dossierEssais, `e${numeroEssai}`);
  mkdirSync(essai);
  sortie = join(essai, "sortie");
  journal = join(essai, "journal");
  temporaire = join(essai, "t");
  mkdirSync(journal);
  mkdirSync(temporaire);
});

afterAll(() => {
  if (!dossierEssais) return;
  // Arrête l'agent gpg éventuellement lancé par le déchiffrement de contrôle.
  bash('gpgconf --homedir "$ESSAI_GNUPG" --kill gpg-agent >/dev/null 2>&1 || true', {
    ESSAI_GNUPG: cheminBash(gnupgEssai),
  });
  rmSync(dossierEssais, { recursive: true, force: true });
});

describe("sauvegarder.sh preparer, matrice de la spec", { timeout: 60_000 }, () => {
  it("nuit normale : un seul fichier .tar.gz.gpg, déchiffrable, sans export en clair", () => {
    const resultat = preparer(SECRETS_BONS);
    expect(resultat.code, resultat.stderr).toBe(0);
    // Trois exports, tous vers l'adresse du secret.
    const appels = appelsSupabase();
    expect(appels.map(([, , remote, f, , ...options]) => [remote, f, ...options])).toEqual([
      [`--remote=${URL_BONNE}`, "-f", "--role-only"],
      [`--remote=${URL_BONNE}`, "-f"],
      [`--remote=${URL_BONNE}`, "-f", "--data-only", "--use-copy"],
    ]);
    for (const appel of appels) expect(appel.slice(0, 2)).toEqual(["db", "dump"]);
    expect(appels.map((appel) => appel[4].split("/").pop())).toEqual(["roles.sql", "structure.sql", "donnees.sql"]);

    const fichiers = fichiersSortie();
    expect(fichiers).toHaveLength(1);
    expect(fichiers[0]).toMatch(/^sauvegarde-prod-\d{4}-\d{2}-\d{2}-\d{4}\.tar\.gz\.gpg$/);
    expect(fichiers.some((nom) => nom.endsWith(".sql"))).toBe(false);
    const fichier = join(sortie, fichiers[0]);
    // Sorties du script hors de GitHub : sur la sortie standard.
    expect(resultat.stdout).toContain(`nom=${fichiers[0].replace(/\.tar\.gz\.gpg$/, "")}`);
    expect(resultat.stdout).toContain(`fichier=${cheminBash(fichier)}`);

    const contenu = readFileSync(fichier);
    expect(contenu.includes(TEXTE_DEMANDEUR), "export en clair dans le fichier publié").toBe(false);

    // Déchiffrement avec le bon mot de passe, par un dossier de clés à part.
    const dechiffrer = (motDePasse: string) =>
      bash(
        'printf "%s" "$ESSAI_MDP" | gpg --homedir "$ESSAI_GNUPG" --batch --quiet --no-tty --no-symkey-cache --pinentry-mode loopback --passphrase-fd 0 --decrypt "$ESSAI_FICHIER" | tar -xzOf - donnees.sql',
        { ESSAI_MDP: motDePasse, ESSAI_GNUPG: cheminBash(gnupgEssai), ESSAI_FICHIER: cheminBash(fichier) },
      );
    const bon = dechiffrer(MDP_CHIFFREMENT);
    expect(bon.code, bon.stderr).toBe(0);
    expect(bon.stdout).toContain(TEXTE_DEMANDEUR);
    // Et pas avec un autre.
    expect(dechiffrer("un-autre-mot-de-passe-de-32-caracteres-au-moins").code).not.toBe(0);
  });

  it.each([
    ["SAUVEGARDE_URL_BASE_PROD", { SAUVEGARDE_URL_BASE_PROD: "", SAUVEGARDE_MOT_DE_PASSE: MDP_CHIFFREMENT }],
    ["SAUVEGARDE_MOT_DE_PASSE", { SAUVEGARDE_URL_BASE_PROD: URL_BONNE, SAUVEGARDE_MOT_DE_PASSE: "" }],
  ])("secret %s vide : arrêt avant l'export, le message nomme le secret", (nom, env) => {
    const resultat = preparer(env);
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain(`Le secret ${nom} est vide ou absent`);
    expect(appelsSupabase()).toEqual([]);
    expect(fichiersSortie()).toEqual([]);
  });

  it("mot de passe de chiffrement de moins de 32 caractères : arrêt avant l'export", () => {
    const resultat = preparer({ ...SECRETS_BONS, SAUVEGARDE_MOT_DE_PASSE: "a".repeat(31) });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toMatch(/SAUVEGARDE_MOT_DE_PASSE est trop court : il faut 32 caractères au moins/);
    expect(appelsSupabase()).toEqual([]);
    expect(fichiersSortie()).toEqual([]);
  });

  const SESSION_POOLER = /n'est pas celle du « Session pooler ».*Utilisez l'adresse « Session pooler » \(port 5432\)/;
  const FORME = /SAUVEGARDE_URL_BASE_PROD n'a pas la forme attendue/;
  it.each([
    ["connexion directe db.….supabase.co", adresse(MDP_BASE, "db.abcdefghij.supabase.co"), SESSION_POOLER],
    ["port 6543 (Transaction pooler)", adresse(MDP_BASE, undefined, 6543), SESSION_POOLER],
    ["[YOUR-DATABASE-PASSWORD] laissé", adresse("[YOUR-DATABASE-PASSWORD]"), /ne contient pas le mot de passe de la base : remplacez \[YOUR-DATABASE-PASSWORD\], crochets compris/],
    ["[YOUR-PASSWORD] laissé", adresse("[YOUR-PASSWORD]"), /ne contient pas le mot de passe de la base : remplacez \[YOUR-DATABASE-PASSWORD\], crochets compris/],
    ["crochets laissés autour du mot de passe", adresse(`[${MDP_BASE}]`), /est encore entouré de crochets \[ \] : ils font partie de ce qu'il faut remplacer/],
    ["mot de passe de la base vide", adresse(""), /ne contient pas le mot de passe de la base/],
    ["pas une adresse postgres", "https://abcdefghij.supabase.co", FORME],
    ["espace dans l'adresse", adresse(MDP_BASE).replace("/postgres", "/post gres"), FORME],
    ["retour à la ligne dans l'adresse", `${URL_BONNE}\nautre`, FORME],
    ["mot de passe de la base avec « % »", adresse("Mdp%40Base"), /contient des caractères spéciaux : dans Supabase, « Reset database password »/],
    ["mot de passe de la base avec « \\ »", adresse("Mdp\\nBase"), /contient des caractères spéciaux/],
  ])("mauvaise adresse, %s : arrêt avant l'export, avec un message", (_cas, url, message) => {
    const resultat = preparer({ ...SECRETS_BONS, SAUVEGARDE_URL_BASE_PROD: url });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toMatch(message);
    expect(appelsSupabase()).toEqual([]);
    expect(fichiersSortie()).toEqual([]);
  });

  it.each([
    ["export en échec après une écriture partielle", "echec_donnees", "L'export des données a échoué."],
    ["export vide", "export_vide", "L'export roles.sql est vide."],
  ])("%s : arrêt, rien de publié", (_cas, mode, message) => {
    const resultat = preparer({ ...SECRETS_BONS, FAUX_SUPABASE: mode });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain(message);
    expect(fichiersSortie()).toEqual([]);
  });

  it("mauvaise base, sans public.demandes : arrêt, rien de publié", () => {
    const resultat = preparer({ ...SECRETS_BONS, FAUX_SUPABASE: "autre_base" });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain("ce n'est pas la base de Nova");
    expect(appelsSupabase()).toHaveLength(3);
    expect(fichiersSortie()).toEqual([]);
  });

  it.each([
    ["déchiffrement d'essai en échec", "echec_dechiffrement"],
    ["déchiffrement d'essai qui rend d'autres octets", "dechiffrement_different"],
  ])("fichier illisible, %s : arrêt, dossier de sortie vide", (_cas, mode) => {
    const resultat = preparer({ ...SECRETS_BONS, FAUX_GPG: mode });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain("Le déchiffrement d'essai a échoué");
    expect(existsSync(sortie)).toBe(true);
    expect(fichiersSortie()).toEqual([]);
  });

  it("dans GitHub : masque le mot de passe de la base, n'affiche aucun secret, écrit les sorties", () => {
    const sorties = join(journal, "github_output");
    writeFileSync(sorties, "");
    const resultat = preparer({
      ...SECRETS_BONS,
      GITHUB_ACTIONS: "true",
      GITHUB_OUTPUT: cheminBash(sorties),
    });
    expect(resultat.code, resultat.stderr).toBe(0);

    const lignes = resultat.stdout.split(/\r?\n/);
    expect(lignes.filter((ligne) => ligne.startsWith("::add-mask::"))).toEqual([`::add-mask::${MDP_BASE}`]);
    // GitHub n'affiche pas les lignes ::add-mask:: ; partout ailleurs, aucun secret.
    const affiche = [...lignes.filter((ligne) => !ligne.startsWith("::add-mask::")), resultat.stderr].join("\n");
    verifierSansSecret(affiche);

    const fichiers = fichiersSortie();
    expect(fichiers).toHaveLength(1);
    const nom = fichiers[0].replace(/\.tar\.gz\.gpg$/, "");
    expect(readFileSync(sorties, "utf8").split(/\r?\n/).filter(Boolean)).toEqual([
      `nom=${nom}`,
      `fichier=${cheminBash(join(sortie, fichiers[0]))}`,
    ]);
    // Les sorties vont dans GITHUB_OUTPUT, pas dans le journal d'exécution.
    expect(resultat.stdout).not.toContain("nom=");
  });

  it("dans GitHub : une erreur s'affiche comme annotation ::error::", () => {
    const resultat = preparer({ SAUVEGARDE_URL_BASE_PROD: "", SAUVEGARDE_MOT_DE_PASSE: "", GITHUB_ACTIONS: "true" });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toMatch(/^::error::Le secret SAUVEGARDE_URL_BASE_PROD est vide ou absent/);
  });
});

describe("sauvegarder.sh noter", { timeout: 60_000 }, () => {
  function fichierChiffre() {
    const fichier = join(sortie, "sauvegarde-prod-2026-11-22-0217.tar.gz.gpg");
    mkdirSync(dirname(fichier), { recursive: true });
    writeFileSync(fichier, "contenu chiffré fictif");
    return fichier;
  }

  it("écrit sauvegarde_reussie par ecrire_journal, avec nom, exécution et taille", () => {
    const fichier = fichierChiffre();
    // Seule l'adresse est fournie : le mot de passe de chiffrement ne sert pas ici.
    const resultat = sauvegarder("noter", fichier, { SAUVEGARDE_URL_BASE_PROD: URL_BONNE, GITHUB_RUN_NUMBER: "12" });
    expect(resultat.code, resultat.stderr).toBe(0);

    const args = readFileSync(join(journal, "psql.args"), "utf8").split("\n");
    expect(args[0]).toBe(URL_BONNE);
    expect(args).toContain("ON_ERROR_STOP=1");
    expect(args).toContain("fichier=sauvegarde-prod-2026-11-22-0217.tar.gz.gpg");
    expect(args).toContain("execution=12");
    expect(args).toContain(`taille=${"contenu chiffré fictif".length + 1}`); // « é » tient sur 2 octets
    const sql = readFileSync(join(journal, "psql.sql"), "utf8");
    expect(sql).toContain("select public.ecrire_journal(");
    expect(sql).toContain("'info',\n  'sauvegarde_reussie',");
  });

  it("journal injoignable : la tâche échoue", () => {
    const fichier = fichierChiffre();
    const resultat = sauvegarder("noter", fichier, { SAUVEGARDE_URL_BASE_PROD: URL_BONNE, FAUX_PSQL: "echec" });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain("L'écriture de « sauvegarde_reussie » dans le journal technique a échoué");
  });

  it("refuse un fichier absent, sans appeler psql", () => {
    const resultat = sauvegarder("noter", join(sortie, "absent.tar.gz.gpg"), SECRETS_BONS);
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain("introuvable ou vide");
    expect(existsSync(join(journal, "psql.args"))).toBe(false);
  });
});

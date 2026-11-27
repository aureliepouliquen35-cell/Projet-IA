import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Story 5.1 : chaque ligne de la matrice « I/O & Edge-Case » de la spec est
// vérifiée en lançant vraiment scripts/sauvegarde/restaurer.sh, avec de faux
// `gh` et `psql` placés en tête du PATH, et les vrais gpg, tar et awk. Les
// sauvegardes d'essai sont de vraies archives chiffrées par gpg. Aucun accès
// réseau, aucune vraie base : le SQL réel n'est éprouvé qu'au premier essai
// sur dev (docs/maintenance.md).

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

// Valeurs fictives.
const MDP_PROD = "MdpProd-tr3s.secret_~";
const MDP_DEV = "MdpDev-aussi.secret_~";
const PROJET_PROD = "prodprod01";
const PROJET_DEV = "devdevdev01";
const adresse = (projet: string, motDePasse: string, hote = "aws-0-eu-west-3.pooler.supabase.com", port = 5432) =>
  `postgresql://postgres.${projet}:${motDePasse}@${hote}:${port}/postgres`;
const URL_PROD = adresse(PROJET_PROD, MDP_PROD);
const URL_DEV = adresse(PROJET_DEV, MDP_DEV);
const MDP_CHIFFREMENT = "0123456789abcdef0123456789abcdef-chiffrement";
const PHRASE = "RESTAURER LA PRODUCTION";
// Données d'une « demande » dans les faux exports : jamais affichées.
const TEXTE_DEMANDEUR = "texte-demandeur-confidentiel";
const EMAIL_DEMANDEUR = "demandeur.confidentiel@exemple.fr";
// Rien de tout cela n'apparaît jamais dans ce qu'affiche le script.
const JAMAIS_AFFICHE = [URL_PROD, URL_DEV, MDP_PROD, MDP_DEV, MDP_CHIFFREMENT, PROJET_PROD, PROJET_DEV, TEXTE_DEMANDEUR, EMAIL_DEMANDEUR];

const REPO = "exemple/nova";
const PLUS_RECENTE = "sauvegarde-prod-2026-11-27-0217";
// Colonnes rendues par `gh api … --jq` : nom, expiré, exécution, branche,
// dépôt du commit, dépôt de la tâche.
const ID_DEPOT = "4242";
const ARTEFACTS = [
  ["sauvegarde-prod-2026-11-19-0217", "true", "1001", "main", ID_DEPOT, ID_DEPOT],
  ["sauvegarde-prod-2026-11-26-0217", "false", "1002", "main", ID_DEPOT, ID_DEPOT],
  [PLUS_RECENTE, "false", "1003", "main", ID_DEPOT, ID_DEPOT],
  // Un nom plus grand, mais expiré : jamais choisi.
  ["sauvegarde-prod-2026-11-28-0217", "true", "1004", "main", ID_DEPOT, ID_DEPOT],
  // Plus grands encore, mais publiés par une autre branche ou par une copie
  // du dépôt (demande de fusion) : jamais choisis.
  ["sauvegarde-prod-2099-01-01-0000", "false", "9001", "piege", ID_DEPOT, ID_DEPOT],
  ["sauvegarde-prod-2099-01-02-0000", "false", "9002", "main", "777", ID_DEPOT],
  ["sauvegarde-prod-2099-01-03-0000", "false", "9003", "main", "null", ID_DEPOT],
]
  .map((colonnes) => colonnes.join("\t"))
  .join("\n");

const STRUCTURE_NOVA = 'CREATE TABLE IF NOT EXISTS "public"."demandes" ("id" uuid NOT NULL);\n';
// Export de données à la manière de pg_dump --data-only --use-copy : 3 demandes
// (dont une ligne de données qui commence par « COPY »), 2 lignes d'historique.
const DONNEES_NOVA = [
  "--",
  "-- PostgreSQL database dump",
  "--",
  "\\restrict AbCdEf0123456789xyz",
  "SET statement_timeout = 0;",
  "SET row_security = off;",
  "",
  'COPY "auth"."users" ("instance_id", "id", "email") FROM stdin;',
  `00000000-0000-0000-0000-000000000000\tu1\t${EMAIL_DEMANDEUR}`,
  "\\.",
  "",
  'COPY "public"."demandes" ("id", "reference", "description") FROM stdin;',
  `d1\tNOVA-2026-0001\t${TEXTE_DEMANDEUR}`,
  "d2\tNOVA-2026-0002\tdeux lignes\\nséparées",
  'COPY "public"."piege" ("id") FROM stdin;',
  "\\.",
  "",
  'COPY "public"."evenements" ("id", "demande_id", "type") FROM stdin;',
  "e1\td1\tcreation",
  "e2\td2\tcreation",
  "\\.",
  "",
  'COPY "public"."journal_technique" ("id", "evenement") FROM stdin;',
  "\\.",
  "",
  'COPY "supabase_migrations"."schema_migrations" ("version") FROM stdin;',
  "20261108201012",
  "\\.",
  "",
  // Historiques des services de Supabase : jamais chargés non plus.
  'COPY "auth"."schema_migrations" ("version") FROM stdin;',
  "historique-auth-20171026211738",
  "\\.",
  "",
  'COPY "storage"."migrations" ("id", "name") FROM stdin;',
  "0\thistorique-storage-create-migrations-table",
  "\\.",
  "",
  'COPY "realtime"."schema_migrations" ("version") FROM stdin;',
  "historique-realtime-20211116024918",
  "\\.",
  "",
  'COPY "supabase_functions"."migrations" ("version") FROM stdin;',
  "historique-functions-initial",
  "\\.",
  "",
  // Schémas gérés par Supabase, que l'export de la CLI contient aussi : ni
  // vidés, ni rechargés (le rôle postgres n'en a pas le droit, code 42501).
  'COPY "storage"."buckets" ("id", "name") FROM stdin;',
  "\\.",
  "",
  'COPY "storage"."objects" ("id", "bucket_id") FROM stdin;',
  "interne-objet-1\tinterne-seau",
  "\\.",
  "",
  'COPY "cron"."job" ("jobid", "schedule") FROM stdin;',
  "1\tinterne-planification",
  "\\.",
  "",
  'COPY "net"."http_request_queue" ("id") FROM stdin;',
  "\\.",
  "",
  "SELECT pg_catalog.setval('\"public\".\"compteurs_seq\"', 1, false);",
  "SELECT pg_catalog.setval('\"auth\".\"refresh_tokens_id_seq\"', 7, true);",
  "SELECT pg_catalog.setval('\"cron\".\"jobid_seq\"', 1, true);",
  "SELECT pg_catalog.setval('\"net\".\"http_request_queue_id_seq\"', 1, false);",
  "\\unrestrict AbCdEf0123456789xyz",
  "",
].join("\n");

const FAUX_GH = `#!/usr/bin/env bash
# Faux gh : garde ses arguments (un appel par ligne, un argument par
# tabulation) ; « api » rend la liste FAUX_ARTEFACTS, « run download » copie
# FAUX_FICHIER dans le dossier demandé.
( IFS=$'\\t'; echo "$*" ) >> "$FAUX_JOURNAL/gh.log"
case "$1" in
  api)
    if [[ "\${FAUX_GH:-}" == "echec_liste" ]]; then echo "gh: Not Found (HTTP 404)" >&2; exit 1; fi
    printf '%s\\n' "\${FAUX_ARTEFACTS:-}" ;;
  run)
    nom=""; dossier=""
    while [[ $# -gt 0 ]]; do
      case "$1" in --name) nom="$2"; shift ;; --dir) dossier="$2"; shift ;; esac
      shift
    done
    if [[ "\${FAUX_GH:-}" == "echec_telechargement" ]]; then echo "gh: no valid artifacts found to download" >&2; exit 1; fi
    mkdir -p "$dossier"
    if [[ -n "\${FAUX_FICHIER:-}" ]]; then cp "$FAUX_FICHIER" "$dossier/$nom.tar.gz.gpg"; fi ;;
esac
`;

const FAUX_PSQL = `#!/usr/bin/env bash
# Faux psql. Avec --single-transaction : la restauration (garde ses arguments
# et une copie du fichier SQL) ; sinon, le contrôle de la base visée.
if [[ " $* " == *" --single-transaction "* ]]; then
  printf '%s\\n' "$@" > "$FAUX_JOURNAL/psql-restauration.args"
  fichier=""; precedent=""
  for argument in "$@"; do [[ "$precedent" == "-f" ]] && fichier="$argument"; precedent="$argument"; done
  cp "$fichier" "$FAUX_JOURNAL/restauration.sql"
  case "\${FAUX_PSQL:-}" in
    echec_chargement)
      echo "psql:$fichier:14: ERROR:  22P02" >&2
      echo 'CONTEXT:  COPY demandes, line 1: "${TEXTE_DEMANDEUR}"' >&2
      exit 3 ;;
    comptes_differents) echo "psql:$fichier:40: ERROR:  NV001" >&2; exit 3 ;;
    table_absente) echo "psql:$fichier:3: ERROR:  42P01" >&2; exit 3 ;;
    colonne_absente) echo "psql:$fichier:9: ERROR:  42703" >&2; exit 3 ;;
    droits) echo "psql:$fichier:3: ERROR:  42501" >&2; exit 3 ;;
    droits_reglage) echo "psql:$fichier:1: ERROR:  42501" >&2; exit 3 ;;
    droits_sequence)
      ligne="$(grep -n 'refresh_tokens_id_seq' "$fichier" | cut -d: -f1)"
      echo "psql:$fichier:$ligne: ERROR:  42501" >&2; exit 3 ;;
    droits_chargement)
      ligne="$(grep -n '^d2' "$fichier" | cut -d: -f1)"
      echo "psql:$fichier:$ligne: ERROR:  42501" >&2; exit 3 ;;
    coupure) echo "psql: server closed the connection unexpectedly" >&2; exit 2 ;;
  esac
  exit 0
fi
printf '%s\\n' "$@" > "$FAUX_JOURNAL/psql-controle.args"
cat > "$FAUX_JOURNAL/controle.sql"
case "\${FAUX_PSQL:-}" in
  mot_de_passe_refuse)
    echo 'psql: error: connection to server at "aws-0-eu-west-3.pooler.supabase.com", port 5432 failed: FATAL:  password authentication failed for user "postgres.${PROJET_DEV}"' >&2
    exit 2 ;;
  injoignable) echo 'psql: error: connection to server failed: timeout expired' >&2; exit 2 ;;
  projet_inconnu) echo 'psql: error: connection to server failed: FATAL:  Tenant or user not found' >&2; exit 2 ;;
  sans_migrations) echo f ;;
  *) echo t ;;
esac
`;

let dossierEssais = "";
let fauxBin = "";
let gnupgEssai = "";
let numeroEssai = 0;
// Sauvegardes chiffrées d'essai, par nom.
const sauvegardes: Record<string, string> = {};

// Dossiers propres à chaque essai.
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
  for (const nom of Object.keys(base)) {
    if (/^(GITHUB_|RESTAURATION_|SAUVEGARDE_|GH_)/.test(nom)) delete base[nom];
  }
  const prelude = ['export PATH="$FAUX_BIN:$PATH"', 'export TMPDIR="$ESSAI_TMPDIR"'].join("; ");
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

/**
 * Crée une archive des fichiers donnés, chiffrée comme le fait sauvegarder.sh ;
 * `nonChiffre` : message OpenPGP sans chiffrement (gpg --store), que
 * `gpg --decrypt` accepte pourtant avec le code 0.
 */
function creerSauvegarde(
  nom: string,
  fichiers: Record<string, string>,
  motDePasse = MDP_CHIFFREMENT,
  sansArchive = false,
  nonChiffre = false,
) {
  const dossier = join(dossierEssais, "sauvegardes", nom);
  mkdirSync(dossier, { recursive: true });
  for (const [fichier, contenu] of Object.entries(fichiers)) writeFileSync(join(dossier, fichier), contenu);
  const sortie = join(dossierEssais, "sauvegardes", `${nom}.tar.gz.gpg`);
  const entree = sansArchive ? `"$ESSAI_DOSSIER/${Object.keys(fichiers)[0]}"` : '"$ESSAI_DOSSIER.tar.gz"';
  const resultat = bash(
    [
      sansArchive ? "true" : `tar -czf "$ESSAI_DOSSIER.tar.gz" -C "$ESSAI_DOSSIER" ${Object.keys(fichiers).join(" ")}`,
      nonChiffre
        ? `gpg --homedir "$ESSAI_GNUPG" --batch --yes --quiet --no-tty --store --output "$ESSAI_SORTIE" ${entree}`
        : `printf "%s" "$ESSAI_MDP" | gpg --homedir "$ESSAI_GNUPG" --batch --yes --quiet --no-tty --pinentry-mode loopback --passphrase-fd 0 --symmetric --cipher-algo AES256 --output "$ESSAI_SORTIE" ${entree}`,
    ].join(" && "),
    {
      ESSAI_DOSSIER: cheminBash(dossier),
      ESSAI_SORTIE: cheminBash(sortie),
      ESSAI_MDP: motDePasse,
      ESSAI_GNUPG: cheminBash(gnupgEssai),
    },
  );
  if (resultat.code !== 0) throw new Error(`Sauvegarde d'essai impossible : ${resultat.stderr}`);
  sauvegardes[nom] = sortie;
}

const SECRETS_BONS = {
  RESTAURATION_URL_BASE_DEV: URL_DEV,
  SAUVEGARDE_URL_BASE_PROD: URL_PROD,
  SAUVEGARDE_MOT_DE_PASSE: MDP_CHIFFREMENT,
};

function verifierRienDAffiche(texte: string) {
  for (const valeur of JAMAIS_AFFICHE) expect(texte.includes(valeur), `« ${valeur} » est affiché`).toBe(false);
}

/** Lance restaurer.sh ; par défaut, cible dev, bons secrets, sauvegarde normale. */
function restaurer(env: Record<string, string> = {}, sauvegarde = "normale"): Resultat {
  const resultat = bash("exec bash scripts/sauvegarde/restaurer.sh", {
    GITHUB_REPOSITORY: REPO,
    GH_TOKEN: "jeton-fictif",
    FAUX_ARTEFACTS: ARTEFACTS,
    FAUX_FICHIER: sauvegarde ? cheminBash(sauvegardes[sauvegarde]) : "",
    ...SECRETS_BONS,
    ...env,
  });
  const lignes = resultat.stdout.split(/\r?\n/);
  // GitHub n'affiche pas les lignes ::add-mask:: ; partout ailleurs, rien de secret.
  verifierRienDAffiche([...lignes.filter((ligne) => !ligne.startsWith("::add-mask::")), resultat.stderr].join("\n"));
  if (env.GITHUB_ACTIONS !== "true") expect(resultat.stdout).not.toContain("::add-mask::");
  // Aucun fichier en clair (ni dossier temporaire) laissé derrière, quelle que soit l'issue.
  expect(readdirSync(temporaire), "dossier temporaire laissé derrière").toEqual([]);
  return resultat;
}

const lireJournal = (fichier: string) => {
  const chemin = join(journal, fichier);
  return existsSync(chemin) ? readFileSync(chemin, "utf8") : null;
};
const appelsGh = () =>
  (lireJournal("gh.log") ?? "")
    .split("\n")
    .filter(Boolean)
    .map((ligne) => ligne.split("\t"));
const controleAppele = () => lireJournal("psql-controle.args") !== null;
const restaurationAppelee = () => lireJournal("psql-restauration.args") !== null;

/** Rien n'a été lancé : ni gh, ni psql. */
function verifierRienLance() {
  expect(appelsGh()).toEqual([]);
  expect(controleAppele()).toBe(false);
  expect(restaurationAppelee()).toBe(false);
}

beforeAll(() => {
  // Chemins courts : gpg-agent refuse un chemin de socket trop long (~100 caractères).
  dossierEssais = mkdtempSync(join(tmpdir(), "nrs-"));
  fauxBin = join(dossierEssais, "bin");
  gnupgEssai = join(dossierEssais, "g");
  mkdirSync(fauxBin);
  mkdirSync(gnupgEssai, { mode: 0o700 });
  ecrireExecutable(join(fauxBin, "gh"), FAUX_GH);
  ecrireExecutable(join(fauxBin, "psql"), FAUX_PSQL);

  journal = join(dossierEssais, "journal");
  temporaire = join(dossierEssais, "t");
  mkdirSync(journal);
  mkdirSync(temporaire);
  // Les vrais outils doivent exister : sinon, échec clair plutôt qu'essai sauté.
  const outils = bash('for outil in gpg gpgconf tar awk mktemp; do command -v "$outil" >/dev/null || echo "$outil"; done');
  if (outils.code !== 0 || outils.stdout.trim() !== "") {
    throw new Error(
      `Outils introuvables pour bash (${BASH}) : ${outils.stdout.trim() || outils.stderr.trim()}. Installez-les (gpg, tar, awk, mktemp) pour lancer ces tests.`,
    );
  }

  const exports = { "roles.sql": 'CREATE ROLE "anon";\n', "structure.sql": STRUCTURE_NOVA, "donnees.sql": DONNEES_NOVA };
  creerSauvegarde("normale", exports);
  creerSauvegarde("autre-mot-de-passe", exports, "un-autre-mot-de-passe-de-32-caracteres-au-moins");
  creerSauvegarde("sans-donnees", { "roles.sql": exports["roles.sql"], "structure.sql": STRUCTURE_NOVA });
  creerSauvegarde("autre-base", { ...exports, "structure.sql": 'CREATE TABLE IF NOT EXISTS "public"."autre" ("id" integer);\n' });
  creerSauvegarde("sans-copy-demandes", {
    ...exports,
    "donnees.sql": 'COPY "public"."evenements" ("id") FROM stdin;\ne1\n\\.\n',
  });
  creerSauvegarde("bloc-non-termine", { ...exports, "donnees.sql": 'COPY "public"."demandes" ("id") FROM stdin;\nd1\n' });
  creerSauvegarde("pas-une-archive", { "texte.txt": "ceci n'est pas une archive" }, MDP_CHIFFREMENT, true);
  // Archive Nova valide, mais emballée sans chiffrement : n'importe qui peut la fabriquer.
  creerSauvegarde("non-chiffree", exports, MDP_CHIFFREMENT, false, true);
  // Une dizaine de chiffrements gpg : plus de 10 s quand toute la suite tourne.
}, 120_000);

beforeEach(() => {
  numeroEssai += 1;
  const essai = join(dossierEssais, `e${numeroEssai}`);
  mkdirSync(essai);
  journal = join(essai, "journal");
  temporaire = join(essai, "t");
  mkdirSync(journal);
  mkdirSync(temporaire);
});

afterAll(() => {
  if (!dossierEssais) return;
  // Arrête l'agent gpg lancé par le chiffrement des sauvegardes d'essai.
  bash('gpgconf --homedir "$ESSAI_GNUPG" --kill gpg-agent >/dev/null 2>&1 || true', {
    ESSAI_GNUPG: cheminBash(gnupgEssai),
  });
  rmSync(dossierEssais, { recursive: true, force: true });
});

describe("restaurer.sh, matrice de la spec", { timeout: 60_000 }, () => {
  it("restauration normale sur dev : la plus récente, vider puis charger en une transaction, comptes vérifiés", () => {
    const resultat = restaurer();
    expect(resultat.code, resultat.stderr).toBe(0);
    expect(resultat.stdout).toContain(
      `Restauration réussie sur la base dev : 3 demandes et 2 lignes d'historique restaurées, depuis ${PLUS_RECENTE}.`,
    );
    expect(resultat.stdout).toMatch(/^Durée : \d+ min \d{2} s\.$/m);

    // Liste des artefacts, puis téléchargement de la plus récente non expirée.
    const appels = appelsGh();
    expect(appels).toHaveLength(2);
    expect(appels[0].slice(0, 3)).toEqual(["api", "--paginate", `repos/${REPO}/actions/artifacts?per_page=100`]);
    expect(appels[0][3]).toBe("--jq");
    // Par le numéro de l'exécution sur main qui l'a produite : les artefacts
    // 2099 d'une autre branche ou d'une copie du dépôt sont ignorés.
    expect(appels[1].slice(0, 8)).toEqual(["run", "download", "1003", "--repo", REPO, "--name", PLUS_RECENTE, "--dir"]);

    // Contrôle puis restauration, tous deux sur la base dev.
    const controle = lireJournal("psql-controle.args")!.split("\n");
    expect(controle[0]).toBe(URL_DEV);
    expect(lireJournal("controle.sql")).toContain("to_regclass('public.demandes')");
    const args = lireJournal("psql-restauration.args")!.split("\n");
    expect(args[0]).toBe(URL_DEV);
    for (const option of ["--single-transaction", "--no-psqlrc", "ON_ERROR_STOP=1", "VERBOSITY=sqlstate", "SHOW_CONTEXT=never"]) {
      expect(args).toContain(option);
    }

    const sql = lireJournal("restauration.sql")!;
    const lignes = sql.split("\n");
    // Vider exactement les tables de la sauvegarde, sauf l'historique des migrations.
    expect(lignes.filter((ligne) => ligne.startsWith("delete from "))).toEqual([
      'delete from "auth"."users";',
      'delete from "public"."demandes";',
      'delete from "public"."evenements";',
      'delete from "public"."journal_technique";',
    ]);
    // Ni l'historique de nos migrations, ni ceux des services de Supabase :
    // ni leurs en-têtes, ni leurs lignes.
    expect(sql).not.toContain("supabase_migrations");
    expect(sql).not.toContain("20261108201012");
    for (const table of ['"auth"."schema_migrations"', '"storage"."migrations"', '"realtime"."schema_migrations"', '"supabase_functions"."migrations"']) {
      expect(sql).not.toContain(table);
    }
    expect(sql).not.toContain("historique-");
    // Seules les données de Nova (public, auth) : ni tables, ni lignes, ni
    // séquences des schémas gérés par Supabase.
    for (const schema of ['"storage".', '"cron".', '"net".']) {
      expect(sql).not.toContain(schema);
    }
    expect(sql).not.toContain("interne-");
    expect(sql).toContain("SELECT pg_catalog.setval('\"public\".\"compteurs_seq\"', 1, false);");
    expect(sql).toContain("SELECT pg_catalog.setval('\"auth\".\"refresh_tokens_id_seq\"', 7, true);");
    expect(lignes.filter((ligne) => ligne.startsWith("SELECT pg_catalog.setval("))).toHaveLength(2);
    expect(sql).not.toMatch(/^\\(un)?restrict/m);
    // Chaque bloc COPY gardé est complet : autant de fins « \. » que d'en-têtes
    // (lecture avec un état, comme le script : la ligne piège est une donnée).
    let dansBloc = false;
    let entetes = 0;
    let fins = 0;
    for (const ligne of lignes) {
      if (dansBloc) {
        if (ligne === "\\.") {
          fins += 1;
          dansBloc = false;
        }
      } else if (/^COPY \S+ .*FROM stdin;$/.test(ligne)) {
        entetes += 1;
        dansBloc = true;
      }
    }
    expect(dansBloc).toBe(false);
    expect(entetes).toBe(4);
    expect(fins).toBe(entetes);
    expect(lignes.filter((ligne) => ligne === "\\.")).toHaveLength(4);
    // Ordre : réglages, vider, charger, compter.
    const position = (texte: string) => sql.indexOf(texte);
    expect(lignes[0]).toBe("set session_replication_role = replica;");
    expect(position("set row_security = off;")).toBeLessThan(position("delete from"));
    expect(position('delete from "public"."journal_technique";')).toBeLessThan(position("COPY "));
    expect(sql).toContain(`d1\tNOVA-2026-0001\t${TEXTE_DEMANDEUR}\n`);
    expect(sql).toContain('COPY "public"."piege" ("id") FROM stdin;\n\\.\n');
    expect(position("SELECT pg_catalog.setval(")).toBeLessThan(position("do $$"));
    expect(sql).toContain("if (select count(*) from public.demandes) <> 3\n     or (select count(*) from public.evenements) <> 2 then");
    expect(sql).toContain("raise exception using errcode = 'NV001'");
  });

  it("sauvegarde choisie par son nom (espaces autour ignorés)", () => {
    const resultat = restaurer({ RESTAURATION_SAUVEGARDE: "  sauvegarde-prod-2026-11-26-0217 " });
    expect(resultat.code, resultat.stderr).toBe(0);
    expect(appelsGh()[1].slice(0, 7)).toEqual(["run", "download", "1002", "--repo", REPO, "--name", "sauvegarde-prod-2026-11-26-0217"]);
    expect(resultat.stdout).toContain("depuis sauvegarde-prod-2026-11-26-0217.");
  });

  it.each([
    ["d'une autre branche", "sauvegarde-prod-2099-01-01-0000"],
    ["d'une copie du dépôt (demande de fusion)", "sauvegarde-prod-2099-01-02-0000"],
    ["d'un dépôt inconnu", "sauvegarde-prod-2099-01-03-0000"],
  ])("artefact %s, demandé par son nom : introuvable, rien de téléchargé", (_cas, nom) => {
    const resultat = restaurer({ RESTAURATION_SAUVEGARDE: nom });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain(`La sauvegarde ${nom} est introuvable`);
    expect(appelsGh()).toHaveLength(1);
    expect(restaurationAppelee()).toBe(false);
  });

  it.each([
    ["RESTAURATION_URL_BASE_DEV"],
    ["SAUVEGARDE_URL_BASE_PROD"],
    ["SAUVEGARDE_MOT_DE_PASSE"],
  ])("secret %s vide : arrêt avant tout, le message nomme le secret", (nom) => {
    const resultat = restaurer({ [nom]: "" });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain(`Le secret ${nom} est vide ou absent`);
    verifierRienLance();
  });

  it("mot de passe de chiffrement de moins de 32 caractères : arrêt avant tout", () => {
    const resultat = restaurer({ SAUVEGARDE_MOT_DE_PASSE: "a".repeat(31) });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain("SAUVEGARDE_MOT_DE_PASSE est trop court");
    verifierRienLance();
  });

  const SESSION_POOLER = /n'est pas celle du « Session pooler ».*Utilisez l'adresse « Session pooler » \(port 5432/;
  it.each([
    ["connexion directe db.….supabase.co", adresse(PROJET_DEV, MDP_DEV, `db.${PROJET_DEV}.supabase.co`), SESSION_POOLER],
    ["port 6543 (Transaction pooler)", adresse(PROJET_DEV, MDP_DEV, undefined, 6543), SESSION_POOLER],
    ["utilisateur sans identifiant de projet", URL_DEV.replace(`postgres.${PROJET_DEV}`, "postgres"), SESSION_POOLER],
    ["[YOUR-DATABASE-PASSWORD] laissé", adresse(PROJET_DEV, "[YOUR-DATABASE-PASSWORD]"), /ne contient pas le mot de passe de la base/],
    ["crochets laissés autour du mot de passe", adresse(PROJET_DEV, `[${MDP_DEV}]`), /est encore entouré de crochets/],
    ["pas une adresse postgres", "https://devdevdev01.supabase.co", /RESTAURATION_URL_BASE_DEV n'a pas la forme attendue/],
    ["retour à la ligne dans l'adresse", `${URL_DEV}\nautre`, /RESTAURATION_URL_BASE_DEV n'a pas la forme attendue/],
    ["mot de passe de la base avec « % »", adresse(PROJET_DEV, "Mdp%40Dev"), /contient des caractères spéciaux/],
  ])("mauvaise adresse dev, %s : arrêt avant tout, avec un message", (_cas, url, message) => {
    const resultat = restaurer({ RESTAURATION_URL_BASE_DEV: url });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toMatch(message);
    expect(resultat.stderr).toContain("RESTAURATION_URL_BASE_DEV");
    verifierRienLance();
  });

  it("mauvaise adresse prod (port 6543) : arrêt avant tout, même pour une restauration sur dev", () => {
    const resultat = restaurer({ SAUVEGARDE_URL_BASE_PROD: adresse(PROJET_PROD, MDP_PROD, undefined, 6543) });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toMatch(/L'adresse SAUVEGARDE_URL_BASE_PROD n'est pas celle du « Session pooler »/);
    verifierRienLance();
  });

  it.each([
    ["absente", ""],
    ["mal recopiée", "restaurer la production"],
    ["avec un mot en moins", "RESTAURER PRODUCTION"],
  ])("prod, phrase de confirmation %s : arrêt avant tout téléchargement", (_cas, confirmation) => {
    const resultat = restaurer({ RESTAURATION_CIBLE: "prod", RESTAURATION_CONFIRMATION: confirmation });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain(`recopiant exactement « ${PHRASE} »`);
    verifierRienLance();
  });

  it("prod sans nom de sauvegarde : arrêt avant tout téléchargement (la plus récente peut être l'état abîmé)", () => {
    const resultat = restaurer({ RESTAURATION_CIBLE: "prod", RESTAURATION_CONFIRMATION: PHRASE, RESTAURATION_SAUVEGARDE: "  " });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain("Pour restaurer la production, indiquez le nom de la sauvegarde voulue");
    verifierRienLance();
  });

  it("prod avec la phrase de confirmation et un nom : restaure sur l'adresse prod, sans adresse dev", () => {
    const resultat = restaurer({
      RESTAURATION_CIBLE: "prod",
      RESTAURATION_CONFIRMATION: PHRASE,
      RESTAURATION_SAUVEGARDE: PLUS_RECENTE,
      RESTAURATION_URL_BASE_DEV: "",
    });
    expect(resultat.code, resultat.stderr).toBe(0);
    expect(lireJournal("psql-controle.args")!.split("\n")[0]).toBe(URL_PROD);
    expect(lireJournal("psql-restauration.args")!.split("\n")[0]).toBe(URL_PROD);
    expect(resultat.stdout).toContain("Restauration réussie sur la base prod : 3 demandes et 2 lignes d'historique restaurées");
  });

  it("cible inconnue : arrêt avant tout", () => {
    const resultat = restaurer({ RESTAURATION_CIBLE: "preprod" });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain("La cible doit être dev ou prod");
    verifierRienLance();
  });

  it.each([
    ["même adresse", URL_PROD],
    ["même projet, autre mot de passe et autre hôte", adresse(PROJET_PROD, MDP_DEV, "aws-1-eu-west-1.pooler.supabase.com")],
    ["même projet, en majuscules", adresse(PROJET_PROD.toUpperCase(), MDP_DEV)],
  ])("l'adresse dev vise prod (%s) : arrêt avant tout", (_cas, url) => {
    const resultat = restaurer({ RESTAURATION_URL_BASE_DEV: url });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain("RESTAURATION_URL_BASE_DEV vise le même projet que SAUVEGARDE_URL_BASE_PROD");
    verifierRienLance();
  });

  it.each([
    ["nom inconnu", { RESTAURATION_SAUVEGARDE: "sauvegarde-prod-2026-10-01-0217" }, "est introuvable"],
    ["nom expiré (plus de 7 jours)", { RESTAURATION_SAUVEGARDE: "sauvegarde-prod-2026-11-19-0217" }, "a expiré (une sauvegarde est gardée 7 jours)"],
    ["aucune sauvegarde non expirée", { FAUX_ARTEFACTS: `sauvegarde-prod-2026-11-19-0217\ttrue\t1001\tmain\t${ID_DEPOT}\t${ID_DEPOT}` }, "Aucune sauvegarde disponible"],
    [
      "seulement des sauvegardes d'autres branches ou dépôts",
      { FAUX_ARTEFACTS: ARTEFACTS.split("\n").filter((ligne) => ligne.includes("2099")).join("\n") },
      "Aucune sauvegarde disponible",
    ],
    ["aucune sauvegarde du tout", { FAUX_ARTEFACTS: "" }, "Aucune sauvegarde disponible"],
    ["liste illisible", { FAUX_GH: "echec_liste" }, "La liste des sauvegardes n'a pas pu être lue"],
    ["téléchargement en échec", { FAUX_GH: "echec_telechargement" }, "Le téléchargement de la sauvegarde"],
  ])("sauvegarde introuvable, %s : arrêt, rien de restauré", (_cas, env, message) => {
    const resultat = restaurer(env);
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain(message);
    expect(restaurationAppelee()).toBe(false);
  });

  it("nom de sauvegarde mal formé : arrêt avant tout", () => {
    const resultat = restaurer({ RESTAURATION_SAUVEGARDE: "sauvegarde-prod-27-11-2026; rm -rf /" });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain("Le nom de sauvegarde n'a pas la forme attendue (sauvegarde-prod-AAAA-MM-JJ-HHMM)");
    verifierRienLance();
  });

  it("mauvais mot de passe de chiffrement : arrêt, rien de restauré", () => {
    const resultat = restaurer({}, "autre-mot-de-passe");
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain("mot de passe de chiffrement faux ou fichier abîmé");
    expect(restaurationAppelee()).toBe(false);
  });

  it("message OpenPGP non chiffré (gpg --store, pourtant accepté par gpg --decrypt) : refusé, rien de restauré", () => {
    const resultat = restaurer({}, "non-chiffree");
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain("mot de passe de chiffrement faux ou fichier abîmé");
    expect(restaurationAppelee()).toBe(false);
  });

  it.each([
    ["artefact sans fichier .tar.gz.gpg", "", /ne contient pas un fichier \.tar\.gz\.gpg/],
    ["fichier déchiffré qui n'est pas une archive", "pas-une-archive", /n'est pas une archive lisible/],
    ["archive sans les 3 exports", "sans-donnees", /ne contient pas donnees\.sql : ce n'est pas une sauvegarde de Nova/],
    ["structure sans public.demandes", "autre-base", /ne contient pas la table public\.demandes : ce n'est pas une sauvegarde de Nova/],
    ["données sans bloc public.demandes", "sans-copy-demandes", /ne contient pas les données de public\.demandes et public\.evenements/],
    ["bloc de données non terminé", "bloc-non-termine", /est incomplet/],
  ])("pas une sauvegarde de Nova, %s : arrêt, rien de restauré", (_cas, sauvegarde, message) => {
    const resultat = restaurer({}, sauvegarde);
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toMatch(message);
    expect(restaurationAppelee()).toBe(false);
  });

  it("base visée sans les migrations : arrêt avant le téléchargement, renvoi vers les migrations", () => {
    const resultat = restaurer({ FAUX_PSQL: "sans_migrations" });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain("La base dev n'a pas les tables de Nova");
    expect(resultat.stderr).toContain("appliquez d'abord les migrations (docs/deploiement.md");
    expect(appelsGh()).toEqual([]);
    expect(restaurationAppelee()).toBe(false);
  });

  it.each([
    ["mot de passe de la base refusé", "mot_de_passe_refuse", "refuse le mot de passe contenu dans RESTAURATION_URL_BASE_DEV"],
    ["base injoignable", "injoignable", "La base dev est injoignable"],
    ["projet inconnu de Supabase", "projet_inconnu", "Le projet de l'adresse RESTAURATION_URL_BASE_DEV est inconnu de Supabase"],
  ])("%s : arrêt avant le téléchargement, sans afficher le message de psql", (_cas, mode, message) => {
    const resultat = restaurer({ FAUX_PSQL: mode });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toContain(message);
    expect(resultat.stderr).not.toContain("psql:");
    expect(appelsGh()).toEqual([]);
  });

  it.each([
    ["erreur SQL au milieu du chargement", "echec_chargement", /La restauration a échoué \(code d'erreur PostgreSQL 22P02, à l'étape « chargement de la table auth\.users »\) : la restauration est annulée, la base dev est inchangée/],
    ["comptes différents", "comptes_differents", /ne compte pas 3 demandes et 2 lignes d'historique comme la sauvegarde : la restauration est annulée, la base dev est inchangée/],
    ["table absente de la base visée", "table_absente", /manque dans la base dev \(code 42P01, à l'étape « vidage de la table auth\.users »\).*Appliquez d'abord les migrations/],
    ["colonne absente de la base visée", "colonne_absente", /manque dans la base dev \(code 42703, à l'étape « [^»]+ »\).*Appliquez d'abord les migrations/],
    ["droits insuffisants au vidage", "droits", /Droits insuffisants sur la base dev \(code 42501, à l'étape « vidage de la table auth\.users »\) : la restauration est annulée, la base dev est inchangée\. L'adresse n'est pas en cause/],
    ["droits insuffisants sur un réglage", "droits_reglage", /Droits insuffisants sur la base dev \(code 42501, à l'étape « réglage session_replication_role »\)/],
    ["droits insuffisants sur une séquence", "droits_sequence", /Droits insuffisants sur la base dev \(code 42501, à l'étape « remise à jour de la séquence auth\.refresh_tokens_id_seq »\)/],
    ["droits insuffisants au chargement", "droits_chargement", /Droits insuffisants sur la base dev \(code 42501, à l'étape « chargement de la table public\.demandes »\)/],
    ["connexion coupée", "coupure", /La restauration s'est interrompue.*la base dev est inchangée/],
  ])("%s : transaction annulée, message, aucune ligne de données affichée", (_cas, mode, message) => {
    const resultat = restaurer({ FAUX_PSQL: mode });
    expect(resultat.code).toBe(1);
    expect(resultat.stderr).toMatch(message);
    expect(resultat.stderr).not.toContain("CONTEXT");
    expect(resultat.stdout).not.toContain("Restauration réussie");
  });

  it("dans GitHub : masque les deux mots de passe de base, rien d'autre de secret, erreurs en ::error::", () => {
    const resultat = restaurer({ GITHUB_ACTIONS: "true" });
    expect(resultat.code, resultat.stderr).toBe(0);
    const masques = resultat.stdout.split(/\r?\n/).filter((ligne) => ligne.startsWith("::add-mask::"));
    expect(masques).toEqual([`::add-mask::${MDP_PROD}`, `::add-mask::${MDP_DEV}`]);

    const echec = restaurer({ GITHUB_ACTIONS: "true", RESTAURATION_CIBLE: "prod" });
    expect(echec.code).toBe(1);
    expect(echec.stderr).toMatch(/^::error::Restaurer la production remplace toutes ses données/);
  });
});

// Le texte des fichiers : tâche GitHub, script et documentation.
const lire = (chemin: string) => readFileSync(join(racine, chemin), "utf8");
const sansCommentaires = (texte: string) =>
  texte
    .split(/\r?\n/)
    .filter((ligne) => !ligne.trim().startsWith("#"))
    .join("\n");
const tache = lire(".github/workflows/restauration.yml");
const script = lire("scripts/sauvegarde/restaurer.sh");
const codeTache = sansCommentaires(tache);
const codeScript = sansCommentaires(script);

describe("tâche GitHub Actions « Restaurer une sauvegarde »", () => {
  it("se lance seulement à la main, avec cible (dev par défaut), sauvegarde et confirmation", () => {
    expect(codeTache).toMatch(/^name: Restaurer une sauvegarde$/m);
    expect(codeTache).toMatch(/^on:\s*\n\s+workflow_dispatch:\s*\n\s+inputs:/m);
    expect(codeTache).not.toMatch(/^\s+(schedule|push|pull_request|workflow_run):/m);
    expect(codeTache).toMatch(/cible:\s*\n(\s+.*\n)*?\s+type: choice\s*\n\s+options:\s*\n\s+- dev\s*\n\s+- prod\s*\n\s+default: dev/);
    expect(codeTache).toMatch(/^\s+sauvegarde:\s*$/m);
    expect(codeTache).toMatch(/^\s+confirmation:\s*$/m);
    expect(tache).toContain(PHRASE);
  });

  it("a des droits minimaux (lecture du dépôt et des artefacts), une durée maximale et une seule exécution à la fois", () => {
    expect(codeTache).toMatch(/^permissions:\s*\n\s+contents: read\s*\n\s+actions: read\s*\n(?!\s)/m);
    expect(codeTache).not.toMatch(/:\s*write\b/);
    expect(codeTache).toMatch(/^concurrency:\s*\n\s+group: restauration/m);
    expect(codeTache).toMatch(/timeout-minutes: \d+/);
    expect(codeTache).toContain("runs-on: ubuntu-24.04");
    expect(codeTache).toContain("persist-credentials: false");
  });

  it("épingle chaque action par l'empreinte d'un commit et ne publie rien", () => {
    const actions = [...codeTache.matchAll(/uses:\s*(\S+)/g)].map(([, action]) => action);
    expect(actions).toEqual(["actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"]);
    expect(codeTache).not.toContain("upload-artifact");
  });

  it("passe les trois secrets et le jeton à la seule étape du script, jamais dans une commande", () => {
    for (const nom of ["RESTAURATION_URL_BASE_DEV", "SAUVEGARDE_URL_BASE_PROD", "SAUVEGARDE_MOT_DE_PASSE"]) {
      const usages = codeTache.match(new RegExp(`${nom}.*`, "g")) ?? [];
      expect(usages).toEqual([`${nom}: \${{ secrets.${nom} }}`]);
    }
    expect(codeTache).toContain("GH_TOKEN: ${{ github.token }}");
    expect(codeTache.match(/secrets\./g)).toHaveLength(3);
    expect(codeTache.match(/^\s+run:/gm)).toEqual(["        run:"]);
    expect(codeTache).toMatch(/run: bash scripts\/sauvegarde\/restaurer\.sh\s*$/);
    // Pas d'env au niveau de la tâche : l'action checkout ne voit aucun secret.
    expect(codeTache).not.toMatch(/^\s{0,4}env:/m);
    for (const [, commande] of codeTache.matchAll(/run:\s*(.*)/g)) expect(commande).not.toContain("${{");
    // Les champs saisis passent par des variables, jamais collés au script.
    expect(codeTache).toContain("RESTAURATION_CIBLE: ${{ inputs.cible }}");
    expect(codeTache).toContain("RESTAURATION_SAUVEGARDE: ${{ inputs.sauvegarde }}");
    expect(codeTache).toContain("RESTAURATION_CONFIRMATION: ${{ inputs.confirmation }}");
  });
});

describe("script scripts/sauvegarde/restaurer.sh", () => {
  it("suit les conventions de sauvegarder.sh", () => {
    expect(script.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    expect(codeScript).toContain("set -euo pipefail");
    expect(codeScript).toContain("umask 077");
    expect(codeScript).toContain(`readonly PHRASE_PRODUCTION="${PHRASE}"`);
    expect(codeScript).toContain("--passphrase-fd 3");
    expect(codeScript).toContain(`3< <(printf '%s' "$SAUVEGARDE_MOT_DE_PASSE")`);
    expect(codeScript).not.toMatch(/--passphrase(?!-fd)/);
    expect(codeScript).toContain("--no-symkey-cache");
    expect(codeScript).toContain('TEMPORAIRE="$(mktemp -d)"');
    expect(codeScript).toContain("trap nettoyer EXIT");
  });

  it("ne restaure que les données, sans journal ni structure", () => {
    expect(codeScript).not.toContain("ecrire_journal");
    expect(codeScript).not.toMatch(/-f "\$TEMPORAIRE\/exports\/(roles|structure)\.sql"/);
    expect(codeScript).not.toMatch(/\btruncate\b/i);
  });

  it("ni --dry-run, ni --debug, ni trace du shell, ni adresse écrite en dur", () => {
    for (const code of [codeTache, codeScript]) {
      expect(code).not.toMatch(/--dry-run|--debug|--log-level/);
      expect(code).not.toMatch(/\bset\s+-[a-z]*x|xtrace|bash\s+-[a-z]*x/);
    }
    for (const texte of [tache, script]) {
      for (const valeur of texte.match(/postgres(ql)?:\/\/\S+/g) ?? []) {
        expect(valeur).toBe("postgresql://utilisateur:mot-de-passe@hôte:5432/postgres)");
      }
      expect(texte).not.toMatch(/pooler\.supabase\.com/);
    }
  });
});

describe("documentation de la restauration", () => {
  const maintenance = lire("docs/maintenance.md");
  const deploiement = lire("docs/deploiement.md");

  it("docs/maintenance.md décrit la restauration, le mot de passe, la vérification mensuelle et les essais", () => {
    expect(maintenance).toMatch(/^## Restaurer une sauvegarde$/m);
    expect(maintenance).toContain("RESTAURATION_URL_BASE_DEV");
    expect(maintenance).toContain(PHRASE);
    expect(maintenance).toContain("Nova – chiffrement des sauvegardes");
    expect(maintenance).toMatch(/^### .*[Vv]érification mensuelle/m);
    expect(maintenance).toMatch(/^### Essais de restauration$/m);
    expect(maintenance).toMatch(/\| Date \| Durée \| Sauvegarde \| Résultat \|/);
    expect(maintenance).toContain("npm run compte:creer");
  });

  it("docs/deploiement.md renvoie vers docs/maintenance.md pour la restauration", () => {
    expect(deploiement).not.toContain("viendra avec l'exploitation (story 5.1)");
    expect(deploiement).toContain("(maintenance.md#restaurer-une-sauvegarde)");
  });
});

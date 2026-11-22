import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EVENEMENTS_JOURNAL } from "@/server/journal";

// Story 1.13 : la base prod est sauvegardée chaque nuit par GitHub Actions
// (AD-18, NFR-7). Le dépôt, ses journaux d'exécution et ses artefacts sont
// publics : seul le fichier chiffré est publié, et aucun secret n'est écrit
// ni affiché (AD-15). Le script se vérifie aussi avec de faux `supabase` et
// `psql` (voir la spec de la story) ; ici, on contrôle le texte des fichiers.

const racine = process.cwd();
const lire = (chemin: string) => readFileSync(join(racine, chemin), "utf8");

const tache = lire(".github/workflows/sauvegarde-nuit.yml");
const script = lire("scripts/sauvegarde/sauvegarder.sh");

/** Lignes hors commentaires : les commentaires peuvent citer ce qui est interdit. */
const sansCommentaires = (texte: string) =>
  texte
    .split(/\r?\n/)
    .filter((ligne) => !ligne.trim().startsWith("#"))
    .join("\n");

const codeTache = sansCommentaires(tache);
const codeScript = sansCommentaires(script);

describe("tâche GitHub Actions « Sauvegarde de nuit »", () => {
  it("tourne chaque nuit et peut être lancée à la main", () => {
    expect(codeTache).toMatch(/^on:\s*\n\s+schedule:\s*\n\s+- cron: "(\d+) (\d+) \* \* \*"/m);
    const [, minute, heure] = codeTache.match(/cron: "(\d+) (\d+) \* \* \*"/)!;
    // 2 h–3 h à Paris (UTC+1 en hiver, UTC+2 en été), minute non ronde.
    expect(Number(heure)).toBe(1);
    expect(Number(minute) % 5).not.toBe(0);
    expect(codeTache).toMatch(/^\s+workflow_dispatch:/m);
  });

  it("a des droits minimaux, une durée maximale et une seule exécution à la fois", () => {
    expect(codeTache).toMatch(/^permissions:\s*\n\s+contents: read\s*\n(?!\s)/m);
    expect(codeTache).not.toMatch(/:\s*write\b/);
    expect(codeTache).toMatch(/^concurrency:\s*\n\s+group: sauvegarde-nuit/m);
    expect(codeTache).toMatch(/timeout-minutes: \d+/);
    expect(codeTache).toContain("runs-on: ubuntu-24.04");
    expect(codeTache).toContain("persist-credentials: false");
  });

  it("épingle chaque action par l'empreinte complète d'un commit", () => {
    const actions = [...codeTache.matchAll(/uses:\s*(\S+)/g)].map(([, action]) => action);
    expect(actions).toHaveLength(3);
    for (const action of actions) expect(action).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    expect(actions.map((action) => action.split("@")[0])).toEqual([
      "actions/checkout",
      "supabase/setup-cli",
      "actions/upload-artifact",
    ]);
  });

  it("installe la même version de la Supabase CLI que package-lock.json", () => {
    const verrou = JSON.parse(lire("package-lock.json")) as {
      packages: Record<string, { version: string }>;
    };
    const version = verrou.packages["node_modules/supabase"].version;
    expect(version).toBe("3.0.0");
    expect(codeTache).toMatch(new RegExp(`supabase/setup-cli@\\S+.*\\n\\s+with:\\s*\\n\\s+version: ${version.replaceAll(".", "\\.")}\\s*$`, "m"));
  });

  it("publie seulement le fichier chiffré, gardé 7 jours, et échoue s'il manque", () => {
    const publication = codeTache.slice(codeTache.indexOf("actions/upload-artifact@"));
    expect(publication).toContain("path: ${{ steps.preparer.outputs.fichier }}");
    expect(publication).toContain("name: ${{ steps.preparer.outputs.nom }}");
    expect(publication).toContain("retention-days: 7");
    expect(publication).toContain("if-no-files-found: error");
    // Le script ne donne comme fichier que le .tar.gz.gpg du dossier de sortie.
    expect(codeScript).toContain('local fichier="$dossier/$nom.tar.gz.gpg"');
    expect(codeScript).toContain(`local sorties="nom=$nom"$'\\n'"fichier=$fichier"`);
    expect(codeScript).toContain('nom="sauvegarde-prod-$(TZ=Europe/Paris date +%Y-%m-%d-%H%M)"');
  });

  it("n'écrit dans le journal qu'après la publication réussie de l'artefact", () => {
    const publication = codeTache.indexOf("actions/upload-artifact@");
    const preparation = codeTache.indexOf("sauvegarder.sh preparer");
    const note = codeTache.indexOf("sauvegarder.sh noter");
    expect(preparation).toBeGreaterThan(-1);
    expect(preparation).toBeLessThan(publication);
    expect(publication).toBeLessThan(note);
    // Aucune étape ne s'exécute malgré un échec, et aucun échec n'est ignoré.
    expect(codeTache).not.toMatch(/^\s+if:/m);
    expect(codeTache).not.toMatch(/continue-on-error/);
  });

  it("reçoit les deux secrets par secrets.…, seulement dans les étapes qui en ont besoin", () => {
    // L'adresse : préparation et journal ; le mot de passe de chiffrement : préparation seule.
    for (const [nom, nombre] of [
      ["SAUVEGARDE_URL_BASE_PROD", 2],
      ["SAUVEGARDE_MOT_DE_PASSE", 1],
    ] as const) {
      const usages = codeTache.match(new RegExp(`${nom}.*`, "g")) ?? [];
      expect(usages.length).toBe(nombre);
      for (const usage of usages) expect(usage).toBe(`${nom}: \${{ secrets.${nom} }}`);
    }
    const note = codeTache.slice(codeTache.indexOf("- name: Noter la sauvegarde"));
    expect(note).not.toContain("SAUVEGARDE_MOT_DE_PASSE");
    // Pas de secrets au niveau de la tâche : les actions tierces ne les voient pas.
    expect(codeTache).not.toMatch(/^\s{0,4}env:/m);
    // Aucune valeur ${{ … }} collée dans une commande shell.
    for (const [, commande] of codeTache.matchAll(/run:\s*(.*)/g)) expect(commande).not.toContain("${{");
  });
});

describe("script scripts/sauvegarde/sauvegarder.sh", () => {
  it("s'arrête à la première erreur et crée des fichiers privés", () => {
    expect(script.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    expect(codeScript).toContain("set -euo pipefail");
    expect(codeScript).toContain("umask 077");
  });

  it("exporte rôles, structure et données avec la Supabase CLI", () => {
    expect(codeScript).toMatch(/supabase db dump --remote="\$url" -f "\S+roles\.sql" --role-only/);
    expect(codeScript).toMatch(/supabase db dump --remote="\$url" -f "\S+structure\.sql" \|\|/);
    expect(codeScript).toMatch(/supabase db dump --remote="\$url" -f "\S+donnees\.sql" --data-only --use-copy/);
    expect(codeScript).toContain(`grep -Eq 'CREATE TABLE( IF NOT EXISTS)? "?public"?\\."?demandes"?[ (]'`);
  });

  it("contrôle les secrets et l'adresse avant l'export", () => {
    const controles = codeScript.indexOf("  controler_url\n  controler_mot_de_passe\n");
    expect(controles).toBeGreaterThan(-1);
    expect(controles).toBeLessThan(codeScript.indexOf("supabase db dump"));
    // `noter` n'a besoin que de l'adresse.
    expect(codeScript.slice(codeScript.indexOf("noter() {"))).not.toContain("controler_mot_de_passe");
    expect(codeScript).toContain("readonly LONGUEUR_MINIMALE_MOT_DE_PASSE=32");
    expect(codeScript).toContain("Session pooler");
    expect(codeScript).toContain('"$port" != "5432"');
    expect(codeScript).toContain("^db\\..+\\.supabase\\.co$");
    expect(codeScript).toContain("ce n'est pas la base de Nova");
  });

  it("masque le mot de passe de la base dans les journaux d'exécution", () => {
    expect(codeScript).toContain('echo "::add-mask::$1"');
    expect(codeScript).toContain('masquer "$mot_de_passe_base"');
  });

  it("chiffre en AES256 avec le mot de passe passé par descripteur, puis vérifie le déchiffrement", () => {
    expect(codeScript).toContain("--symmetric --cipher-algo AES256");
    expect(codeScript).toMatch(/--passphrase-fd 3/);
    expect(codeScript).toContain(`3< <(printf '%s' "$SAUVEGARDE_MOT_DE_PASSE")`);
    // Jamais en argument : --passphrase suivi d'une valeur.
    expect(codeScript).not.toMatch(/--passphrase(?!-fd)/);
    expect(codeScript).toContain("--no-symkey-cache");
    expect(codeScript).toMatch(/dechiffrer "\$fichier"/);
    // Les exports en clair restent dans un dossier temporaire effacé.
    expect(codeScript).toContain('TEMPORAIRE="$(mktemp -d)"');
    expect(codeScript).toContain("trap nettoyer EXIT");
    expect(codeScript).toContain('rm -rf "$TEMPORAIRE"');
  });

  it("note la sauvegarde par ecrire_journal, sans donnée de demandeur, et échoue si le journal refuse", () => {
    expect(EVENEMENTS_JOURNAL).toContain("sauvegarde_reussie");
    expect(codeScript).toContain("select public.ecrire_journal(\n  'info',\n  'sauvegarde_reussie',");
    expect(codeScript).toContain("-v ON_ERROR_STOP=1");
    expect(codeScript).toContain("'fichier', :'fichier'");
    expect(codeScript).toContain("'execution', :'execution'");
    expect(codeScript).toContain("'taille_octets', (:'taille')::bigint");
    expect(codeScript).toContain("--no-psqlrc");
  });
});

describe("aucun secret dans les deux fichiers", () => {
  it.each([
    [".github/workflows/sauvegarde-nuit.yml", tache],
    ["scripts/sauvegarde/sauvegarder.sh", script],
  ])("%s : aucune adresse postgres… écrite en dur", (nom, texte) => {
    for (const adresse of texte.match(/postgres(ql)?:\/\/\S+/g) ?? []) {
      // Seul le modèle cité dans un message d'erreur est permis.
      expect(adresse, nom).toBe("postgresql://utilisateur:mot-de-passe@hôte:5432/postgres)");
    }
    expect(texte).not.toMatch(/pooler\.supabase\.com/);
  });

  it.each([
    [".github/workflows/sauvegarde-nuit.yml", codeTache],
    ["scripts/sauvegarde/sauvegarder.sh", codeScript],
  ])("%s : ni --dry-run, ni --debug, ni trace du shell", (nom, code) => {
    expect(code, nom).not.toMatch(/--dry-run|--debug|--log-level/);
    expect(code, nom).not.toMatch(/\bset\s+-[a-z]*x|xtrace|bash\s+-[a-z]*x/);
  });
});

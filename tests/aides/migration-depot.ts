import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Lecture de la migration « dépôt d'une demande » (story 1.3) pour les tests.
// Ces tests lisent le texte SQL : ils vérifient que la migration dit bien ce
// que les règles demandent. Son effet réel se vérifie sur la base dev
// (`npx supabase migration list --remote`, essai de `deposer_demande` dans
// une transaction annulée).

export const DOSSIER_MIGRATIONS = join(process.cwd(), "supabase", "migrations");

export const FICHIERS_DEPOT = readdirSync(DOSSIER_MIGRATIONS).filter((fichier) =>
  fichier.endsWith("_depot_demande.sql"),
);

/** Texte d'origine (pour ce qui dépend des majuscules : `NOVA-`, noms affichés). */
export const BRUT =
  FICHIERS_DEPOT.length === 1
    ? readFileSync(join(DOSSIER_MIGRATIONS, FICHIERS_DEPOT[0]), "utf8")
    : "";

/** Sans les commentaires, en minuscules. */
export const SQL = BRUT.replace(/--.*$/gm, "").toLowerCase();

export const TABLES_DEPOT = [
  "categories",
  "parametres",
  "compteurs_reference",
  "demandes",
  "evenements",
] as const;

export const SIGNATURE_DEPOSER_DEMANDE =
  "public.deposer_demande(text, text, text, text, uuid, text, text, boolean)";

/** Colonnes et contraintes d'une table : ce qui est entre `create table … (` et `);`. */
export function definitionTable(nom: string): string {
  return SQL.match(new RegExp(`create table public\\.${nom} \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? "";
}

/** Définition d'une colonne : de son nom à la virgule qui termine sa ligne. */
export function definitionColonne(table: string, colonne: string): string {
  return (
    definitionTable(table).match(new RegExp(`\\n  ${colonne} ([\\s\\S]*?)(?:,\\s*\\n  [a-z_]+ |$)`))?.[1] ?? ""
  ).replace(/\s+/g, " ");
}

/** Paramètres et corps de `deposer_demande`. */
export function fonctionDeposerDemande(): { parametres: string[]; entete: string; corps: string } {
  const [, liste = "", entete = "", corps = ""] =
    SQL.match(
      /create function public\.deposer_demande\(([\s\S]*?)\)\s*(returns[\s\S]*?)as \$\$([\s\S]*?)\$\$;/,
    ) ?? [];
  return {
    parametres: [...liste.matchAll(/(p_\w+)\s+\w+/g)].map(([, nom]) => nom),
    entete: entete.replace(/\s+/g, " "),
    corps,
  };
}

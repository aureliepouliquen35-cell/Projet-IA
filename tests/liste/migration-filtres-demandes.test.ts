import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LONGUEUR_MAXIMALE_RECHERCHE } from "@/shared/adresse-liste";
import { CANAUX, STATUTS, TAILLE_PAGE } from "@/shared/constantes";

// Migration « filtres des demandes » (story 2.1 ; FR-13, AD-7, AD-9, AD-16,
// convention « Adresse de la liste »). Ces tests lisent le texte SQL ; son
// effet réel se vérifie sur la base dev (`npx supabase migration list
// --remote`, filtres choisis à l'écran avec le compte de test).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const FICHIERS = readdirSync(DOSSIER).filter((fichier) => fichier.endsWith("_filtres_demandes.sql"));
const BRUT = FICHIERS.length === 1 ? readFileSync(join(DOSSIER, FICHIERS[0]), "utf8") : "";
/** Sans les commentaires, en minuscules. */
const SQL = BRUT.replace(/--.*$/gm, "").toLowerCase();

function fonction(nom: string): { parametres: string; entete: string; corps: string } {
  const [, parametres = "", entete = "", corps = ""] =
    SQL.match(new RegExp(`create function public\\.${nom}\\(([\\s\\S]*?)\\)\\s*(returns[\\s\\S]*?)as \\$\\$([\\s\\S]*?)\\$\\$;`)) ?? [];
  return { parametres: parametres.replace(/\s+/g, " ").trim(), entete: entete.replace(/\s+/g, " "), corps };
}

const SIGNATURE_LISTE = "public.lister_demandes(integer, integer, text, text, uuid, text)";
const SIGNATURE_CATEGORIES = "public.lister_categories()";
const CHAMPS = ["reference", "nom", "email", "entreprise", "objet"];

const echapper = (texte: string) => texte.replace(/[().]/g, "\\$&");
const liste = (valeurs: readonly string[]) => valeurs.map((v) => `'${v}'`).join(", ");

/** Droits d'exécution : `authenticated` seul. */
function droitsAuthenticatedSeul(signature: string) {
  for (const role of ["public", "anon", "service_role"]) {
    expect(SQL).toContain(`revoke execute on function ${signature} from ${role};`);
  }
  expect(SQL.match(new RegExp(`grant execute on function ${echapper(signature)} to (\\w+)`, "g"))).toEqual([
    `grant execute on function ${signature} to authenticated`,
  ]);
}

describe("fichier de migration (AD-16)", () => {
  it("est une nouvelle migration, postérieure à celles de l'epic 1 ; les anciennes sont intactes", () => {
    expect(FICHIERS).toEqual(["20261122140000_filtres_demandes.sql"]);
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(toutes.indexOf("20261122140000_filtres_demandes.sql")).toBeGreaterThan(
      toutes.indexOf("20261121200000_changer_statut.sql"),
    );
    const recherche = readFileSync(join(DOSSIER, "20261121090000_recherche_demandes.sql"), "utf8");
    expect(recherche).toContain("create function public.lister_demandes(p_page integer, p_taille integer, p_q text default null)");
  });

  it("ne crée aucune table, n'écrit rien, n'ouvre aucune table en lecture directe", () => {
    expect(SQL).not.toMatch(/create table|alter table|truncate |create policy|create index/);
    expect(SQL).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
    expect(SQL).not.toMatch(/grant select/);
    expect(SQL).not.toMatch(/insert |update |delete /);
  });

  it("supprime seulement l'ancienne lister_demandes, puis la recrée ; crée lister_categories", () => {
    expect(SQL.match(/drop /g)).toHaveLength(1);
    expect(SQL).toContain("drop function public.lister_demandes(integer, integer, text);");
    expect(SQL.indexOf("drop function")).toBeLessThan(SQL.indexOf("create function public.lister_demandes"));
    const fonctions = [...SQL.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map((m) => m[1]);
    expect(fonctions).toEqual(["lister_demandes", "lister_categories"]);
  });
});

describe("lister_demandes avec les filtres (FR-11, FR-12, FR-13)", () => {
  const { parametres, entete, corps } = fonction("lister_demandes");

  it("reçoit la page, la taille, le texte cherché et les trois filtres (facultatifs), renvoie du jsonb", () => {
    expect(parametres).toBe(
      "p_page integer, p_taille integer, p_q text default null, p_statut text default null, p_categorie uuid default null, p_canal text default null",
    );
    expect(entete).toMatch(/returns jsonb/);
  });

  it("mêmes droits : security definer, chemin vide, lecture seule, appelant vérifié d'abord (AD-7, AD-9)", () => {
    expect(entete).toContain("security definer");
    expect(entete).toContain("set search_path = ''");
    expect(entete).toContain("stable");
    expect(corps).not.toMatch(/insert |update |delete /);
    expect(corps.trim()).toMatch(/^(?:declare(?:(?!from |select )[\s\S])*?)?begin\s+perform public\.exiger_utilisateur_interne\(\);/);
  });

  it("exécutable par authenticated seul", () => {
    droitsAuthenticatedSeul(SIGNATURE_LISTE);
  });

  it("valeur inconnue ignorée : mêmes codes que l'application ; catégorie cherchée parmi celles qui existent", () => {
    expect(corps).toContain(`v_statut := case when p_statut in (${liste(STATUTS)}) then p_statut end;`);
    expect(corps).toContain(`v_canal := case when p_canal in (${liste(CANAUX)}) then p_canal end;`);
    expect(corps).toContain("select c.id into v_categorie from public.categories c where c.id = p_categorie;");
    // Une catégorie désactivée reste filtrable : aucune condition sur `active`.
    expect(corps).not.toContain("active");
  });

  it("filtres combinés (et) avec la recherche, même condition pour le total et pour la page", () => {
    const conditions = [...corps.matchAll(/where (\(v_statut is null[\s\S]*?)(?:;|order by)/g)].map(([, condition]) =>
      condition.replace(/\s+/g, " ").trim(),
    );
    const recherche = CHAMPS.map((champ) => ` or strpos(public.normaliser_recherche(d.${champ}), v_q) > 0`).join("");
    const attendue =
      "(v_statut is null or d.statut = v_statut) and (v_categorie is null or d.categorie_id = v_categorie) and (v_canal is null or d.canal = v_canal) and " +
      `( v_q = ''${recherche} )`;
    expect(conditions).toEqual([attendue, attendue]);
    expect(corps).not.toMatch(/ like | ilike |similar to|~\*/);
  });

  it(`recherche inchangée : p_q nettoyé (${LONGUEUR_MAXIMALE_RECHERCHE} caractères au plus), normalisé`, () => {
    expect(corps).toContain("v_q := regexp_replace(coalesce(p_q, ''), '^\\s+|\\s+$', '', 'g');");
    expect(corps).toContain(`v_q := regexp_replace(left(v_q, ${LONGUEUR_MAXIMALE_RECHERCHE}), '\\s+$', '');`);
    expect(corps).toContain("v_q := public.normaliser_recherche(v_q);");
  });

  it("pagination et tri inchangés ; total = nombre de résultats", () => {
    expect(corps).toMatch(/select count\(\*\)::integer\s+into v_total\s+from public\.demandes d\s+where \(v_statut is null/);
    expect(corps).toContain(`v_taille integer := least(greatest(coalesce(p_taille, ${TAILLE_PAGE}), 1), 100);`);
    expect(corps).toContain("v_derniere := greatest(1, ceil(v_total::numeric / v_taille)::integer);");
    expect(corps).toContain("v_page := least(greatest(coalesce(p_page, 1), 1), v_derniere);");
    expect(corps).toContain("limit v_taille");
    expect(corps).toContain("offset (v_page - 1) * v_taille");
    expect(corps.match(/order by (?:l|d)\.date_depot desc, (?:l|d)\.reference desc/g)).toHaveLength(2);
  });

  it("renvoie les seules colonnes de l'écran : ni email, ni téléphone, ni description", () => {
    expect(corps).toMatch(/jsonb_build_object\(\s*'total', v_total,\s*'page', v_page,\s*'demandes', v_demandes\s*\)/);
    const cles = [...corps.matchAll(/'(\w+)', l\.\w+/g)].map(([, cle]) => cle);
    expect(cles).toEqual(["id", "reference", "date_depot", "nom", "objet", "categorie", "statut"]);
    const selection = corps.match(/select d\.id,([^\n]*)\n/)?.[1] ?? "";
    expect(selection).not.toMatch(/email|telephone|description|entreprise/);
    // Seule mention du téléphone : le code du canal, dans le filtre.
    expect(corps.replace("'telephone'", "")).not.toMatch(/telephone|description/);
  });

  it("ne filtre selon personne (RM-6)", () => {
    expect(corps).not.toContain("auth.uid()");
    expect(corps).not.toMatch(/attribu|profil/);
  });
});

describe("lister_categories (FR-13)", () => {
  const { parametres, entete, corps } = fonction("lister_categories");

  it("sans paramètre, renvoie du jsonb ; security definer, chemin vide, lecture seule, appelant vérifié d'abord", () => {
    expect(parametres).toBe("");
    expect(entete).toMatch(/returns jsonb/);
    expect(entete).toContain("security definer");
    expect(entete).toContain("set search_path = ''");
    expect(entete).toContain("stable");
    expect(corps.trim()).toMatch(/^(?:declare(?:(?!from |select )[\s\S])*?)?begin\s+perform public\.exiger_utilisateur_interne\(\);/);
  });

  it("exécutable par authenticated seul", () => {
    droitsAuthenticatedSeul(SIGNATURE_CATEGORIES);
  });

  it("toutes les catégories (désactivées comprises) : id, nom, active ; actives d'abord puis par ordre", () => {
    expect(corps).toMatch(/jsonb_build_object\('id', c\.id, 'nom', c\.nom, 'active', c\.active\)\s*order by c\.active desc, c\.ordre/);
    expect(corps).toMatch(/from public\.categories c;/);
    expect(corps).not.toMatch(/where /);
    expect(corps).toContain("'[]'::jsonb");
  });
});

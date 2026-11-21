import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LONGUEUR_MAXIMALE_RECHERCHE } from "@/shared/adresse-liste";
import { TAILLE_PAGE } from "@/shared/constantes";

// Migration « recherche des demandes » (story 1.9 ; FR-12, AD-7, AD-9,
// AD-16, convention « Recherche »). Ces tests lisent le texte SQL ; son
// effet réel se vérifie sur la base dev (`npx supabase migration list
// --remote`, recherche faite à l'écran avec le compte de test).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const FICHIERS = readdirSync(DOSSIER).filter((fichier) => fichier.endsWith("_recherche_demandes.sql"));
const BRUT = FICHIERS.length === 1 ? readFileSync(join(DOSSIER, FICHIERS[0]), "utf8") : "";
/** Sans les commentaires, en minuscules. */
const SQL = BRUT.replace(/--.*$/gm, "").toLowerCase();

function fonction(nom: string): { parametres: string; entete: string; corps: string } {
  const [, parametres = "", entete = "", corps = ""] =
    SQL.match(new RegExp(`create function public\\.${nom}\\(([\\s\\S]*?)\\)\\s*(returns[\\s\\S]*?)as \\$\\$([\\s\\S]*?)\\$\\$;`)) ?? [];
  return { parametres: parametres.replace(/\s+/g, " ").trim(), entete: entete.replace(/\s+/g, " "), corps };
}

const SIGNATURE_LISTE = "public.lister_demandes(integer, integer, text)";
const SIGNATURE_NORMALISER = "public.normaliser_recherche(text)";
const CHAMPS = ["reference", "nom", "email", "entreprise", "objet"];

const echapper = (texte: string) => texte.replace(/[().]/g, "\\$&");

describe("fichier de migration (AD-16)", () => {
  it("est une nouvelle migration, postérieure à celle de la story 1.8 ; les anciennes sont intactes", () => {
    expect(FICHIERS).toEqual(["20261121090000_recherche_demandes.sql"]);
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(toutes.indexOf("20261121090000_recherche_demandes.sql")).toBeGreaterThan(
      toutes.indexOf("20261120230000_liste_demandes.sql"),
    );
    const ancienne = readFileSync(join(DOSSIER, "20261120230000_liste_demandes.sql"), "utf8");
    expect(ancienne).toContain("create function public.lister_demandes(p_page integer, p_taille integer)");
  });

  it("installe unaccent dans le schéma extensions", () => {
    expect(SQL).toContain("create extension if not exists unaccent with schema extensions;");
  });

  it("ne crée aucune table, n'écrit rien, n'ouvre aucune table en lecture directe", () => {
    expect(SQL).not.toMatch(/create table|truncate |create policy|create index/);
    expect(SQL).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
    expect(SQL).not.toMatch(/grant select/);
    expect(SQL).not.toMatch(/insert |update |delete /);
  });

  it("supprime seulement l'ancienne lister_demandes, puis la recrée", () => {
    expect(SQL.match(/drop /g)).toHaveLength(1);
    expect(SQL).toContain("drop function public.lister_demandes(integer, integer);");
    expect(SQL.indexOf("drop function")).toBeLessThan(SQL.indexOf("create function public.lister_demandes"));
    const fonctions = [...SQL.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map((m) => m[1]);
    expect(fonctions).toEqual(["normaliser_recherche", "lister_demandes"]);
  });
});

describe("normaliser_recherche (FR-12)", () => {
  const { parametres, entete, corps } = fonction("normaliser_recherche");

  it("immuable, chemin de recherche vide, sans lecture de table", () => {
    expect(parametres).toBe("p_texte text");
    expect(entete).toMatch(/returns text/);
    expect(entete).toContain("immutable");
    expect(entete).toContain("set search_path = ''");
    expect(corps).not.toMatch(/from /);
  });

  it("sans accents (dictionnaire nommé avec son schéma), puis en minuscules", () => {
    expect(corps.trim()).toBe(
      "select lower(extensions.unaccent('extensions.unaccent'::regdictionary, p_texte));",
    );
  });

  it("exécutable par personne", () => {
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE_NORMALISER} from ${role};`);
    }
    expect(SQL).not.toMatch(new RegExp(`grant execute on function ${echapper(SIGNATURE_NORMALISER)}`));
  });
});

describe("lister_demandes avec la recherche (FR-11, FR-12)", () => {
  const { parametres, entete, corps } = fonction("lister_demandes");

  it("reçoit la page, la taille et le texte cherché (facultatif), renvoie du jsonb", () => {
    expect(parametres).toBe("p_page integer, p_taille integer, p_q text default null");
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
    for (const role of ["public", "anon", "service_role"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE_LISTE} from ${role};`);
    }
    expect(SQL.match(new RegExp(`grant execute on function ${echapper(SIGNATURE_LISTE)} to (\\w+)`, "g"))).toEqual([
      `grant execute on function ${SIGNATURE_LISTE} to authenticated`,
    ]);
  });

  it(`p_q nettoyé : espaces de bord retirés, ${LONGUEUR_MAXIMALE_RECHERCHE} caractères au plus, normalisé`, () => {
    expect(corps).toContain("v_q := regexp_replace(coalesce(p_q, ''), '^\\s+|\\s+$', '', 'g');");
    expect(corps).toContain(`v_q := regexp_replace(left(v_q, ${LONGUEUR_MAXIMALE_RECHERCHE}), '\\s+$', '');`);
    expect(corps).toContain("v_q := public.normaliser_recherche(v_q);");
  });

  it("vide : pas de recherche ; sinon, champ par champ, texte cherché tel quel (strpos, pas de joker)", () => {
    const conditions = [...corps.matchAll(/where v_q = ''([\s\S]*?)(?:;|order by)/g)].map(([, suite]) =>
      [...suite.matchAll(/or strpos\(public\.normaliser_recherche\(d\.(\w+)\), v_q\) > 0/g)].map(([, champ]) => champ),
    );
    // Même condition pour le total et pour la page.
    expect(conditions).toEqual([CHAMPS, CHAMPS]);
    expect(corps).not.toMatch(/ like | ilike |similar to|~\*/);
  });

  it("total = nombre de résultats ; page ramenée entre 1 et la dernière", () => {
    expect(corps).toMatch(/select count\(\*\)::integer\s+into v_total\s+from public\.demandes d\s+where v_q = ''/);
    expect(corps).toContain(`v_taille integer := least(greatest(coalesce(p_taille, ${TAILLE_PAGE}), 1), 100);`);
    expect(corps).toContain("v_derniere := greatest(1, ceil(v_total::numeric / v_taille)::integer);");
    expect(corps).toContain("v_page := least(greatest(coalesce(p_page, 1), 1), v_derniere);");
    expect(corps).toContain("limit v_taille");
    expect(corps).toContain("offset (v_page - 1) * v_taille");
  });

  it("tri : date de dépôt puis référence, décroissantes (page et agrégat)", () => {
    expect(corps.match(/order by (?:l|d)\.date_depot desc, (?:l|d)\.reference desc/g)).toHaveLength(2);
  });

  it("renvoie les seules colonnes de l'écran : ni email, ni téléphone, ni description", () => {
    expect(corps).toMatch(/jsonb_build_object\(\s*'total', v_total,\s*'page', v_page,\s*'demandes', v_demandes\s*\)/);
    const cles = [...corps.matchAll(/'(\w+)', l\.\w+/g)].map(([, cle]) => cle);
    expect(cles).toEqual(["id", "reference", "date_depot", "nom", "objet", "categorie", "statut"]);
    const selection = corps.match(/select d\.id,([^\n]*)\n/)?.[1] ?? "";
    expect(selection).not.toMatch(/email|telephone|description|entreprise/);
    expect(corps).not.toMatch(/telephone|description/);
  });

  it("ne filtre selon personne (RM-6)", () => {
    expect(corps).not.toContain("auth.uid()");
    expect(corps).not.toMatch(/attribu|profil/);
  });
});

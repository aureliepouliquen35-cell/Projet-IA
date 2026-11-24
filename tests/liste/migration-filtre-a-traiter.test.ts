import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Migration « filtre À traiter » (story 2.2 ; FR-14, AD-5, AD-7, AD-9,
// AD-16, convention « Adresse de la liste »). Ces tests lisent le texte
// SQL ; son effet réel se vérifie sur la base dev (`npx supabase migration
// list --remote`, carte « N à traiter » cliquée avec le compte de test,
// `tests/e2e/a-traiter.spec.ts`).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const FICHIERS = readdirSync(DOSSIER).filter((fichier) => fichier.endsWith("_filtre_a_traiter.sql"));
const BRUT = FICHIERS.length === 1 ? readFileSync(join(DOSSIER, FICHIERS[0]), "utf8") : "";
/** Sans les commentaires, en minuscules. */
const SQL = BRUT.replace(/--.*$/gm, "").toLowerCase();

const [, PARAMETRES = "", ENTETE = "", CORPS = ""] =
  SQL.match(/create function public\.lister_demandes\(([\s\S]*?)\)\s*(returns[\s\S]*?)as \$\$([\s\S]*?)\$\$;/) ?? [];

const SIGNATURE = "public.lister_demandes(integer, integer, text, text, uuid, text, boolean)";
const CHAMPS = ["reference", "nom", "email", "entreprise", "objet"];

describe("fichier de migration (AD-16)", () => {
  it("est une nouvelle migration, postérieure à celle des filtres (2.1) ; les anciennes sont intactes", () => {
    expect(FICHIERS).toEqual(["20261124140000_filtre_a_traiter.sql"]);
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(toutes.indexOf("20261124140000_filtre_a_traiter.sql")).toBeGreaterThan(
      toutes.indexOf("20261122140000_filtres_demandes.sql"),
    );
    // La version de la story 2.1 reste écrite telle quelle dans son fichier.
    const filtres = readFileSync(join(DOSSIER, "20261122140000_filtres_demandes.sql"), "utf8");
    expect(filtres).toMatch(/ {2}p_canal text default null\r?\n\)\r?\nreturns jsonb/);
    expect(filtres).not.toContain("a_traiter");
  });

  it("ne crée aucune table ni index, n'écrit rien, n'ouvre aucune table en lecture directe", () => {
    expect(SQL).not.toMatch(/create table|alter table|truncate |create policy|create index/);
    expect(SQL).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
    expect(SQL).not.toMatch(/insert |update |delete /);
  });

  it("supprime seulement la version 2.1 de lister_demandes, puis la recrée ; rien d'autre", () => {
    expect(SQL.match(/drop /g)).toHaveLength(1);
    expect(SQL).toContain("drop function public.lister_demandes(integer, integer, text, text, uuid, text);");
    expect(SQL.indexOf("drop function")).toBeLessThan(SQL.indexOf("create function public.lister_demandes"));
    expect([...SQL.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map((m) => m[1])).toEqual(["lister_demandes"]);
  });
});

describe("lister_demandes avec le filtre « À traiter » (FR-14)", () => {
  it("reçoit en plus p_a_traiter (booléen, facultatif), en dernier ; renvoie du jsonb", () => {
    expect(PARAMETRES.replace(/\s+/g, " ").trim()).toBe(
      "p_page integer, p_taille integer, p_q text default null, p_statut text default null, p_categorie uuid default null, p_canal text default null, p_a_traiter boolean default null",
    );
    expect(ENTETE).toMatch(/returns jsonb/);
  });

  it("mêmes droits : security definer, chemin vide, lecture seule, appelant vérifié d'abord (AD-7, AD-9)", () => {
    expect(ENTETE).toContain("security definer");
    expect(ENTETE).toContain("set search_path = ''");
    expect(ENTETE).toContain("stable");
    expect(CORPS.trim()).toMatch(/^(?:declare(?:(?!from |select )[\s\S])*?)?begin\s+perform public\.exiger_utilisateur_interne\(\);/);
  });

  it("exécutable par authenticated seul", () => {
    for (const role of ["public", "anon", "service_role"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE} from ${role};`);
    }
    expect(SQL.match(/grant execute on function [^;]+ to (\w+)/g)).toEqual([`grant execute on function ${SIGNATURE} to authenticated`]);
  });

  it("lit la colonne a_traiter (AD-5) : jamais la condition recodée (statut, priorité)", () => {
    expect(CORPS).toContain("v_a_traiter boolean := coalesce(p_a_traiter, false);");
    expect(CORPS.match(/\(not v_a_traiter or d\.a_traiter\)/g)).toHaveLength(2);
    expect(CORPS).not.toMatch(/statut\s*=\s*'nouvelle'|statut\s*<>\s*'traitee'|priorite/);
  });

  it("combiné (et) avec les autres filtres et la recherche, même condition pour le total et pour la page", () => {
    const conditions = [...CORPS.matchAll(/where (\(v_statut is null[\s\S]*?)(?:;|order by)/g)].map(([, condition]) =>
      condition.replace(/\s+/g, " ").trim(),
    );
    const recherche = CHAMPS.map((champ) => ` or strpos(public.normaliser_recherche(d.${champ}), v_q) > 0`).join("");
    const attendue =
      "(v_statut is null or d.statut = v_statut) and (v_categorie is null or d.categorie_id = v_categorie) and (v_canal is null or d.canal = v_canal) and " +
      `(not v_a_traiter or d.a_traiter) and ( v_q = ''${recherche} )`;
    expect(conditions).toEqual([attendue, attendue]);
  });

  it("le reste est celui de la story 2.1 : filtres, recherche, pagination, tri, colonnes renvoyées", () => {
    const precedente = readFileSync(join(DOSSIER, "20261122140000_filtres_demandes.sql"), "utf8").replace(/--.*$/gm, "").toLowerCase();
    const corps21 = precedente.match(/create function public\.lister_demandes\([\s\S]*?as \$\$([\s\S]*?)\$\$;/)?.[1] ?? "";
    const sansATraiter = CORPS.replace(/\s*v_a_traiter boolean := coalesce\(p_a_traiter, false\);/, "").replace(
      /\s*and \(not v_a_traiter or d\.a_traiter\)/g,
      "",
    );
    expect(sansATraiter.replace(/\s+/g, " ")).toBe(corps21.replace(/\s+/g, " "));
  });

  it("le compteur lit la même colonne (seule définition, AD-5)", () => {
    const liste = readFileSync(join(DOSSIER, "20261120230000_liste_demandes.sql"), "utf8").replace(/--.*$/gm, "").toLowerCase();
    const compteur = liste.match(/create function public\.compter_a_traiter\([\s\S]*?as \$\$([\s\S]*?)\$\$;/)?.[1] ?? "";
    expect(compteur).toMatch(/where d\.a_traiter\b/);
  });
});

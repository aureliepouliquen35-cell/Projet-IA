import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Migration « détail d'une demande » (story 1.10 ; FR-15, FR-17, AD-3, AD-7,
// AD-9, AD-16). Ces tests lisent le texte SQL ; son effet réel se vérifie
// sur la base dev (`npx supabase migration list --remote`, détail ouvert à
// l'écran avec le compte de test).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const FICHIERS = readdirSync(DOSSIER).filter((fichier) => fichier.endsWith("_detail_demande.sql"));
const BRUT = FICHIERS.length === 1 ? readFileSync(join(DOSSIER, FICHIERS[0]), "utf8") : "";
/** Sans les commentaires, en minuscules. */
const SQL = BRUT.replace(/--.*$/gm, "").toLowerCase();

const [, PARAMETRES = "", ENTETE_BRUTE = "", CORPS = ""] =
  SQL.match(/create function public\.lire_demande\(([\s\S]*?)\)\s*(returns[\s\S]*?)as \$\$([\s\S]*?)\$\$;/) ?? [];
const ENTETE = ENTETE_BRUTE.replace(/\s+/g, " ");

const SIGNATURE = "public.lire_demande(text)";

describe("fichier de migration (AD-16)", () => {
  it("est une nouvelle migration, postérieure à celle de la story 1.9 ; les anciennes sont intactes", () => {
    expect(FICHIERS).toEqual(["20261121150000_detail_demande.sql"]);
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(toutes).toContain("20261121090000_recherche_demandes.sql");
    expect(toutes.indexOf("20261121150000_detail_demande.sql")).toBeGreaterThan(
      toutes.indexOf("20261121090000_recherche_demandes.sql"),
    );
    const recherche = readFileSync(join(DOSSIER, "20261121090000_recherche_demandes.sql"), "utf8");
    expect(recherche).toContain("create function public.lister_demandes(p_page integer, p_taille integer, p_q text default null)");
  });

  it("ne crée aucune table, n'écrit rien, n'ouvre aucune table en lecture directe", () => {
    expect(SQL).not.toMatch(/create table|alter table|drop |truncate |create policy/);
    expect(SQL).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
    expect(SQL).not.toMatch(/grant select/);
    expect(SQL).not.toMatch(/insert |update |delete /);
  });

  it("une seule fonction, lire_demande, et l'index de l'historique", () => {
    const fonctions = [...SQL.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map((m) => m[1]);
    expect(fonctions).toEqual(["lire_demande"]);
    expect(SQL.match(/create index/g)).toHaveLength(1);
    expect(SQL).toMatch(
      /create index evenements_demande_id_date_creation\s+on public\.evenements \(demande_id, date_creation\);/,
    );
  });
});

describe("lire_demande (FR-15, FR-17)", () => {
  it("reçoit la référence, renvoie du jsonb", () => {
    expect(PARAMETRES.trim()).toBe("p_reference text");
    expect(ENTETE).toMatch(/returns jsonb/);
  });

  it("mêmes droits que lister_demandes : security definer, chemin vide, lecture seule, appelant vérifié d'abord (AD-7, AD-9)", () => {
    expect(ENTETE).toContain("security definer");
    expect(ENTETE).toContain("set search_path = ''");
    expect(ENTETE).toContain("stable");
    expect(CORPS).not.toMatch(/insert |update |delete /);
    expect(CORPS.trim()).toMatch(/^(?:declare(?:(?!from |select )[\s\S])*?)?begin\s+perform public\.exiger_utilisateur_interne\(\);/);
  });

  it("exécutable par authenticated seul", () => {
    for (const role of ["public", "anon", "service_role"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE} from ${role};`);
    }
    expect(SQL.match(/grant execute on function [^;]+/g)).toEqual([
      `grant execute on function ${SIGNATURE} to authenticated`,
    ]);
  });

  it("cherche la référence en majuscules ; aucune ligne : null", () => {
    expect(CORPS).toContain("where d.reference = upper(p_reference);");
    expect(CORPS).toMatch(/into v_demande\s+from public\.demandes d\s+join public\.categories c on c\.id = d\.categorie_id/);
    expect(CORPS).toMatch(/return v_demande;\s*end;/);
  });

  it("renvoie tous les champs du détail, la catégorie par son nom", () => {
    const cles = [...CORPS.matchAll(/'(\w+)', [a-z]\.\w+/g)].map(([, cle]) => cle);
    expect(cles).toEqual([
      "id",
      "reference",
      "nom",
      "email",
      "telephone",
      "entreprise",
      "objet",
      "description",
      "categorie",
      "canal",
      "statut",
      "date_depot",
      "type",
      "auteur",
      "date",
    ]);
    expect(CORPS).toContain("'categorie', c.nom");
    expect(CORPS).toContain("'auteur', e.auteur_libelle");
    expect(CORPS).toContain("'date', e.date_creation");
  });

  it("historique de la demande seule, du plus ancien au plus récent (date puis id), [] s'il est vide", () => {
    expect(CORPS).toMatch(/order by e\.date_creation, e\.id\s*\)\s*from public\.evenements e\s+where e\.demande_id = d\.id/);
    expect(CORPS).toMatch(/'evenements', coalesce\([\s\S]*'\[\]'::jsonb\s*\)/);
  });

  it("ne filtre selon personne (RM-6)", () => {
    expect(CORPS).not.toContain("auth.uid()");
    expect(CORPS).not.toMatch(/attribu|profil/);
  });
});

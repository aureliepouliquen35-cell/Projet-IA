import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { TAILLE_PAGE } from "@/shared/constantes";

// Migration « liste des demandes » (story 1.8 ; AD-5, AD-7, AD-9, AD-16).
// Ces tests lisent le texte SQL ; son effet réel se vérifie sur la base dev
// (`npx supabase migration list --remote`, liste affichée avec le compte de
// test).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const FICHIERS = readdirSync(DOSSIER).filter((fichier) => fichier.endsWith("_liste_demandes.sql"));
const BRUT = FICHIERS.length === 1 ? readFileSync(join(DOSSIER, FICHIERS[0]), "utf8") : "";
/** Sans les commentaires, en minuscules. */
const SQL = BRUT.replace(/--.*$/gm, "").toLowerCase();

function fonction(nom: string): { parametres: string; entete: string; corps: string } {
  const [, parametres = "", entete = "", corps = ""] =
    SQL.match(new RegExp(`create function public\\.${nom}\\(([\\s\\S]*?)\\)\\s*(returns[\\s\\S]*?)as \\$\\$([\\s\\S]*?)\\$\\$;`)) ?? [];
  return { parametres: parametres.replace(/\s+/g, " ").trim(), entete: entete.replace(/\s+/g, " "), corps };
}

const SIGNATURE_GARDE = "public.exiger_utilisateur_interne()";
const SIGNATURE_COMPTEUR = "public.compter_a_traiter()";
const SIGNATURE_LISTE = "public.lister_demandes(integer, integer)";

const echapper = (texte: string) => texte.replace(/[().]/g, "\\$&");

describe("fichier de migration", () => {
  it("est une nouvelle migration, postérieure à celle de la story 1.7 (AD-16)", () => {
    expect(FICHIERS).toEqual(["20261120230000_liste_demandes.sql"]);
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(toutes).toContain("20261120200000_mot_de_passe.sql");
    expect(toutes.indexOf("20261120230000_liste_demandes.sql")).toBeGreaterThan(
      toutes.indexOf("20261120200000_mot_de_passe.sql"),
    );
  });

  it("ne crée aucune table, ne supprime rien, n'ouvre aucune table en lecture directe", () => {
    expect(SQL).not.toMatch(/create table|drop |truncate |create policy/);
    expect(SQL).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
    expect(SQL).not.toMatch(/grant select/);
    expect(SQL).not.toMatch(/insert |update |delete /);
  });

  it("trois fonctions", () => {
    const fonctions = [...SQL.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map((m) => m[1]);
    expect(fonctions).toEqual(["exiger_utilisateur_interne", "compter_a_traiter", "lister_demandes"]);
  });
});

describe("à traiter : une seule définition, dans la base (AD-5)", () => {
  it("colonne générée : Nouvelle, ou Urgente non Traitée", () => {
    const colonne = SQL.match(/alter table public\.demandes\s+add column a_traiter([\s\S]*?);/)?.[1] ?? "";
    expect(colonne.replace(/\s+/g, " ")).toBe(
      " boolean not null generated always as ( statut = 'nouvelle' or (priorite = 'urgente' and statut <> 'traitee') ) stored",
    );
  });

  it("le compteur la lit, sans redire la règle", () => {
    const { corps } = fonction("compter_a_traiter");
    expect(corps).toContain("where d.a_traiter");
    expect(corps).not.toMatch(/'nouvelle'|'urgente'|'traitee'/);
  });
});

describe("index de la liste (NFR-13)", () => {
  it("date de dépôt puis référence, décroissantes", () => {
    expect(SQL).toMatch(/create index demandes_date_depot_reference\s+on public\.demandes \(date_depot desc, reference desc\);/);
  });

  it("index partiel des demandes à traiter", () => {
    expect(SQL).toMatch(/create index demandes_a_traiter\s+on public\.demandes \(date_depot desc, reference desc\)\s+where a_traiter;/);
  });
});

describe("droits (AD-9)", () => {
  it.each(["exiger_utilisateur_interne", "compter_a_traiter", "lister_demandes"])(
    "%s : security definer, chemin de recherche vide, lecture seule",
    (nom) => {
      const { entete, corps } = fonction(nom);
      expect(entete).toContain("security definer");
      expect(entete).toContain("set search_path = ''");
      expect(entete).toContain("stable");
      expect(corps).not.toMatch(/insert |update |delete /);
    },
  );

  it.each([SIGNATURE_COMPTEUR, SIGNATURE_LISTE])("%s : exécutable par authenticated seul", (signature) => {
    for (const role of ["public", "anon", "service_role"]) {
      expect(SQL).toContain(`revoke execute on function ${signature} from ${role};`);
    }
    expect(SQL).toContain(`grant execute on function ${signature} to authenticated;`);
    expect(SQL.match(new RegExp(`grant execute on function ${echapper(signature)} to (\\w+)`, "g"))).toHaveLength(1);
  });

  it("exiger_utilisateur_interne : exécutable par personne", () => {
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE_GARDE} from ${role};`);
    }
    expect(SQL).not.toMatch(new RegExp(`grant execute on function ${echapper(SIGNATURE_GARDE)}`));
  });
});

describe("exiger_utilisateur_interne (AD-7)", () => {
  const { parametres, entete, corps } = fonction("exiger_utilisateur_interne");

  it("sans paramètre : la personne est celle de la session (auth.uid)", () => {
    expect(parametres).toBe("");
    expect(entete).toMatch(/returns uuid/);
    expect(corps).toContain("v_id uuid := auth.uid();");
  });

  it("refuse NV201 sans session, sans profil actif, ou avec un mot de passe à choisir", () => {
    expect(corps).toContain("v_id is null or not exists");
    expect(corps).toContain("from public.profils p");
    expect(corps).toContain("p.id = v_id");
    expect(corps).toContain("and p.actif");
    expect(corps).toContain("and not p.doit_changer_mdp");
    expect(corps).toContain("errcode = 'nv201'");
  });

  it.each(["compter_a_traiter", "lister_demandes"])("%s la vérifie en premier", (nom) => {
    const { corps } = fonction(nom);
    // Les déclarations ne lisent aucune table ; la première instruction est la vérification.
    expect(corps.trim()).toMatch(/^(?:declare(?:(?!from |select )[\s\S])*?)?begin\s+perform public\.exiger_utilisateur_interne\(\);/);
  });
});

describe("lister_demandes (FR-11)", () => {
  const { parametres, entete, corps } = fonction("lister_demandes");

  it("reçoit la page et la taille, renvoie du jsonb", () => {
    expect(parametres).toBe("p_page integer, p_taille integer");
    expect(entete).toMatch(/returns jsonb/);
  });

  it(`taille ramenée entre 1 et 100 (${TAILLE_PAGE} par défaut), page entre 1 et la dernière`, () => {
    expect(corps).toContain(`v_taille integer := least(greatest(coalesce(p_taille, ${TAILLE_PAGE}), 1), 100);`);
    expect(corps).toContain("v_derniere := greatest(1, ceil(v_total::numeric / v_taille)::integer);");
    expect(corps).toContain("v_page := least(greatest(coalesce(p_page, 1), 1), v_derniere);");
    expect(corps).toContain("limit v_taille");
    expect(corps).toContain("offset (v_page - 1) * v_taille");
  });

  it("tri : date de dépôt puis référence, décroissantes (page et agrégat)", () => {
    expect(corps.match(/order by (?:l|d)\.date_depot desc, (?:l|d)\.reference desc/g)).toHaveLength(2);
  });

  it("renvoie { total, page, demandes } avec les seules colonnes de l'écran", () => {
    expect(corps).toMatch(/jsonb_build_object\(\s*'total', v_total,\s*'page', v_page,\s*'demandes', v_demandes\s*\)/);
    const cles = [...corps.matchAll(/'(\w+)', l\.\w+/g)].map(([, cle]) => cle);
    expect(cles).toEqual(["id", "reference", "date_depot", "nom", "objet", "categorie", "statut"]);
    expect(corps).not.toMatch(/email|telephone|description|entreprise/);
    expect(corps).toContain("coalesce(");
    expect(corps).toContain("'[]'::jsonb");
  });

  it("le nom de la catégorie vient de la table des catégories", () => {
    expect(corps).toContain("join public.categories c on c.id = d.categorie_id");
    expect(corps).toContain("c.nom as categorie");
  });
});

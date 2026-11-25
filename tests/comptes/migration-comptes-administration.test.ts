import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Migration « comptes de l'administration » (story 3.1 ; FR-24, RM-7, AD-7,
// AD-9, AD-16). Ces tests lisent le texte SQL ; son effet réel se vérifie
// sur la base dev (`npx supabase migration list --remote`, page « Comptes »
// ouverte avec le compte administrateur puis avec le compte collaborateur).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const FICHIERS = readdirSync(DOSSIER).filter((fichier) => fichier.endsWith("_comptes_administration.sql"));
const BRUT = FICHIERS.length === 1 ? readFileSync(join(DOSSIER, FICHIERS[0]), "utf8") : "";
/** Sans les commentaires, en minuscules. */
const SQL = BRUT.replace(/--.*$/gm, "").toLowerCase();

function fonction(nom: string): { parametres: string; entete: string; corps: string } {
  const [, parametres = "", entete = "", corps = ""] =
    SQL.match(new RegExp(`create function public\\.${nom}\\(([\\s\\S]*?)\\)\\s*(returns[\\s\\S]*?)as \\$\\$([\\s\\S]*?)\\$\\$;`)) ?? [];
  return { parametres: parametres.trim(), entete: entete.replace(/\s+/g, " "), corps };
}

const SIGNATURE_GARDE = "public.exiger_administrateur()";
const SIGNATURE_LISTE = "public.lister_comptes()";

describe("fichier de migration (AD-16)", () => {
  it("est une nouvelle migration, postérieure à celle du filtre « À traiter » (2.2) ; les anciennes sont intactes", () => {
    expect(FICHIERS).toEqual(["20261124160000_comptes_administration.sql"]);
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(toutes.indexOf("20261124160000_comptes_administration.sql")).toBeGreaterThan(
      toutes.indexOf("20261124140000_filtre_a_traiter.sql"),
    );
    // La garde des utilisateurs internes (story 1.8) reste écrite telle quelle.
    const liste = readFileSync(join(DOSSIER, "20261120230000_liste_demandes.sql"), "utf8");
    expect(liste).not.toContain("exiger_administrateur");
  });

  it("ne crée ni table, ni index, ni règle ; n'écrit rien ; ne supprime rien ; n'ouvre aucune table", () => {
    expect(SQL).not.toMatch(/create table|alter table|create index|create policy|truncate |drop /);
    expect(SQL).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
    expect(SQL).not.toMatch(/insert |update |delete /);
  });

  it("deux fonctions : exiger_administrateur, puis lister_comptes", () => {
    expect([...SQL.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map((m) => m[1])).toEqual([
      "exiger_administrateur",
      "lister_comptes",
    ]);
  });
});

describe("exiger_administrateur (AD-7, AD-9)", () => {
  const { parametres, entete, corps } = fonction("exiger_administrateur");

  it("sans paramètre, renvoie l'identifiant ; security definer, chemin vide, lecture seule", () => {
    expect(parametres).toBe("");
    expect(entete).toContain("returns uuid");
    expect(entete).toContain("security definer");
    expect(entete).toContain("set search_path = ''");
    expect(entete).toContain("stable");
  });

  it("l'appelant vient de la session (auth.uid()), son rôle et son état de profils", () => {
    expect(corps).toContain("v_id uuid := auth.uid();");
    const condition = corps.match(/if ([\s\S]*?) then/)?.[1].replace(/\s+/g, " ").trim();
    expect(condition).toBe(
      "v_id is null or not exists ( select 1 from public.profils p where p.id = v_id and p.actif and not p.doit_changer_mdp and p.role = 'administrateur' )",
    );
    expect(corps).not.toMatch(/jwt|user_metadata|app_metadata|raw_/);
  });

  it("refus NV202, sinon l'identifiant", () => {
    expect(corps).toMatch(/raise exception '[^']*'\s+using errcode = 'nv202';/);
    expect(corps).toMatch(/return v_id;/);
  });

  it("NV202 n'est pris par aucune autre migration, sauf modifier_compte (story 3.4) qui revérifie l'auteur", () => {
    const autres = readdirSync(DOSSIER).filter(
      (f) => f.endsWith(".sql") && f !== FICHIERS[0] && f !== "20261125090000_desactiver_compte.sql",
    );
    for (const fichier of autres) {
      expect(readFileSync(join(DOSSIER, fichier), "utf8").toLowerCase(), fichier).not.toContain("'nv202'");
    }
  });

  it("exécutable par personne : seules les fonctions de la base l'appellent", () => {
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE_GARDE} from ${role};`);
    }
    expect(SQL).not.toMatch(/grant execute on function public\.exiger_administrateur/);
  });
});

describe("lister_comptes (FR-24, écran A1)", () => {
  const { parametres, entete, corps } = fonction("lister_comptes");

  it("sans paramètre, renvoie du jsonb ; security definer, chemin vide, lecture seule", () => {
    expect(parametres).toBe("");
    expect(entete).toContain("returns jsonb");
    expect(entete).toContain("security definer");
    expect(entete).toContain("set search_path = ''");
    expect(entete).toContain("stable");
  });

  it("vérifie d'abord l'appelant (administrateur actif), avant toute lecture", () => {
    expect(corps.trim()).toMatch(/^begin\s+perform public\.exiger_administrateur\(\);/);
  });

  it("renvoie seulement id, nom, email, rôle et état : jamais de mot de passe ni d'empreinte", () => {
    const champs = [...corps.matchAll(/'(\w+)', p\.(\w+)/g)].map(([, cle, colonne]) => `${cle}=${colonne}`);
    expect(champs).toEqual(["id=id", "nom=nom", "email=email", "role=role", "actif=actif"]);
    expect(corps).not.toMatch(/mdp_temporaires|empreinte|doit_changer_mdp|auth\.users|password/);
  });

  it("tous les comptes, désactivés compris, triés par nom (sans accents ni majuscules) puis email", () => {
    expect(corps).toMatch(/from public\.profils p\s*\)/);
    expect(corps).not.toMatch(/where/);
    expect(corps.replace(/\s+/g, " ")).toContain(
      "order by public.normaliser_recherche(p.nom), p.nom, lower(p.email)",
    );
  });

  it("aucun profil : tableau vide plutôt que null", () => {
    expect(corps).toMatch(/'\[\]'::jsonb/);
    expect(corps).toContain("coalesce(");
  });

  it("exécutable par authenticated seul", () => {
    for (const role of ["public", "anon", "service_role"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE_LISTE} from ${role};`);
    }
    expect(SQL.match(/grant execute on function [^;]+ to (\w+)/g)).toEqual([
      `grant execute on function ${SIGNATURE_LISTE} to authenticated`,
    ]);
  });
});

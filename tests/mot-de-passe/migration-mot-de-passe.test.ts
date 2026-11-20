import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LONGUEUR_MINIMALE_MOT_DE_PASSE } from "@/shared/constantes";

// Migration « mot de passe » (story 1.7 ; AD-6, AD-9, AD-16). Ces tests
// lisent le texte SQL ; son effet réel se vérifie sur la base dev
// (`npx supabase migration list --remote`, changement du mot de passe avec le
// compte de test).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const FICHIERS = readdirSync(DOSSIER).filter((fichier) => fichier.endsWith("_mot_de_passe.sql"));
const BRUT = FICHIERS.length === 1 ? readFileSync(join(DOSSIER, FICHIERS[0]), "utf8") : "";
/** Sans les commentaires, en minuscules. */
const SQL = BRUT.replace(/--.*$/gm, "").toLowerCase();

function fonction(nom: string): { parametres: string; entete: string; corps: string } {
  const [, parametres = "", entete = "", corps = ""] =
    SQL.match(new RegExp(`create function public\\.${nom}\\(([\\s\\S]*?)\\)\\s*(returns[\\s\\S]*?)as \\$\\$([\\s\\S]*?)\\$\\$;`)) ?? [];
  return { parametres: parametres.replace(/\s+/g, " ").trim(), entete: entete.replace(/\s+/g, " "), corps };
}

const SIGNATURE_COMPARAISON = "public.est_mot_de_passe_temporaire(uuid, text)";
const SIGNATURE_FIN = "public.terminer_changement_mdp(uuid, text)";

describe("fichier de migration", () => {
  it("est une nouvelle migration, postérieure à celles des stories 1.5 et 1.6 (AD-16)", () => {
    expect(FICHIERS).toEqual(["20261120200000_mot_de_passe.sql"]);
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    const position = toutes.indexOf("20261120200000_mot_de_passe.sql");
    expect(position).toBeGreaterThan(toutes.indexOf("20261120090000_comptes.sql"));
    expect(position).toBeGreaterThan(toutes.indexOf("20261120120000_connexion.sql"));
    expect(toutes).toContain("20261120120000_connexion.sql");
  });

  it("ne crée ni ne modifie aucune table, ne supprime aucun objet", () => {
    expect(SQL).not.toMatch(/create table|alter table|drop |truncate /);
    expect(SQL).not.toMatch(/create policy|grant [a-z, ]+ on table/);
  });

  it("deux fonctions seulement", () => {
    const fonctions = [...SQL.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map((m) => m[1]);
    expect(fonctions).toEqual(["est_mot_de_passe_temporaire", "terminer_changement_mdp"]);
  });
});

describe("droits (AD-9)", () => {
  it.each([SIGNATURE_COMPARAISON, SIGNATURE_FIN])("%s : exécutable par service_role seul", (signature) => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(SQL).toContain(`revoke execute on function ${signature} from ${role};`);
    }
    expect(SQL).toContain(`grant execute on function ${signature} to service_role;`);
    const grants = SQL.match(new RegExp(`grant execute on function ${signature.replace(/[().]/g, "\\$&")} to (\\w+)`, "g"));
    expect(grants).toHaveLength(1);
  });

  it.each(["est_mot_de_passe_temporaire", "terminer_changement_mdp"])(
    "%s : security definer, chemin de recherche vide",
    (nom) => {
      const { entete } = fonction(nom);
      expect(entete).toContain("security definer");
      expect(entete).toContain("set search_path = ''");
    },
  );
});

describe("est_mot_de_passe_temporaire (AD-6)", () => {
  const { parametres, entete, corps } = fonction("est_mot_de_passe_temporaire");

  it("reçoit le compte et le mot de passe, renvoie un booléen, ne modifie rien", () => {
    expect(parametres).toBe("p_id uuid, p_mdp text");
    expect(entete).toMatch(/returns boolean/);
    expect(entete).toContain("stable");
    expect(corps).not.toMatch(/insert|update|delete/);
  });

  it("compare l'empreinte bcrypt du compte, sans jamais la renvoyer", () => {
    expect(corps).toContain("from public.mdp_temporaires m");
    expect(corps).toContain("m.profil_id = p_id");
    expect(corps).toContain("m.empreinte = extensions.crypt(p_mdp, m.empreinte)");
    expect(corps).toMatch(/return exists \(/);
    expect(corps).not.toMatch(/return [^;]*empreinte;/);
  });

  it("mot de passe ou compte absent : faux", () => {
    expect(corps).toMatch(/if p_id is null or p_mdp is null then\s+return false;/);
  });
});

describe("terminer_changement_mdp (AD-6)", () => {
  const { parametres, entete, corps } = fonction("terminer_changement_mdp");
  const position = (motif: RegExp | string) =>
    typeof motif === "string" ? corps.indexOf(motif) : corps.search(motif);

  it("reçoit le compte et le nouveau mot de passe, ne renvoie rien", () => {
    expect(parametres).toBe("p_id uuid, p_mdp text");
    expect(entete).toMatch(/returns void/);
  });

  it("verrouille le profil d'abord, et ne fait rien si le drapeau est déjà faux", () => {
    expect(corps).toMatch(/from public\.profils p\s+where p\.id = p_id\s+for update;/);
    expect(corps).toMatch(/if v_doit_changer is distinct from true then\s+return;/);
    expect(position("for update")).toBeLessThan(position("is distinct from true"));
    expect(position("is distinct from true")).toBeLessThan(position("errcode = 'nv105'"));
  });

  it(`refuse moins de ${LONGUEUR_MINIMALE_MOT_DE_PASSE} caractères (NV105)`, () => {
    expect(corps).toMatch(
      new RegExp(`if p_mdp is null or char_length\\(p_mdp\\) < ${LONGUEUR_MINIMALE_MOT_DE_PASSE} then\\s+raise exception[^;]*using errcode = 'nv105';`),
    );
  });

  it("refuse le mot de passe temporaire (NV106)", () => {
    expect(corps).toMatch(
      /m\.empreinte = extensions\.crypt\(p_mdp, m\.empreinte\)\s+\) then\s+raise exception[^;]*using errcode = 'nv106';/,
    );
  });

  it("lève le drapeau, date la modification, puis efface l'empreinte", () => {
    expect(corps).toMatch(
      /update public\.profils\s+set doit_changer_mdp = false,\s+date_modification = now\(\)\s+where id = p_id;/,
    );
    expect(corps).toMatch(/delete from public\.mdp_temporaires\s+where profil_id = p_id;/);
    expect(position("errcode = 'nv106'")).toBeLessThan(position("update public.profils"));
    expect(position("update public.profils")).toBeLessThan(position("delete from public.mdp_temporaires"));
  });

  it("ne touche à rien d'autre", () => {
    expect([...corps.matchAll(/(update|delete from|insert into) public\.(\w+)/g)].map((m) => `${m[1]} ${m[2]}`)).toEqual([
      "update profils",
      "delete from mdp_temporaires",
    ]);
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FORME_EMAIL } from "@/shared/constantes";

// Migration « informations générales de l'écran A3 » (story 4.3 ; FR-31,
// RM-7, AD-2, AD-7, AD-9, AD-16). Ces tests lisent le texte SQL ; son effet
// réel se vérifie sur la base dev (`npx supabase migration list --remote`,
// enregistrement à l'écran avec le compte administrateur ; refus d'un appel
// direct par le collaborateur dans `tests/e2e/administration.spec.ts`).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const NOM = "20261127120000_informations_generales.sql";
const FICHIERS = readdirSync(DOSSIER).filter((fichier) => fichier.endsWith("_informations_generales.sql"));
const BRUT = FICHIERS.length === 1 ? readFileSync(join(DOSSIER, FICHIERS[0]), "utf8") : "";
/** Sans les commentaires, en minuscules, fins de ligne Unix. */
const SQL = BRUT.replace(/\r\n/g, "\n").replace(/--.*$/gm, "").toLowerCase();

/** Paramètres, en-tête et corps d'une fonction de la migration. */
function fonction(nom: string): { parametres: string; entete: string; corps: string } {
  const [, parametres = "", entete = "", corps = ""] =
    SQL.match(
      new RegExp(`create (?:or replace )?function public\\.${nom}\\(([^)]*)\\)\\s*(returns[\\s\\S]*?)as \\$\\$([\\s\\S]*?)\\$\\$;`),
    ) ?? [];
  return { parametres: parametres.replace(/\s+/g, " ").trim(), entete: entete.replace(/\s+/g, " ").trim(), corps };
}

const LIRE = fonction("lire_parametres_administration");
const MODIFIER = fonction("modifier_parametres");
const SIGNATURE_LIRE = "public.lire_parametres_administration()";
const SIGNATURE_MODIFIER = "public.modifier_parametres(text, text, text)";

/** Écritures d'un corps de fonction : « update parametres »… */
const ecritures = (corps: string) =>
  [...corps.matchAll(/(insert into|update|delete from) public\.(\w+)/g)].map((m) => `${m[1]} ${m[2]}`);

describe("fichier de migration (AD-16)", () => {
  it("est une nouvelle migration, après celle de la story 4.2 ; l'ancienne modifier_parametres n'est pas retouchée", () => {
    expect(FICHIERS).toEqual([NOM]);
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(toutes.indexOf(NOM)).toBeGreaterThan(toutes.indexOf("20261127090000_desactiver_supprimer_categorie.sql"));
    for (const fichier of toutes.filter((f) => f < NOM)) {
      expect(readFileSync(join(DOSSIER, fichier), "utf8"), fichier).not.toContain("lire_parametres_administration");
    }
    // La version de la story 1.5 est toujours là, inchangée (service_role seul).
    const comptes = readFileSync(join(DOSSIER, "20261120090000_comptes.sql"), "utf8");
    expect(comptes).toContain(`revoke execute on function ${SIGNATURE_MODIFIER} from authenticated;`);
  });

  it("deux fonctions, et rien d'autre : ni table, ni index, ni règle, ni droit direct sur une table", () => {
    expect([...SQL.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map((m) => m[1])).toEqual([
      "lire_parametres_administration",
      "modifier_parametres",
    ]);
    expect(SQL).toMatch(/create function public\.lire_parametres_administration\(\)/);
    expect(SQL).toMatch(/create or replace function public\.modifier_parametres\(/);
    expect(SQL).not.toMatch(/create table|alter table|create (unique )?index|create policy|create trigger|truncate |drop /);
    expect(SQL).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
  });

  it("rien n'est écrit au journal par la base (l'application écrit parametres_modifies, sans les valeurs)", () => {
    expect(SQL).not.toContain("journal");
  });

  it("ne touche ni aux catégories, ni aux comptes, ni aux statuts, ni aux demandes", () => {
    expect(SQL).not.toMatch(/public\.(categories|demandes|evenements|mdp_temporaires)\b/);
    expect(SQL).not.toMatch(/(insert into|update|delete from) public\.profils/);
  });
});

describe("lire_parametres_administration (écran A3)", () => {
  it("sans paramètre, en lecture seule ; security definer, chemin de recherche vide", () => {
    expect(LIRE.parametres).toBe("");
    expect(LIRE.entete).toBe("returns jsonb language plpgsql stable security definer set search_path = ''");
    expect(ecritures(LIRE.corps)).toEqual([]);
  });

  it("vérifie d'abord l'appelant (NV202), relu dans profils, jamais dans la session", () => {
    expect(LIRE.corps).toMatch(/\bbegin\s+perform public\.exiger_administrateur\(\);/);
    expect(LIRE.corps).not.toMatch(/jwt|user_metadata|app_metadata/);
  });

  it("renvoie { telephone, email_contact, contact_donnees } de l'unique ligne ; ligne absente : NV104", () => {
    expect(LIRE.corps).toMatch(
      /jsonb_build_object\(\s*'telephone', p\.telephone,\s*'email_contact', p\.email_contact,\s*'contact_donnees', p\.contact_donnees\s*\)/,
    );
    expect(LIRE.corps).toMatch(/from public\.parametres p/);
    expect(LIRE.corps).toMatch(/if v_parametres is null then\s+raise exception [^;]+using errcode = 'nv104';/);
  });

  it("exécutable par authenticated seul (la session de l'administrateur, jamais la clé secrète)", () => {
    for (const role of ["public", "anon", "service_role"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE_LIRE} from ${role};`);
    }
    expect(SQL.match(/grant execute on function public\.lire_parametres_administration\(\) to \w+/g)).toEqual([
      `grant execute on function ${SIGNATURE_LIRE} to authenticated`,
    ]);
  });
});

describe("modifier_parametres, ouverte aux administrateurs (FR-31, RM-7)", () => {
  it("même signature et même retour (void) : l'installation (story 1.5) continue de l'appeler", () => {
    expect(MODIFIER.parametres).toBe("p_telephone text, p_email_contact text, p_contact_donnees text");
    expect(MODIFIER.entete).toBe("returns void language plpgsql security definer set search_path = ''");
  });

  it("avec une session (auth.uid() renseigné), contrôle administrateur avant tout le reste ; sans session, l'installation", () => {
    expect(MODIFIER.corps).toMatch(
      /\bbegin\s+if auth\.uid\(\) is not null then\s+perform public\.exiger_administrateur\(\);\s+end if;/,
    );
    const controle = MODIFIER.corps.indexOf("exiger_administrateur");
    expect(controle).toBeLessThan(MODIFIER.corps.indexOf("nv103"));
    expect(controle).toBeLessThan(MODIFIER.corps.indexOf("update public.parametres"));
    expect(MODIFIER.corps).not.toMatch(/jwt|user_metadata|app_metadata/);
  });

  it("revérifie l'email (NV103) avec la forme du schéma, puis remplace l'unique ligne (NV104 si absente)", () => {
    expect(BRUT).toContain(`!~ '${FORME_EMAIL.source}'`);
    expect(MODIFIER.corps).toContain("errcode = 'nv103'");
    expect(MODIFIER.corps).toMatch(
      /update public\.parametres\s+set telephone = nullif\(btrim\(p_telephone\), ''\),\s+email_contact = btrim\(p_email_contact\),\s+contact_donnees = btrim\(p_contact_donnees\),\s+date_modification = now\(\)/,
    );
    expect(MODIFIER.corps).toContain("errcode = 'nv104'");
    expect(ecritures(MODIFIER.corps)).toEqual(["update parametres"]);
  });

  it("exécutable par service_role (installation) et authenticated (écran A3), jamais par anon ni public", () => {
    expect(SQL).toContain(`revoke execute on function ${SIGNATURE_MODIFIER} from public;`);
    expect(SQL).toContain(`revoke execute on function ${SIGNATURE_MODIFIER} from anon;`);
    expect(SQL.match(/grant execute on function public\.modifier_parametres\([^)]*\) to \w+/g)).toEqual([
      `grant execute on function ${SIGNATURE_MODIFIER} to service_role`,
      `grant execute on function ${SIGNATURE_MODIFIER} to authenticated`,
    ]);
    expect(SQL).not.toMatch(/grant execute on function public\.modifier_parametres\([^)]*\) to (anon|public)/);
  });
});

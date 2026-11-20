import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FORME_EMAIL, LONGUEURS_MAXIMALES, ROLES } from "@/shared/constantes";

// Migration « comptes » (story 1.5 ; AD-6, AD-9, AD-16). Ces tests lisent le
// texte SQL ; son effet réel se vérifie sur la base dev (procédure de
// docs/deploiement.md).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const FICHIERS = readdirSync(DOSSIER).filter((fichier) => fichier.endsWith("_comptes.sql"));
const BRUT = FICHIERS.length === 1 ? readFileSync(join(DOSSIER, FICHIERS[0]), "utf8") : "";
/** Sans les commentaires, en minuscules, espaces réduites. */
const SQL = BRUT.replace(/--.*$/gm, "").toLowerCase();

function table(nom: string): string {
  return SQL.match(new RegExp(`create table public\\.${nom} \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? "";
}

function fonction(nom: string): { parametres: string; entete: string; corps: string } {
  const [, parametres = "", entete = "", corps = ""] =
    SQL.match(new RegExp(`create function public\\.${nom}\\(([\\s\\S]*?)\\)\\s*(returns[\\s\\S]*?)as \\$\\$([\\s\\S]*?)\\$\\$;`)) ?? [];
  return { parametres: parametres.replace(/\s+/g, " ").trim(), entete: entete.replace(/\s+/g, " "), corps };
}

const SIGNATURE_CREER_PROFIL = "public.creer_profil(uuid, text, text, text, text)";
const SIGNATURE_MODIFIER_PARAMETRES = "public.modifier_parametres(text, text, text)";

describe("fichier de migration", () => {
  it("est une nouvelle migration, postérieure à celles des stories précédentes (AD-16)", () => {
    expect(FICHIERS).toEqual(["20261120090000_comptes.sql"]);
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    const precedentes = toutes.slice(0, toutes.indexOf("20261120090000_comptes.sql"));
    expect(precedentes).toEqual([
      "20261108201012_socle_droits.sql",
      "20261119090000_journal_technique.sql",
      "20261119180000_depot_demande.sql",
      "20261119210000_numero_envoi.sql",
    ]);
  });

  it("ne touche à aucune table des migrations précédentes, sauf par modifier_parametres", () => {
    expect(SQL).not.toMatch(/alter table public\.(categories|parametres|demandes|evenements|compteurs_reference|journal_technique)/);
    expect(SQL).not.toMatch(/drop /);
    expect(SQL).not.toContain("auteur_id");
  });
});

describe("table profils", () => {
  const profils = table("profils");

  it("désigne le compte Auth, sans suppression en cascade (RM-10)", () => {
    expect(profils).toMatch(/id uuid primary key\s+constraint profils_id_fkey\s+references auth\.users \(id\),/);
    expect(SQL).not.toContain("cascade");
  });

  it("porte nom, email, rôle fermé, actif, doit_changer_mdp et les dates", () => {
    expect(profils).toMatch(/nom text not null/);
    expect(profils).toMatch(/email text not null/);
    expect(profils).toMatch(/role text not null\s+constraint profils_role_check\s+check \(role in \('collaborateur', 'administrateur'\)\)/);
    expect(profils).toMatch(/actif boolean not null default true/);
    expect(profils).toMatch(/doit_changer_mdp boolean not null default true/);
    expect(profils).toMatch(/date_creation timestamptz not null default now\(\)/);
    expect(profils).toMatch(/date_modification timestamptz not null default now\(\)/);
  });

  it("les rôles sont ceux de src/shared/constantes.ts", () => {
    const roles = [...(profils.match(/role in \(([^)]*)\)/)?.[1] ?? "").matchAll(/'(\w+)'/g)].map(([, r]) => r);
    expect(roles).toEqual([...ROLES]);
  });

  it("limite nom et email comme le schéma (100 caractères)", () => {
    expect(profils).toContain(`char_length(nom) <= ${LONGUEURS_MAXIMALES.nom}`);
    expect(profils).toContain(`char_length(email) <= ${LONGUEURS_MAXIMALES.email}`);
  });

  it("email unique sans tenir compte de la casse", () => {
    expect(SQL).toMatch(/create unique index profils_email_unique\s+on public\.profils \(lower\(email\)\);/);
  });

  it("aucun déclencheur sur auth.users (AD-6)", () => {
    expect(SQL).not.toContain("create trigger");
    expect(SQL).not.toMatch(/on auth\.users/);
  });
});

describe("table mdp_temporaires", () => {
  const mdp = table("mdp_temporaires");

  it("garde une empreinte par profil, et sa date", () => {
    expect(mdp).toMatch(/profil_id uuid primary key\s+constraint mdp_temporaires_profil_id_fkey\s+references public\.profils \(id\)/);
    expect(mdp).toMatch(/empreinte text not null/);
    expect(mdp).toMatch(/date_creation timestamptz not null default now\(\)/);
    expect(mdp).not.toMatch(/mot_de_passe|mdp_clair|password/);
  });
});

describe("droits (AD-9)", () => {
  it.each(["profils", "mdp_temporaires"])("%s : RLS sans aucune règle, tous les droits retirés", (nom) => {
    expect(SQL).toContain(`alter table public.${nom} enable row level security;`);
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(SQL).toContain(`revoke all on table public.${nom} from ${role};`);
    }
    expect(SQL).not.toMatch(new RegExp(`grant [a-z, ]+ on table public\\.${nom}`));
  });

  it("aucune règle RLS (ni lecture pour authenticated)", () => {
    expect(SQL).not.toContain("create policy");
  });

  it.each([SIGNATURE_CREER_PROFIL, SIGNATURE_MODIFIER_PARAMETRES])(
    "%s : exécutable par service_role seul",
    (signature) => {
      for (const role of ["public", "anon", "authenticated"]) {
        expect(SQL).toContain(`revoke execute on function ${signature} from ${role};`);
      }
      expect(SQL).toContain(`grant execute on function ${signature} to service_role;`);
      const grants = SQL.match(new RegExp(`grant execute on function ${signature.replace(/[().]/g, "\\$&")} to (\\w+)`, "g"));
      expect(grants).toHaveLength(1);
    },
  );
});

describe("creer_profil (AD-6)", () => {
  const { parametres, entete, corps } = fonction("creer_profil");

  it("reçoit identifiant, nom, email, rôle et mot de passe temporaire", () => {
    expect(parametres).toBe("p_id uuid, p_nom text, p_email text, p_role text, p_mdp_temporaire text");
  });

  it("security definer, chemin de recherche vide", () => {
    expect(entete).toContain("security definer");
    expect(entete).toContain("set search_path = ''");
  });

  it("vérifie que le compte Auth existe avec cet email", () => {
    expect(corps).toMatch(/from auth\.users u\s+where u\.id = p_id\s+and lower\(u\.email\) = lower\(btrim\(p_email\)\)/);
    expect(corps).toContain("errcode = 'nv101'");
  });

  it("refuse un mot de passe temporaire de moins de 12 caractères", () => {
    expect(corps).toContain("char_length(p_mdp_temporaire) < 12");
    expect(corps).toContain("errcode = 'nv102'");
  });

  it("crée le profil actif, qui doit changer son mot de passe", () => {
    expect(corps).toMatch(/insert into public\.profils \(id, nom, email, role, actif, doit_changer_mdp\)\s+values \(p_id, btrim\(p_nom\), btrim\(p_email\), p_role, true, true\);/);
  });

  it("n'écrit que l'empreinte bcrypt, calculée par la base", () => {
    expect(corps).toMatch(/insert into public\.mdp_temporaires \(profil_id, empreinte\)\s+values \(p_id, extensions\.crypt\(p_mdp_temporaire, extensions\.gen_salt\('bf'\)\)\);/);
    expect(SQL).toContain("create extension if not exists pgcrypto with schema extensions;");
  });

  it("ne garde le mot de passe nulle part ailleurs", () => {
    const usages = corps.match(/p_mdp_temporaire/g) ?? [];
    // Vérification de longueur (2) et calcul de l'empreinte (1).
    expect(usages).toHaveLength(3);
  });
});

describe("modifier_parametres", () => {
  const { parametres, entete, corps } = fonction("modifier_parametres");

  it("reçoit téléphone, email de contact et contact données", () => {
    expect(parametres).toBe("p_telephone text, p_email_contact text, p_contact_donnees text");
  });

  it("security definer, chemin de recherche vide", () => {
    expect(entete).toContain("security definer");
    expect(entete).toContain("set search_path = ''");
  });

  it("met à jour l'unique ligne, et refuse s'il n'y en a pas", () => {
    expect(corps).toMatch(/update public\.parametres\s+set telephone = nullif\(btrim\(p_telephone\), ''\),\s+email_contact = btrim\(p_email_contact\),\s+contact_donnees = btrim\(p_contact_donnees\),\s+date_modification = now\(\)/);
    expect(corps).not.toContain("insert into public.parametres");
    expect(corps).toContain("errcode = 'nv104'");
  });

  it("refuse un email de contact mal formé, avec la forme du schéma", () => {
    expect(BRUT).toContain(`!~ '${FORME_EMAIL.source}'`);
    expect(corps).toContain("errcode = 'nv103'");
  });
});

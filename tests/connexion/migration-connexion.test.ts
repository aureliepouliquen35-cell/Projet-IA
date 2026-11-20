import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LONGUEURS_MAXIMALES } from "@/shared/constantes";

// Migration « connexion » (story 1.6 ; AD-8, AD-9, AD-14, AD-16). Ces tests
// lisent le texte SQL ; son effet réel se vérifie sur la base dev
// (`npx supabase migration list --remote`, connexion avec le compte de test).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const FICHIERS = readdirSync(DOSSIER).filter((fichier) => fichier.endsWith("_connexion.sql"));
const BRUT = FICHIERS.length === 1 ? readFileSync(join(DOSSIER, FICHIERS[0]), "utf8") : "";
/** Sans les commentaires, en minuscules. */
const SQL = BRUT.replace(/--.*$/gm, "").toLowerCase();

function table(nom: string): string {
  return SQL.match(new RegExp(`create table public\\.${nom} \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? "";
}

function fonction(nom: string): { parametres: string; entete: string; corps: string } {
  const [, parametres = "", entete = "", corps = ""] =
    SQL.match(new RegExp(`create function public\\.${nom}\\(([\\s\\S]*?)\\)\\s*(returns[\\s\\S]*?)as \\$\\$([\\s\\S]*?)\\$\\$;`)) ?? [];
  return { parametres: parametres.replace(/\s+/g, " ").trim(), entete: entete.replace(/\s+/g, " "), corps };
}

const SIGNATURE_BLOCAGE = "public.connexion_bloquee(text)";
const SIGNATURE_TENTATIVE = "public.enregistrer_tentative(text, boolean)";

describe("fichier de migration", () => {
  it("est une nouvelle migration, postérieure à celle de la story 1.5 (AD-16)", () => {
    expect(FICHIERS).toEqual(["20261120120000_connexion.sql"]);
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(toutes.indexOf("20261120120000_connexion.sql")).toBeGreaterThan(
      toutes.indexOf("20261120090000_comptes.sql"),
    );
    expect(toutes).toContain("20261120090000_comptes.sql");
  });

  it("ne modifie aucune table existante et ne supprime rien", () => {
    expect(SQL).not.toMatch(/alter table public\.(?!tentatives_connexion)/);
    expect(SQL).not.toMatch(/drop |truncate /);
    expect(SQL).not.toMatch(/(insert into|update|delete from) public\.profils/);
  });
});

describe("table tentatives_connexion", () => {
  const tentatives = table("tentatives_connexion");

  it("garde l'email en minuscules, la date et la réussite", () => {
    expect(tentatives).toMatch(/email text not null/);
    expect(tentatives).toContain("email = lower(btrim(email))");
    expect(tentatives).toContain(`char_length(email) <= ${LONGUEURS_MAXIMALES.email}`);
    expect(tentatives).toMatch(/date_tentative timestamptz not null default now\(\)/);
    expect(tentatives).toMatch(/reussite boolean not null/);
  });

  it("ne garde ni mot de passe ni adresse IP", () => {
    expect(tentatives).not.toMatch(/mot_de_passe|mdp|password|ip\b|adresse/);
  });

  it("index sur l'email et la date", () => {
    expect(SQL).toMatch(/create index \w+\s+on public\.tentatives_connexion \(email, date_tentative\);/);
  });
});

describe("droits (AD-9)", () => {
  it("tentatives_connexion : RLS sans aucune règle, tous les droits retirés", () => {
    expect(SQL).toContain("alter table public.tentatives_connexion enable row level security;");
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(SQL).toContain(`revoke all on table public.tentatives_connexion from ${role};`);
    }
    expect(SQL).not.toMatch(/grant [a-z, ]+ on table public\.tentatives_connexion/);
    expect(SQL).not.toMatch(/create policy \w+\s+on public\.tentatives_connexion/);
  });

  it.each([SIGNATURE_BLOCAGE, SIGNATURE_TENTATIVE])("%s : exécutable par service_role seul", (signature) => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(SQL).toContain(`revoke execute on function ${signature} from ${role};`);
    }
    expect(SQL).toContain(`grant execute on function ${signature} to service_role;`);
    const grants = SQL.match(new RegExp(`grant execute on function ${signature.replace(/[().]/g, "\\$&")} to (\\w+)`, "g"));
    expect(grants).toHaveLength(1);
  });

  it.each(["connexion_bloquee", "enregistrer_tentative"])("%s : security definer, chemin de recherche vide", (nom) => {
    const { entete } = fonction(nom);
    expect(entete).toContain("security definer");
    expect(entete).toContain("set search_path = ''");
  });
});

describe("profils : lecture de sa propre ligne seulement (AD-7, AD-9)", () => {
  const regles = [...SQL.matchAll(/create policy (\w+)\s+on public\.(\w+)([\s\S]*?);/g)];

  it("une seule règle, en lecture, pour authenticated, limitée à id = auth.uid()", () => {
    expect(regles).toHaveLength(1);
    const [, , nomTable, corps] = regles[0];
    expect(nomTable).toBe("profils");
    expect(corps.replace(/\s+/g, " ").trim()).toBe(
      "for select to authenticated using (id = (select auth.uid()))",
    );
  });

  it("droit de lecture seul rendu à authenticated, rien à anon", () => {
    expect(SQL).toContain("grant select on table public.profils to authenticated;");
    expect(SQL).not.toMatch(/grant (?!select on table public\.profils to authenticated;)[^;]* on table public\.profils/);
    expect(SQL).not.toMatch(/to anon/);
  });
});

describe("connexion_bloquee (AD-8)", () => {
  const { parametres, entete, corps } = fonction("connexion_bloquee");

  it("reçoit l'email, renvoie un booléen, ne modifie rien", () => {
    expect(parametres).toBe("p_email text");
    expect(entete).toMatch(/returns boolean/);
    expect(entete).toContain("stable");
    expect(corps).not.toMatch(/insert|update|delete/);
  });

  it("compare l'email en minuscules", () => {
    expect(corps).toContain("lower(btrim(coalesce(p_email, '')))");
  });

  it("compte les échecs de moins de 15 minutes, postérieurs à la dernière réussite", () => {
    expect(corps).toMatch(/select max\(t\.date_tentative\)\s+into v_derniere_reussite[\s\S]*?and t\.reussite;/);
    expect(corps).toContain("and not t.reussite");
    expect(corps).toContain("t.date_tentative > now() - interval '15 minutes'");
    expect(corps).toContain("(v_derniere_reussite is null or t.date_tentative > v_derniere_reussite)");
  });

  it("bloque à partir de 5 échecs", () => {
    expect(corps).toContain("return v_echecs >= 5;");
  });
});

describe("enregistrer_tentative (AD-8, AD-14)", () => {
  const { parametres, corps } = fonction("enregistrer_tentative");

  it("reçoit l'email et la réussite", () => {
    expect(parametres).toBe("p_email text, p_reussite boolean");
  });

  it("efface les tentatives de plus de 24 h avant d'enregistrer", () => {
    const effacement = corps.search(
      /delete from public\.tentatives_connexion\s+where date_tentative < now\(\) - interval '24 hours';/,
    );
    const insertion = corps.search(/insert into public\.tentatives_connexion \(email, reussite\)/);
    expect(effacement).toBeGreaterThanOrEqual(0);
    expect(insertion).toBeGreaterThan(effacement);
  });

  it("enregistre l'email en minuscules", () => {
    expect(corps).toMatch(/values \(lower\(btrim\(p_email\)\), coalesce\(p_reussite, false\)\);/);
  });
});

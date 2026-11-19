import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Story 1.3 : la migration crée les cinq tables du dépôt et leur unique
// chemin d'écriture, `deposer_demande` (AD-2, AD-4, AD-9, AD-11, AD-16).

const simulation = vi.hoisted(() => {
  const rpc = vi.fn(() => ({
    abortSignal: vi.fn().mockResolvedValue({ data: "NOVA-2026-0001", error: null }),
  }));
  return { rpc, creerClientSecret: vi.fn(() => ({ rpc })) };
});

vi.mock("@/server/supabase-secret", () => ({
  creerClientSecret: simulation.creerClientSecret,
}));

import { CODES_REFUS_PREVUS, deposerDemande } from "@/server/depot";
import { LONGUEUR_MINIMALE_DESCRIPTION, LONGUEURS_MAXIMALES } from "@/shared/constantes";
import { validerDepot } from "@/shared/schemas/depot";

import { SAISIE_DE_CLAIRE } from "../aides/formulaire-depot";
import {
  BRUT,
  definitionColonne,
  definitionTable,
  DOSSIER_MIGRATIONS,
  FICHIERS_DEPOT,
  fonctionDeposerDemande,
  SIGNATURE_DEPOSER_DEMANDE,
  SQL,
  TABLES_DEPOT,
} from "../aides/migration-depot";

afterEach(() => vi.clearAllMocks());

describe("migration dépôt d'une demande", () => {
  it("existe une seule fois, nommée selon la convention de la Supabase CLI, après le journal", () => {
    expect(FICHIERS_DEPOT).toEqual(["20261119180000_depot_demande.sql"]);
    const journal = readdirSync(DOSSIER_MIGRATIONS).find((f) => f.endsWith("_journal_technique.sql"))!;
    expect(FICHIERS_DEPOT[0] > journal).toBe(true);
  });

  it("crée les cinq tables, chacune avec un identifiant UUID", () => {
    expect([...SQL.matchAll(/create table public\.(\w+)/g)].map(([, nom]) => nom).sort()).toEqual(
      [...TABLES_DEPOT].sort(),
    );
    for (const table of TABLES_DEPOT) {
      expect(definitionColonne(table, "id"), table).toBe("uuid primary key default gen_random_uuid()");
    }
  });

  it("enregistre les dates avec leur fuseau (timestamptz)", () => {
    expect(SQL).not.toMatch(/\btimestamp\b(?!tz)/);
    for (const [table, colonne] of [
      ["demandes", "date_depot"],
      ["demandes", "date_derniere_activite"],
      ["evenements", "date_creation"],
    ]) {
      expect(definitionColonne(table, colonne)).toBe("timestamptz not null default now()");
    }
  });
});

describe("limites : les mêmes dans la base que dans le schéma (AD-11)", () => {
  it.each([
    ["nom", `text not null`, 1, LONGUEURS_MAXIMALES.nom],
    ["email", `text not null`, 1, LONGUEURS_MAXIMALES.email],
    ["objet", `text not null`, 1, LONGUEURS_MAXIMALES.objet],
    ["description", `text not null`, LONGUEUR_MINIMALE_DESCRIPTION, LONGUEURS_MAXIMALES.description],
  ])("%s : %s, de %i à %i caractères", (colonne, type, minimum, maximum) => {
    const definition = definitionColonne("demandes", colonne);
    expect(definition.startsWith(type)).toBe(true);
    expect(definition).toContain(`check (char_length(${colonne}) between ${minimum} and ${maximum})`);
  });

  it.each([
    ["telephone", LONGUEURS_MAXIMALES.telephone],
    ["entreprise", LONGUEURS_MAXIMALES.entreprise],
  ])("%s : facultatif, %i caractères au plus", (colonne, maximum) => {
    const definition = definitionColonne("demandes", colonne);
    expect(definition).not.toContain("not null");
    expect(definition).toContain(`check (char_length(${colonne}) between 1 and ${maximum})`);
  });

  it("compte en caractères (char_length), comme le schéma, jamais en octets", () => {
    expect(definitionTable("demandes")).not.toMatch(/octet_length|\blength\(/);
  });

  it("n'utilise aucun type qui couperait un texte sans prévenir", () => {
    expect(SQL).not.toMatch(/varchar|character varying|\bchar\(/);
  });
});

describe("valeurs fermées (conventions de l'architecture)", () => {
  const liste = (definition: string) => definition.match(/in \(([^)]*)\)/)?.[1].match(/'[a-z_]+'/g);

  it("statut, priorité et canal d'une demande", () => {
    expect(liste(definitionColonne("demandes", "statut"))).toEqual(["'nouvelle'", "'en_cours'", "'traitee'"]);
    expect(liste(definitionColonne("demandes", "priorite"))).toEqual(["'normale'", "'urgente'"]);
    expect(liste(definitionColonne("demandes", "canal"))).toEqual(["'formulaire'", "'telephone'", "'email'"]);
  });

  it("type et auteur d'un événement", () => {
    expect(liste(definitionColonne("evenements", "type"))).toEqual([
      "'creation'",
      "'statut'",
      "'attribution'",
      "'priorite'",
      "'commentaire'",
      "'anonymisation'",
    ]);
    const auteur = definitionColonne("evenements", "auteur_libelle");
    expect(auteur.startsWith("text not null")).toBe(true);
    expect(liste(auteur)).toEqual(["'demandeur'", "'systeme'"]);
  });

  it("l'historique est supprimé avec sa demande, une catégorie utilisée ne peut pas l'être", () => {
    expect(definitionColonne("evenements", "demande_id")).toMatch(
      /^uuid not null .*references public\.demandes \(id\) on delete cascade$/,
    );
    expect(definitionColonne("demandes", "categorie_id")).toMatch(
      /^uuid not null .*references public\.categories \(id\)$/,
    );
  });
});

describe("données de départ", () => {
  it("crée les cinq catégories du PRD (FR-26), actives, dans l'ordre", () => {
    const noms = [...BRUT.matchAll(/^insert into public\.categories \(nom\) values \('((?:[^']|'')*)'\);$/gm)].map(
      ([, nom]) => nom.replace(/''/g, "'"),
    );
    expect(noms).toEqual([
      "Demande d'information",
      "Problème technique",
      "Demande de rendez-vous",
      "Question administrative",
      "Autre",
    ]);
    expect(definitionColonne("categories", "active")).toBe("boolean not null default true");
    expect(definitionColonne("categories", "ordre")).toBe("integer generated always as identity");
  });

  it("interdit deux catégories actives de même nom", () => {
    expect(SQL).toMatch(/create unique index \w+\s+on public\.categories \(lower\(nom\)\)\s+where active;/);
  });

  it("crée une seule ligne de paramètres, aux valeurs clairement fictives", () => {
    expect(SQL).toMatch(/create unique index \w+\s+on public\.parametres \(\(true\)\);/);
    const [, colonnes = "", valeurs = ""] =
      BRUT.match(/insert into public\.parametres \(([^)]*)\)\s*values \(([^;]*)\);/) ?? [];
    expect(colonnes.split(",").map((c) => c.trim())).toEqual(["telephone", "email_contact", "contact_donnees"]);
    const [telephone, emailContact, contactDonnees] = valeurs.match(/'[^']*'/g) ?? [];
    expect(BRUT.match(/insert into public\.parametres/g)).toHaveLength(1);
    // Domaine `.example` : réservé aux exemples, il n'appartient à personne.
    expect(emailContact).toMatch(/^'[a-z-]+@nova-services\.example'$/);
    expect(contactDonnees).toMatch(/^'[a-z-]+@nova-services\.example'$/);
    // Numéro de la tranche réservée aux œuvres de fiction (01 99 00 …).
    expect(telephone).toMatch(/^'01 99 00 \d\d \d\d'$/);
  });
});

describe("droits (AD-9)", () => {
  it("active le RLS sur les cinq tables, sans aucune règle", () => {
    for (const table of TABLES_DEPOT) {
      expect(SQL).toContain(`alter table public.${table} enable row level security;`);
    }
    expect(SQL).not.toContain("create policy");
    expect(SQL).not.toMatch(/disable row level security|no force row level security/);
  });

  it("retire tout droit direct sur les cinq tables, à tous les rôles", () => {
    for (const table of TABLES_DEPOT) {
      for (const role of ["public", "anon", "authenticated", "service_role"]) {
        expect(SQL).toContain(`revoke all on table public.${table} from ${role};`);
      }
    }
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(SQL).toContain(`revoke all on sequence public.categories_ordre_seq from ${role};`);
    }
  });

  it("ne donne que trois droits, tous au seul service_role : lire catégories et paramètres, déposer", () => {
    const droits = [...SQL.matchAll(/^grant [^;]*;/gm)].map(([droit]) => droit.replace(/\s+/g, " "));
    expect(droits).toEqual([
      "grant select on table public.categories to service_role;",
      "grant select on table public.parametres to service_role;",
      `grant execute on function ${SIGNATURE_DEPOSER_DEMANDE} to service_role;`,
    ]);
    // Les droits sont donnés après les retraits, sinon ils seraient effacés.
    for (const table of ["categories", "parametres"]) {
      expect(SQL.indexOf(`grant select on table public.${table} to service_role;`)).toBeGreaterThan(
        SQL.lastIndexOf(`revoke all on table public.${table} from service_role;`),
      );
    }
  });

  it("protège deposer_demande : security definer, search_path vide, exécution par service_role seul", () => {
    const { entete } = fonctionDeposerDemande();
    expect(entete).toContain("returns text");
    expect(entete).toContain("language plpgsql");
    expect(entete).toContain("security definer");
    expect(entete).toContain("set search_path = ''");
    for (const role of ["public", "anon", "authenticated"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE_DEPOSER_DEMANDE} from ${role};`);
    }
    expect(SQL).toContain(`grant execute on function ${SIGNATURE_DEPOSER_DEMANDE} to service_role;`);
  });

  it("désigne chaque objet avec son schéma dans la fonction (chemin de recherche vide)", () => {
    const { corps } = fonctionDeposerDemande();
    const objets = [...corps.matchAll(/\b(?:from|into|join)\s+([a-z_.]+)/g)]
      .map(([, nom]) => nom)
      .filter((nom) => !nom.startsWith("v_"));
    expect(objets.length).toBeGreaterThanOrEqual(4);
    for (const objet of objets) expect(objet).toMatch(/^public\./);
  });
});

describe("deposer_demande (AD-2, AD-4)", () => {
  it("a les mêmes noms de paramètres que ceux envoyés par le serveur", async () => {
    const { parametres } = fonctionDeposerDemande();
    expect(parametres).toHaveLength(8);

    const validation = validerDepot(SAISIE_DE_CLAIRE);
    if (!validation.ok) throw new Error("la saisie de Claire doit être correcte");
    await deposerDemande(validation.donnees);

    const [nomFonction, charge] = simulation.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(nomFonction).toBe("deposer_demande");
    expect(Object.keys(charge).sort()).toEqual([...parametres].sort());
  });

  it("refuse avant d'écrire : case non cochée (NV001), catégorie inactive (NV002)", () => {
    const { corps } = fonctionDeposerDemande();
    const premiereEcriture = corps.indexOf("insert into");
    const refusCase = corps.indexOf("errcode = 'nv001'");
    const refusCategorie = corps.indexOf("errcode = 'nv002'");
    expect(refusCase).toBeGreaterThan(-1);
    expect(refusCategorie).toBeGreaterThan(refusCase);
    expect(premiereEcriture).toBeGreaterThan(refusCategorie);

    expect(corps).toMatch(/if p_personne_informee is not true then\s+raise exception/);
    expect(corps).toMatch(
      /if not exists \(\s*select 1\s+from public\.categories c\s+where c\.id = p_categorie_id\s+and c\.active\s*\) then\s+raise exception/,
    );
  });

  it("lève exactement les codes de refus que le serveur traduit, écrits à l'identique (majuscules)", () => {
    // Texte d'origine, sans le passer en minuscules : `errcode = 'nv002'`
    // serait refusé par la base, et un code renommé d'un seul côté ferait
    // d'un refus prévu une erreur inattendue.
    const [, corps = ""] =
      BRUT.match(/create function public\.deposer_demande\([\s\S]*?as \$\$([\s\S]*?)\$\$;/) ?? [];
    const codes = [...corps.matchAll(/errcode\s*=\s*'([^']*)'/gi)].map(([, code]) => code);

    expect(codes).toHaveLength(2);
    for (const code of codes) expect(code).toMatch(/^[0-9A-Z]{5}$/);
    expect([...codes].sort()).toEqual([...CODES_REFUS_PREVUS].sort());
  });

  it("écrit la demande puis l'événement « creation » par le demandeur, à la même heure", () => {
    const { corps } = fonctionDeposerDemande();
    const demande = corps.indexOf("insert into public.demandes");
    const evenement = corps.indexOf("insert into public.evenements");
    expect(demande).toBeGreaterThan(-1);
    expect(evenement).toBeGreaterThan(demande);
    expect(corps).toMatch(
      /insert into public\.evenements \(demande_id, type, auteur_libelle, date_creation\)\s+values \(v_demande_id, 'creation', 'demandeur', v_maintenant\);/,
    );
    // Une seule demande, un seul événement, et rien d'autre : ni modification
    // ni suppression.
    expect(corps.match(/insert into/g)).toHaveLength(3); // compteur, demande, événement
    expect(corps).not.toMatch(/\bdelete\b|\btruncate\b/);
  });

  it("enregistre le canal « formulaire » et vide en null les champs facultatifs", () => {
    const { corps } = fonctionDeposerDemande();
    const valeurs = corps.match(/insert into public\.demandes \(([\s\S]*?)\)\s+values \(([\s\S]*?)\)\s+returning id into v_demande_id;/);
    const colonnes = valeurs?.[1].split(",").map((c) => c.trim()) ?? [];
    expect(colonnes).toEqual([
      "reference",
      "nom",
      "email",
      "telephone",
      "entreprise",
      "categorie_id",
      "objet",
      "description",
      "canal",
      "personne_informee",
      "date_depot",
      "date_derniere_activite",
    ]);
    expect(valeurs?.[2]).toContain("'formulaire'");
    expect(valeurs?.[2]).toContain("nullif(btrim(p_telephone), '')");
    expect(valeurs?.[2]).toContain("nullif(btrim(p_entreprise), '')");
  });
});

describe("aucune écriture directe dans une table depuis l'application (AD-2, AD-9)", () => {
  function fichiersDe(dossier: string): string[] {
    return readdirSync(dossier).flatMap((nom) => {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) return fichiersDe(chemin);
      return /\.(ts|tsx)$/.test(nom) ? [chemin] : [];
    });
  }
  const sources = fichiersDe(join(process.cwd(), "src")).map((chemin) => ({
    chemin,
    code: readFileSync(chemin, "utf8"),
  }));

  it("le code n'écrit dans aucune table (insert, update, upsert, delete de Supabase)", () => {
    expect(sources.length).toBeGreaterThan(10);
    for (const { chemin, code } of sources) {
      expect(code, chemin).not.toMatch(
        /\.from\([^)]*\)[\s\S]{0,200}?\.\s*(insert|update|upsert|delete)\s*\(/,
      );
    }
  });

  it("le module du dépôt (src/server/depot) ne lit que les tables `categories` et `parametres`", () => {
    // Seulement ce module : les stories suivantes liront d'autres tables
    // ailleurs, avec leurs propres règles.
    const lectures = sources
      .map(({ chemin, code }) => ({ chemin: chemin.replace(/\\/g, "/").replace(/^.*\/src\//, "src/"), code }))
      .filter(({ chemin }) => chemin.startsWith("src/server/depot/"))
      .flatMap(({ chemin, code }) =>
        [...code.matchAll(/\.from\(\s*["'`](\w+)["'`]\s*\)/g)].map(([, table]) => ({ table, chemin })),
      );
    expect(lectures).toEqual([
      { table: "categories", chemin: "src/server/depot/index.ts" },
      { table: "parametres", chemin: "src/server/depot/index.ts" },
    ]);
  });
});

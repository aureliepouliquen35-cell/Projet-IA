import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Story 1.2 : la migration crée `journal_technique` et son unique chemin
// d'écriture, `ecrire_journal` (AD-9, AD-13, AD-16). Son application sur dev
// se vérifie avec `npx supabase migration list --remote`.

const simulation = vi.hoisted(() => {
  const rpc = vi.fn(() => ({ abortSignal: vi.fn().mockResolvedValue({ data: null, error: null }) }));
  return { rpc, creerClientSecret: vi.fn(() => ({ rpc })) };
});

vi.mock("@/server/supabase-secret", () => ({
  creerClientSecret: simulation.creerClientSecret,
}));

import { EVENEMENTS_JOURNAL, journaliser, NIVEAUX_JOURNAL } from "@/server/journal";

const dossier = join(process.cwd(), "supabase", "migrations");
const fichiers = readdirSync(dossier).filter((f) => f.endsWith("_journal_technique.sql"));
const brut = fichiers.length === 1 ? readFileSync(join(dossier, fichiers[0]), "utf8") : "";
const sql = brut.toLowerCase();
const signature = "public.ecrire_journal(text, text, jsonb, text)";

describe("migration journal technique", () => {
  it("existe une seule fois, nommée selon la convention de la Supabase CLI, après le socle", () => {
    expect(fichiers).toHaveLength(1);
    expect(fichiers[0]).toMatch(/^\d{14}_journal_technique\.sql$/);
    const socle = readdirSync(dossier).find((f) => f.endsWith("_socle_droits.sql"))!;
    expect(fichiers[0] > socle).toBe(true);
  });

  it("crée la table avec ses colonnes et un index sur la date", () => {
    expect(sql).toContain("create table public.journal_technique");
    for (const colonne of ["id uuid", "date_creation timestamptz", "niveau text", "evenement text", "details jsonb", "code_erreur text"]) {
      expect(sql).toContain(colonne);
    }
    expect(sql).toMatch(/create index \w+\s+on public\.journal_technique \(date_creation/);
  });

  it("limite code_erreur au format du code support (base 36, au plus 7 caractères)", () => {
    // Texte d'origine (sensible à la casse : majuscules seulement).
    expect(brut).toContain("check (code_erreur ~ '^[0-9A-Z]{1,7}$')");
  });

  it("indexe code_erreur, seulement quand il est renseigné, pour la recherche du support", () => {
    expect(sql).toMatch(
      /create index \w+\s+on public\.journal_technique \(code_erreur\)\s+where code_erreur is not null;/,
    );
  });

  it("limite niveaux et événements aux listes fermées du code", () => {
    const niveaux = sql.match(/check \(niveau in \(([^)]*)\)\)/)?.[1] ?? "";
    expect(niveaux.match(/'[a-z_]+'/g)).toEqual(NIVEAUX_JOURNAL.map((n) => `'${n}'`));
    const evenements = sql.match(/check \(evenement in \(([^)]*)\)\)/)?.[1] ?? "";
    expect(evenements.match(/'[a-z_]+'/g)).toEqual(EVENEMENTS_JOURNAL.map((e) => `'${e}'`));
  });

  it("active le RLS sans aucune règle et retire tout droit direct sur la table", () => {
    expect(sql).toContain("alter table public.journal_technique enable row level security");
    expect(sql).not.toContain("create policy");
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(sql).toContain(`revoke all on table public.journal_technique from ${role};`);
    }
    expect(sql).not.toMatch(/grant [^;]* on (table )?public\.journal_technique/);
  });

  it("protège ecrire_journal : security definer, search_path vide, exécution par service_role seul", () => {
    expect(sql).toContain("create function public.ecrire_journal(");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    for (const role of ["public", "anon", "authenticated"]) {
      expect(sql).toContain(`revoke execute on function ${signature} from ${role};`);
    }
    expect(sql).toContain(`grant execute on function ${signature} to service_role;`);
    expect(sql.match(/grant execute/g)).toHaveLength(1);
  });

  it("a les mêmes noms de paramètres que ceux envoyés par journaliser", async () => {
    const entete = sql.match(/create function public\.ecrire_journal\(([^;]*?)\)\s*returns/)?.[1] ?? "";
    const parametresSql = [...entete.matchAll(/(p_\w+)\s+\w+/g)].map(([, nom]) => nom);
    expect(parametresSql).toHaveLength(4);

    await journaliser("erreur", "erreur_inattendue", {}, "7F3A");
    const [nomFonction, charge] = simulation.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(nomFonction).toBe("ecrire_journal");
    expect(Object.keys(charge).sort()).toEqual([...parametresSql].sort());
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Story 1.1, matrice « Migration » : la migration « socle des droits » existe
// et retire au rôle public `anon` tout droit, présent et à venir (AD-9, AD-16).
// Son application sur dev se vérifie avec `npx supabase migration list --remote`.

const dossier = join(process.cwd(), "supabase", "migrations");

describe("migration socle des droits", () => {
  const fichiers = readdirSync(dossier).filter((f) => f.endsWith("_socle_droits.sql"));

  it("existe une seule fois, nommée selon la convention de la Supabase CLI", () => {
    expect(fichiers).toHaveLength(1);
    expect(fichiers[0]).toMatch(/^\d{14}_socle_droits\.sql$/);
  });

  it("retire à anon les droits existants et ceux des objets futurs", () => {
    const sql = readFileSync(join(dossier, fichiers[0]), "utf8").toLowerCase();
    for (const objet of ["tables", "sequences", "functions"]) {
      expect(sql).toContain(`revoke all on all ${objet} in schema public from anon`);
      expect(sql).toMatch(
        new RegExp(`alter default privileges for role postgres in schema public\\s+revoke all on ${objet} from anon`),
      );
    }
    expect(sql).toMatch(/alter default privileges for role postgres\s+revoke execute on functions from public/);
    expect(sql).toMatch(
      /alter default privileges for role postgres in schema public\s+revoke execute on functions from authenticated/,
    );
    expect(sql).toContain("revoke execute on all functions in schema public from public");
  });

  it("ne crée ni table ni fonction (stories suivantes)", () => {
    const sql = readFileSync(join(dossier, fichiers[0]), "utf8").toLowerCase();
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?(table|function)/);
  });
});

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// RM-8 : personne ne peut s'inscrire seul ; seul un administrateur crée les
// comptes (FR-21, AD-6).
// - aucune page ni route d'inscription : `/inscription` affiche S2 ;
// - aucun appel à `auth.signUp` dans le code ;
// - aucun rôle écrit dans les métadonnées du compte Supabase ;
// - inscriptions fermées et 12 caractères au moins dans `supabase/config.toml`
//   (le même réglage est fait à la main sur chaque projet, docs/deploiement.md).

const racine = process.cwd();

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

const CODE = [...fichiers(join(racine, "src")), ...fichiers(join(racine, "scripts"))].filter((f) =>
  /\.(ts|tsx|js|mjs)$/.test(f),
);

describe("RM-8 : aucune inscription publique", () => {
  it("aucun dossier ni fichier d'inscription dans src/app", () => {
    const chemins = fichiers(join(racine, "src", "app")).map((f) => relative(racine, f).toLowerCase());
    for (const mot of ["inscription", "signup", "sign-up", "register", "inscrire"]) {
      expect(chemins.filter((c) => c.includes(mot))).toEqual([]);
    }
  });

  it("aucun appel à signUp dans le code", () => {
    const appels = CODE.filter((f) => /\bsignUp\b|\/signup\b/.test(readFileSync(f, "utf8")));
    expect(appels.map((f) => relative(racine, f))).toEqual([]);
  });

  it("le compte est créé par l'API d'administration, email confirmé, sans métadonnée", () => {
    const admin = readFileSync(join(racine, "src", "server", "admin", "index.ts"), "utf8");
    expect(admin).toContain("auth.admin.createUser(");
    expect(admin).toContain("email_confirm: true");
    for (const f of CODE) {
      const texte = readFileSync(f, "utf8");
      expect(texte, relative(racine, f)).not.toMatch(/user_metadata|app_metadata/);
    }
  });

  it("seul src/server/admin crée un compte", () => {
    const createurs = CODE.filter((f) => readFileSync(f, "utf8").includes("createUser("));
    expect(createurs.map((f) => relative(racine, f).replace(/\\/g, "/"))).toEqual(["src/server/admin/index.ts"]);
  });
});

describe("réglages d'Auth versionnés (supabase/config.toml)", () => {
  const config = readFileSync(join(racine, "supabase", "config.toml"), "utf8");
  /** Lignes de la section `[auth]` seule (jusqu'à la section suivante). */
  const sectionAuth = config.split(/^\[auth\]\s*$/m)[1]?.split(/^\[/m)[0] ?? "";

  it("inscriptions fermées", () => {
    expect(sectionAuth).toMatch(/^enable_signup = false\r?$/m);
    expect(sectionAuth).not.toMatch(/^enable_signup = true\r?$/m);
  });

  it("12 caractères au moins pour un mot de passe", () => {
    expect(sectionAuth).toMatch(/^minimum_password_length = 12\r?$/m);
  });

  it("connexion anonyme toujours fermée", () => {
    expect(sectionAuth).toMatch(/^enable_anonymous_sign_ins = false\r?$/m);
  });
});

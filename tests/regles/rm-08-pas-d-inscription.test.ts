import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";

// RM-8 : personne ne peut s'inscrire seul ; seul un administrateur crée les
// comptes (FR-21, AD-6).
// - aucune page ni route d'inscription : `/inscription` affiche S2 ;
// - aucun appel à `auth.signUp` dans le code ;
// - aucun rôle écrit dans les métadonnées du compte Supabase ;
// - dans l'application, une seule Server Function crée un compte
//   (`actionCreerCompte`, écran A1, story 3.2), réservée aux administrateurs,
//   sans aucun email envoyé ; le nouveau compte doit choisir son mot de passe
//   à sa première connexion (I2) ;
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

describe("RM-8 : dans l'application, seul un administrateur crée un compte (story 3.2)", () => {
  const nettoyer = (texte: string) => texte.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

  it("une seule Server Function appelle creerCompte : actionCreerCompte, qui commence par exigerAdministrateur()", () => {
    const appelants = CODE.filter((f) => /\bcreerCompte\(/.test(nettoyer(readFileSync(f, "utf8"))))
      .map((f) => relative(racine, f).replace(/\\/g, "/"))
      .filter((f) => f !== "src/server/admin/index.ts");
    // L'écran A1 et la procédure d'installation (depuis le poste, avec la clé secrète).
    expect(appelants.sort()).toEqual(["scripts/installation/creer-compte.ts", "src/server/actions/creer-compte.ts"]);

    const action = nettoyer(readFileSync(join(racine, "src", "server", "actions", "creer-compte.ts"), "utf8"));
    expect(action).toMatch(/^"use server";/);
    expect(action).toMatch(
      /return executerAction\(async \(\) => \{\s*const administrateur = await exigerAdministrateur\(\);\s*if \(!administrateur\) return echec\("ACCES_REFUSE"/,
    );
    expect(action).toContain("creerCompte(saisie, { auteur: administrateur.id })");
  });

  it("aucun email envoyé : ni invitation, ni lien magique, ni réinitialisation par email", () => {
    for (const f of CODE) {
      expect(readFileSync(f, "utf8"), relative(racine, f)).not.toMatch(
        /inviteUserByEmail|signInWithOtp|resetPasswordForEmail|generateLink/,
      );
    }
  });

  it("le nouveau compte doit choisir son mot de passe à sa première connexion (doit_changer_mdp = vrai)", () => {
    const migration = readFileSync(join(racine, "supabase", "migrations", "20261120090000_comptes.sql"), "utf8");
    const creerProfil = migration.match(/create function public\.creer_profil\([\s\S]*?\$\$;/)?.[0] ?? "";
    expect(creerProfil).toMatch(
      /insert into public\.profils \(id, nom, email, role, actif, doit_changer_mdp\)\s*values \(p_id, btrim\(p_nom\), btrim\(p_email\), p_role, true, true\);/,
    );
    // La garde envoie vers I2 tant que ce drapeau est vrai (story 1.7).
    const garde = readFileSync(join(racine, "src", "server", "garde", "index.ts"), "utf8");
    expect(garde).toContain("if (utilisateur.doitChangerMdp) redirect(ADRESSE_NOUVEAU_MOT_DE_PASSE);");
  });

  it("le mot de passe temporaire est tiré dans le navigateur, 16 caractères, au moins 12", async () => {
    const { genererMotDePasseTemporaire } = await import("@/shared/mot-de-passe-temporaire");
    const { validerCompte } = await import("@/shared/schemas/compte");
    const motDePasse = genererMotDePasseTemporaire();
    expect(motDePasse.length).toBeGreaterThanOrEqual(12);
    expect(
      validerCompte({ nom: "Lucas Bernard", email: "lucas@exemple.fr", role: "collaborateur", motDePasseTemporaire: motDePasse }).ok,
    ).toBe(true);
    expect(
      validerCompte({ nom: "Lucas Bernard", email: "lucas@exemple.fr", role: "collaborateur", motDePasseTemporaire: "Kp7mWq2xTz9" }),
    ).toEqual({ ok: false, champs: { motDePasseTemporaire: "12 caractères minimum" } });
  });
});

describe("RM-8 : la Server Function de création, appelée directement", () => {
  // Supabase simulé : aucun compte n'est créé (un compte ne se supprime jamais sur dev).
  it("par un collaborateur : ACCES_REFUSE, aucun appel à Supabase pour créer un compte", async () => {
    vi.resetModules();
    const connexion = (await import("../aides/supabase-connexion")).creerSimulationConnexion();
    const admin = (await import("../aides/supabase-admin")).creerSimulation();
    vi.doMock("@/server/supabase-secret", () => ({ creerClientSecret: admin.creerClientSecret }));
    vi.doMock("@/lib/supabase/server", () => ({ createClient: connexion.createClient }));
    vi.doMock("next/headers", () => ({ cookies: connexion.cookies }));
    vi.doMock("next/cache", () => ({ refresh: () => {} }));
    try {
      connexion.reinitialiser();
      connexion.session.id = (await import("../aides/supabase-connexion")).ID_KARIM;
      const { actionCreerCompte } = await import("@/server/actions/creer-compte");
      const reponse = await actionCreerCompte({
        nom: "Intrus",
        email: "intrus@exemple.fr",
        role: "administrateur",
        motDePasseTemporaire: "Kp7mWq2xTz9aBc4d",
      });
      expect(reponse).toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
      expect(admin.creerClientSecret).not.toHaveBeenCalled();
      expect(admin.createUser).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("@/server/supabase-secret");
      vi.doUnmock("@/lib/supabase/server");
      vi.doUnmock("next/headers");
      vi.doUnmock("next/cache");
      vi.unstubAllEnvs();
    }
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

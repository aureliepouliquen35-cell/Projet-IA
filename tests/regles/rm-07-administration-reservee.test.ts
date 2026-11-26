import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RM-7 : un collaborateur n'a accès à aucune fonction d'administration
// (FR-24, AD-7, AD-9). Cacher le menu ne suffit pas : le serveur refuse.
// - le menu d'un collaborateur ne contient aucune section, aucun lien ni
//   bouton d'administration ;
// - s'il tape l'adresse d'une page d'administration, il voit S1 « Accès
//   refusé », sans aucune donnée ;
// - la protection est vérifiée trois fois : dans la page, dans la lecture
//   (`exigerAdministrateur()`) et dans la fonction SQL (`exiger_administrateur`,
//   refus NV202), qui refuse aussi un appel direct avec sa session ;
// - le rôle est relu dans `profils` à chaque requête, jamais dans les
//   métadonnées du compte Supabase.
// Supabase est simulé ; la fonction SQL est vérifiée ici sur son texte, et
// son refus réel sur dev par `tests/e2e/administration.spec.ts`.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `connection()` n'a de sens que pendant une vraie requête Next.js.
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
// `refresh()` n'a de sens que pendant une vraie Server Function de Next.js.
vi.mock("next/cache", () => ({ refresh }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  usePathname: () => "/admin/comptes",
  useRouter: () => ({ refresh: () => {} }),
}));

import { ContenuCategories } from "@/app/(interne)/admin/categories/contenu-categories";
import { ContenuComptes } from "@/app/(interne)/admin/comptes/contenu-comptes";
import { SectionAdministration } from "@/components/interne/section-administration";
import { createClient } from "@/lib/supabase/server";
import { actionAjouterCategorie } from "@/server/actions/ajouter-categorie";
import { actionChangerEtatCategorie } from "@/server/actions/changer-etat-categorie";
import { actionChangerEtatCompte } from "@/server/actions/changer-etat-compte";
import { actionCreerCompte } from "@/server/actions/creer-compte";
import { actionModifierCompte } from "@/server/actions/modifier-compte";
import { actionReinitialiserMotDePasse } from "@/server/actions/reinitialiser-mot-de-passe";
import { actionSupprimerCategorie } from "@/server/actions/supprimer-categorie";
import { actionSupprimerDemande } from "@/server/actions/supprimer-demande";
import { exigerAdministrateur } from "@/server/garde";
import { actionRenommerCategorie } from "@/server/actions/renommer-categorie";
import { lireCategoriesAdministration } from "@/server/lectures/categories";
import { lireComptes } from "@/server/lectures/comptes";

import { texteDe } from "../aides/formulaire-depot";
import { CATEGORIES_DEPART, fabriquerDemandes, ID_KARIM, ID_SOPHIE, PROFIL_SOPHIE } from "../aides/supabase-connexion";

const racine = process.cwd();
const S1 = "Accès refusé. Cette page est réservée aux administrateurs.";

/**
 * Début de chaque Server Function d'administration (commentaires retirés) :
 * `exigerAdministrateur()` en premier ; refusé, la page est recalculée
 * (`refresh()`, story 3.3) avant la réponse `ACCES_REFUSE`.
 */
const DEBUT_ACTION_RESERVEE =
  /executerAction\(async \(\) => \{\s*const administrateur = await exigerAdministrateur\(\);\s*if \(!administrateur\) \{\s*refresh\(\);\s*return echec\("ACCES_REFUSE"/;

/** Server Functions d'administration (écrans A1 et A2, suppression d'une demande), toutes réservées aux administrateurs. */
const ACTIONS_ADMINISTRATION = [
  "creer-compte.ts",
  "changer-etat-compte.ts",
  "reinitialiser-mot-de-passe.ts",
  "modifier-compte.ts",
  "supprimer-demande.ts",
  "ajouter-categorie.ts",
  "renommer-categorie.ts",
  "changer-etat-categorie.ts",
  "supprimer-categorie.ts",
];

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

const MIGRATION = readFileSync(join(racine, "supabase", "migrations", "20261124160000_comptes_administration.sql"), "utf8")
  .replace(/--.*$/gm, "")
  .toLowerCase();

beforeEach(() => {
  simulation.reinitialiser();
  simulation.profils.set(ID_SOPHIE, { ...PROFIL_SOPHIE });
  // Karim, collaborateur actif, est connecté.
  simulation.session.id = ID_KARIM;
  refresh.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("RM-7 : un collaborateur ne voit aucune administration", () => {
  it("menu : aucune section, aucun lien ni bouton d'administration", async () => {
    // Seul le suivi du rôle (story 3.3) est rendu, et il n'affiche rien.
    expect(renderToStaticMarkup(await SectionAdministration())).toBe("");
  });

  it("le même menu, pour un administrateur : la section, « Comptes » et « Catégories »", async () => {
    simulation.session.id = ID_SOPHIE;
    const section = await SectionAdministration();
    expect(texteDe(renderToStaticMarkup(section))).toBe("Administration Comptes Catégories");
  });
});

describe("RM-7 : le serveur refuse, même si l'adresse est tapée", () => {
  it("page « Comptes » : écran S1 seul, aucune donnée de compte, aucune lecture", async () => {
    const html = renderToStaticMarkup(await ContenuComptes());
    expect(texteDe(html)).toBe(`${S1} Retour aux demandes`);
    expect(html).not.toMatch(/Sophie|Karim|@/);
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("garde : null pour un collaborateur, la personne pour un administrateur", async () => {
    await expect(exigerAdministrateur()).resolves.toBeNull();
    simulation.session.id = ID_SOPHIE;
    await expect(exigerAdministrateur()).resolves.toMatchObject({ id: ID_SOPHIE, role: "administrateur" });
  });

  it("lecture appelée directement : refusée, sans appel à la base", async () => {
    await expect(lireComptes()).resolves.toEqual({ ok: false, accesRefuse: true });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  // Simulation seulement : le refus de la vraie base est vérifié sur dev par
  // `tests/e2e/administration.spec.ts`.
  it("règle simulée de lister_comptes, appelée directement avec la session du collaborateur : refus NV202", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("lister_comptes").abortSignal(AbortSignal.timeout(1000));
    expect(data).toBeNull();
    expect(error).toMatchObject({ code: "NV202" });
  });

  it("rôle « administrateur » écrit dans les métadonnées de la session : sans effet", async () => {
    const claims = {
      data: { claims: { sub: ID_KARIM, user_metadata: { role: "administrateur" }, app_metadata: { role: "administrateur" } } },
      error: null,
    } as never;
    // Une lecture de la session pour la garde, une pour la page.
    simulation.getClaims.mockResolvedValueOnce(claims).mockResolvedValueOnce(claims);
    await expect(exigerAdministrateur()).resolves.toBeNull();
    expect(texteDe(renderToStaticMarkup(await ContenuComptes()))).toBe(`${S1} Retour aux demandes`);
  });

  it("administrateur rétrogradé : S1 dès sa prochaine requête", async () => {
    simulation.session.id = ID_SOPHIE;
    expect(texteDe(renderToStaticMarkup(await ContenuComptes()))).toMatch(/^Comptes /);
    simulation.profils.get(ID_SOPHIE)!.role = "collaborateur";
    expect(texteDe(renderToStaticMarkup(await ContenuComptes()))).toBe(`${S1} Retour aux demandes`);
  });
});

describe("RM-7 : la base vérifie elle-même l'appelant (texte de la migration)", () => {
  const corps = (nom: string) =>
    MIGRATION.match(new RegExp(`create function public\\.${nom}\\(\\)[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`))?.[1] ?? "";

  it("exiger_administrateur : rôle administrateur, profil actif, relu dans profils ; sinon NV202", () => {
    const garde = corps("exiger_administrateur");
    expect(garde).toContain("auth.uid()");
    expect(garde).toMatch(/from public\.profils p[\s\S]*p\.actif[\s\S]*p\.role = 'administrateur'/);
    expect(garde).toContain("errcode = 'nv202'");
    expect(garde).not.toMatch(/metadata|jwt/);
  });

  it("lister_comptes : vérifie l'appelant avant toute lecture ; exécutable par authenticated seul", () => {
    expect(corps("lister_comptes").trim()).toMatch(/^begin\s+perform public\.exiger_administrateur\(\);/);
    expect(MIGRATION).toContain("revoke execute on function public.lister_comptes() from anon;");
    expect(MIGRATION).toContain("grant execute on function public.lister_comptes() to authenticated;");
  });
});

describe("RM-7 : chaque page et chaque lecture d'administration vérifient le rôle", () => {
  it("toute page sous src/app/(interne)/admin passe par exigerAdministrateur", () => {
    const dossier = join(racine, "src", "app", "(interne)", "admin");
    const contenus = fichiers(dossier).filter((f) => /contenu-[\w-]+\.tsx$/.test(f));
    expect(contenus.length).toBeGreaterThan(0);
    for (const fichier of contenus) {
      expect(readFileSync(fichier, "utf8"), relative(racine, fichier)).toContain("await exigerAdministrateur()");
    }
    // Les pages ne lisent rien elles-mêmes : tout passe par leur contenu.
    for (const page of fichiers(dossier).filter((f) => f.endsWith("page.tsx"))) {
      expect(readFileSync(page, "utf8"), relative(racine, page)).not.toMatch(/@\/server\/lectures/);
    }
  });

  it("la lecture des comptes commence par exigerAdministrateur", () => {
    const source = readFileSync(join(racine, "src", "server", "lectures", "comptes.ts"), "utf8");
    expect(source).toMatch(/cache\(async \(\): Promise<LectureComptes> => \{\s*if \(!\(await exigerAdministrateur\(\)\)\) return ACCES_REFUSE;/);
  });

  it("la liste des comptes ne lit jamais la table profils : seulement la fonction SQL", () => {
    // Les seules lectures directes de `profils` sont celles de la propre
    // ligne de la personne connectée (règle RLS « sa propre ligne »).
    const code = fichiers(join(racine, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
    const lecteurs = code.filter((f) => /\.from\(\s*["'`]profils["'`]\s*\)/.test(readFileSync(f, "utf8")));
    expect(lecteurs.map((f) => relative(racine, f).replace(/\\/g, "/")).sort()).toEqual([
      "src/lib/supabase/proxy.ts",
      "src/server/connexion/index.ts",
      "src/server/garde/index.ts",
    ]);
    const lecture = readFileSync(join(racine, "src", "server", "lectures", "comptes.ts"), "utf8");
    expect(lecture).not.toContain(".from(");
    expect(lecture).toContain('.rpc("lister_comptes")');
  });
});

describe("RM-7 : réinitialiser un mot de passe est réservé aux administrateurs (story 3.5)", () => {
  it("collaborateur qui appelle la Server Function directement : « Accès refusé. », aucun appel, aucun mot de passe changé", async () => {
    const reponse = await actionReinitialiserMotDePasse({ compteId: ID_SOPHIE, motDePasseTemporaire: "Kp7mWq2xTz9aBc4d" });
    expect(reponse).toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(simulation.creerClientSecret).not.toHaveBeenCalled();
    expect(simulation.updateUserById).not.toHaveBeenCalled();
    expect(simulation.profils.get(ID_SOPHIE)!.doit_changer_mdp).toBe(false);
  });

  it("la Server Function commence par exigerAdministrateur ; la fonction SQL revérifie l'auteur et n'est exécutable que par service_role", () => {
    const action = readFileSync(join(racine, "src", "server", "actions", "reinitialiser-mot-de-passe.ts"), "utf8")
      .replace(/\/\/.*$/gm, "");
    expect(action).toMatch(DEBUT_ACTION_RESERVEE);
    const migration = readFileSync(join(racine, "supabase", "migrations", "20261125120000_reinitialiser_mot_de_passe.sql"), "utf8")
      .replace(/--.*$/gm, "")
      .toLowerCase();
    expect(migration).toMatch(/p\.id = p_auteur\s+and p\.actif\s+and not p\.doit_changer_mdp\s+and p\.role = 'administrateur'/);
    expect(migration).toContain("revoke execute on function public.reinitialiser_mdp(uuid, uuid, text) from authenticated;");
    expect(migration).toContain("grant execute on function public.reinitialiser_mdp(uuid, uuid, text) to service_role;");
  });
});

describe("RM-7 : modifier le nom ou le rôle est réservé aux administrateurs (story 3.3)", () => {
  it("collaborateur qui appelle la Server Function directement : « Accès refusé. », aucun appel, rien ne change", async () => {
    const reponse = await actionModifierCompte({ compteId: ID_KARIM, nom: "Karim Benali", role: "administrateur" });
    expect(reponse).toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(simulation.creerClientSecret).not.toHaveBeenCalled();
    expect(simulation.profils.get(ID_KARIM)!.role).toBe("collaborateur");
  });

  it("rôle « administrateur » écrit dans les métadonnées de la session : toujours refusé (rôle relu dans profils)", async () => {
    const claims = {
      data: { claims: { sub: ID_KARIM, user_metadata: { role: "administrateur" }, app_metadata: { role: "administrateur" } } },
      error: null,
    } as never;
    simulation.getClaims.mockResolvedValueOnce(claims);
    await expect(actionModifierCompte({ compteId: ID_KARIM, nom: "Karim", role: "administrateur" })).resolves.toMatchObject({
      code: "ACCES_REFUSE",
    });
    expect(simulation.profils.get(ID_KARIM)!.role).toBe("collaborateur");
  });

  it("la fonction SQL revérifie l'auteur et n'est exécutable que par service_role", () => {
    const migration = readFileSync(join(racine, "supabase", "migrations", "20261126090000_modifier_compte.sql"), "utf8")
      .replace(/--.*$/gm, "")
      .toLowerCase();
    expect(migration).toMatch(/p\.id = p_auteur\s+and p\.actif\s+and not p\.doit_changer_mdp\s+and p\.role = 'administrateur'/);
    const signature = "public.modifier_compte(uuid, uuid, boolean, text, text)";
    for (const role of ["public", "anon", "authenticated"]) {
      expect(migration).toContain(`revoke execute on function ${signature} from ${role};`);
    }
    expect(migration).toContain(`grant execute on function ${signature} to service_role;`);
  });
});

describe("RM-7 : un administrateur rétrogradé perd l'administration à sa prochaine action (story 3.3)", () => {
  beforeEach(() => {
    // Sophie, encore sur A1, vient d'être passée collaboratrice par un autre administrateur.
    simulation.session.id = ID_SOPHIE;
    simulation.profils.get(ID_SOPHIE)!.role = "collaborateur";
  });

  it.each([
    ["créer un compte", () => actionCreerCompte({ nom: "Lucas Bernard", email: "lucas@exemple.fr", role: "collaborateur", motDePasseTemporaire: "Kp7mWq2xTz9aBc4d" })],
    ["désactiver", () => actionChangerEtatCompte({ compteId: ID_KARIM, actif: false })],
    ["réinitialiser un mot de passe", () => actionReinitialiserMotDePasse({ compteId: ID_KARIM, motDePasseTemporaire: "Kp7mWq2xTz9aBc4d" })],
    ["modifier un compte", () => actionModifierCompte({ compteId: ID_KARIM, nom: "Karim", role: "administrateur" })],
    ["supprimer une demande", () => actionSupprimerDemande({ reference: "NOVA-2026-0001" })],
    ["ajouter une catégorie", () => actionAjouterCategorie({ nom: "Facturation" })],
    ["renommer une catégorie", () => actionRenommerCategorie({ categorieId: CATEGORIES_DEPART[4].id, nom: "Divers" })],
    ["désactiver une catégorie", () => actionChangerEtatCategorie({ categorieId: CATEGORIES_DEPART[4].id, active: false })],
    ["supprimer une catégorie", () => actionSupprimerCategorie({ categorieId: CATEGORIES_DEPART[4].id })],
  ])("%s : « Accès refusé. », rien n'est appelé, et la page est recalculée (S1, menu sans Administration)", async (_, agir) => {
    await expect(agir()).resolves.toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(simulation.creerClientSecret).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("le menu recalculé n'a plus la section Administration, et la page A1 affiche S1", async () => {
    expect(renderToStaticMarkup(await SectionAdministration())).toBe("");
    expect(texteDe(renderToStaticMarkup(await ContenuComptes()))).toBe(`${S1} Retour aux demandes`);
  });

  it("chaque Server Function d'administration commence par exigerAdministrateur, puis refresh() avant ACCES_REFUSE", () => {
    for (const fichier of ACTIONS_ADMINISTRATION) {
      const source = readFileSync(join(racine, "src", "server", "actions", fichier), "utf8").replace(/\/\/.*$/gm, "");
      expect(source, fichier).toMatch(/^"use server";/);
      expect(source, fichier).toMatch(DEBUT_ACTION_RESERVEE);
    }
  });
});

describe("RM-7 : supprimer une demande est réservé aux administrateurs (story 4.4)", () => {
  beforeEach(() => {
    simulation.demandes.push(...fabriquerDemandes(3));
  });

  it("collaborateur qui appelle la Server Function directement : « Accès refusé. », aucun appel, rien d'effacé", async () => {
    const reponse = await actionSupprimerDemande({ reference: "NOVA-2026-0003" });
    expect(reponse).toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
    expect(simulation.demandes).toHaveLength(3);
  });

  // Simulation seulement : le refus de la vraie base est vérifié sur dev par
  // `tests/e2e/administration.spec.ts`.
  it("règle simulée de supprimer_demande, appelée directement avec la session du collaborateur : NV202, rien d'effacé", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("supprimer_demande", { p_reference: "NOVA-2026-0003" })
      .abortSignal(AbortSignal.timeout(1000));
    expect(data).toBeNull();
    expect(error).toMatchObject({ code: "NV202" });
    expect(simulation.demandes).toHaveLength(3);
  });

  it("la fonction SQL commence par exiger_administrateur et n'est exécutable que par authenticated (la session)", () => {
    const migration = readFileSync(join(racine, "supabase", "migrations", "20261126120000_supprimer_demande.sql"), "utf8")
      .replace(/--.*$/gm, "")
      .toLowerCase();
    expect(migration).toMatch(/\bbegin\s+perform public\.exiger_administrateur\(\);/);
    expect(migration).toMatch(/security definer\s+set search_path = ''/);
    const signature = "public.supprimer_demande(text)";
    for (const role of ["public", "anon", "service_role"]) {
      expect(migration).toContain(`revoke execute on function ${signature} from ${role};`);
    }
    expect(migration).toContain(`grant execute on function ${signature} to authenticated;`);
  });
});

describe("RM-7 : les catégories (écran A2) sont réservées aux administrateurs (story 4.1)", () => {
  const MIGRATION_CATEGORIES = readFileSync(
    join(racine, "supabase", "migrations", "20261126150000_categories_administration.sql"),
    "utf8",
  )
    .replace(/--.*$/gm, "")
    .toLowerCase();

  it("page « Catégories » tapée par un collaborateur : écran S1 seul, aucune donnée, aucune lecture", async () => {
    const html = renderToStaticMarkup(await ContenuCategories());
    expect(texteDe(html)).toBe(`${S1} Retour aux demandes`);
    expect(html).not.toMatch(/Nouvelle catégorie|tableau-categories|Problème technique/);
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("lecture appelée directement : refusée, sans appel à la base", async () => {
    await expect(lireCategoriesAdministration()).resolves.toEqual({ ok: false, accesRefuse: true });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it.each([
    ["ajouter", () => actionAjouterCategorie({ nom: "Facturation" })],
    ["renommer", () => actionRenommerCategorie({ categorieId: CATEGORIES_DEPART[4].id, nom: "Divers" })],
    ["désactiver (story 4.2)", () => actionChangerEtatCategorie({ categorieId: CATEGORIES_DEPART[4].id, active: false })],
    ["supprimer (story 4.2)", () => actionSupprimerCategorie({ categorieId: CATEGORIES_DEPART[4].id })],
  ])("Server Function « %s » appelée directement : « Accès refusé. », aucun appel, rien n'est écrit", async (_, agir) => {
    await expect(agir()).resolves.toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
    expect(simulation.categories.map((c) => [c.nom, c.active])).toEqual(CATEGORIES_DEPART.map((c) => [c.nom, true]));
  });

  // Simulation seulement : le refus de la vraie base est vérifié sur dev par
  // `tests/e2e/administration.spec.ts`.
  it.each([
    ["lister_categories_administration", {}],
    ["ajouter_categorie", { p_nom: "Facturation" }],
    ["modifier_categorie", { p_categorie: CATEGORIES_DEPART[4].id, p_nom: "Divers" }],
    ["modifier_categorie", { p_categorie: CATEGORIES_DEPART[4].id, p_active: false }],
    ["modifier_categorie", { p_categorie: CATEGORIES_DEPART[4].id, p_supprimer: true }],
  ])("règle simulée de %s, appelée directement avec la session du collaborateur : NV202, rien n'est écrit", async (nom, parametres) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(nom, parametres).abortSignal(AbortSignal.timeout(1000));
    expect(data).toBeNull();
    expect(error).toMatchObject({ code: "NV202" });
    expect(simulation.categories.map((c) => [c.nom, c.active])).toEqual(CATEGORIES_DEPART.map((c) => [c.nom, true]));
  });

  it("la lecture des catégories commence par exigerAdministrateur", () => {
    const source = readFileSync(join(racine, "src", "server", "lectures", "categories.ts"), "utf8");
    expect(source).toMatch(
      /cache\(async \(\): Promise<LectureCategories> => \{\s*if \(!\(await exigerAdministrateur\(\)\)\) return ACCES_REFUSE;/,
    );
    expect(source).not.toContain(".from(");
    expect(source).toContain('.rpc("lister_categories_administration")');
  });

  it("chaque fonction SQL commence par exiger_administrateur et n'est exécutable que par authenticated (la session)", () => {
    for (const [nom, signature] of [
      ["lister_categories_administration", "public.lister_categories_administration()"],
      ["ajouter_categorie", "public.ajouter_categorie(text)"],
      ["modifier_categorie", "public.modifier_categorie(uuid, text)"],
    ]) {
      const corps =
        MIGRATION_CATEGORIES.match(
          new RegExp(`create function public\\.${nom}\\([^)]*\\)[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`),
        )?.[1] ?? "";
      expect(corps, nom).toMatch(/\bbegin\s+perform public\.exiger_administrateur\(\);/);
      for (const role of ["public", "anon", "service_role"]) {
        expect(MIGRATION_CATEGORIES).toContain(`revoke execute on function ${signature} from ${role};`);
      }
      expect(MIGRATION_CATEGORIES).toContain(`grant execute on function ${signature} to authenticated;`);
    }
  });

  it("story 4.2 : la nouvelle modifier_categorie commence par exiger_administrateur et n'est exécutable que par authenticated", () => {
    const migration = readFileSync(
      join(racine, "supabase", "migrations", "20261127090000_desactiver_supprimer_categorie.sql"),
      "utf8",
    )
      .replace(/--.*$/gm, "")
      .toLowerCase();
    const corps =
      migration.match(/create function public\.modifier_categorie\([^)]*\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/)?.[1] ?? "";
    expect(corps).toMatch(/\bbegin\s+perform public\.exiger_administrateur\(\);/);
    expect(migration).toMatch(/security definer\s+set search_path = ''/);
    const signature = "public.modifier_categorie(uuid, text, boolean, boolean)";
    for (const role of ["public", "anon", "service_role"]) {
      expect(migration).toContain(`revoke execute on function ${signature} from ${role};`);
    }
    expect(migration).toContain(`grant execute on function ${signature} to authenticated;`);
  });

  it("l'application n'écrit jamais directement dans categories", () => {
    const code = fichiers(join(racine, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
    for (const fichier of code) {
      const source = readFileSync(fichier, "utf8");
      expect(source, relative(racine, fichier)).not.toMatch(
        /\.from\(\s*["'`]categories["'`]\s*\)\s*\.(insert|update|upsert|delete)\(/,
      );
    }
  });
});

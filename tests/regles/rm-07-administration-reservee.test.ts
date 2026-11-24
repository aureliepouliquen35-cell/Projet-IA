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

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `connection()` n'a de sens que pendant une vraie requête Next.js.
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  usePathname: () => "/admin/comptes",
}));

import { ContenuComptes } from "@/app/(interne)/admin/comptes/contenu-comptes";
import { SectionAdministration } from "@/components/interne/section-administration";
import { createClient } from "@/lib/supabase/server";
import { exigerAdministrateur } from "@/server/garde";
import { lireComptes } from "@/server/lectures/comptes";

import { texteDe } from "../aides/formulaire-depot";
import { ID_KARIM, ID_SOPHIE, PROFIL_SOPHIE } from "../aides/supabase-connexion";

const racine = process.cwd();
const S1 = "Accès refusé. Cette page est réservée aux administrateurs.";

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
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("RM-7 : un collaborateur ne voit aucune administration", () => {
  it("menu : aucune section, aucun lien ni bouton d'administration", async () => {
    await expect(SectionAdministration()).resolves.toBeNull();
  });

  it("le même menu, pour un administrateur : la section et « Comptes »", async () => {
    simulation.session.id = ID_SOPHIE;
    const section = await SectionAdministration();
    expect(texteDe(renderToStaticMarkup(section!))).toBe("Administration Comptes");
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

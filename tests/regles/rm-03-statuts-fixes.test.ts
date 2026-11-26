import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RM-3 : les trois statuts *Nouvelle*, *En cours* et *Traitée* sont fixes.
// Aucun écran ne permet d'en ajouter, d'en renommer ou d'en supprimer
// (story 4.2, critère 4). Vérifié sur le code : l'espace d'administration
// (pages, menu, Server Functions) et les migrations. Supabase est simulé
// pour le rendu du menu.

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
  usePathname: () => "/admin/categories",
  useRouter: () => ({ refresh: () => {} }),
}));

import { SectionAdministration } from "@/components/interne/section-administration";
import { STATUTS } from "@/shared/constantes";

import { texteDe } from "../aides/formulaire-depot";
import { ID_SOPHIE, PROFIL_SOPHIE } from "../aides/supabase-connexion";

const racine = process.cwd();
const ADMIN = join(racine, "src", "app", "(interne)", "admin");
const ACTIONS = join(racine, "src", "server", "actions");
const MIGRATIONS = join(racine, "supabase", "migrations");

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

/** Code sans commentaires. */
const code = (fichier: string) => readFileSync(fichier, "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");

beforeEach(() => {
  simulation.reinitialiser();
  simulation.profils.set(ID_SOPHIE, { ...PROFIL_SOPHIE });
  simulation.session.id = ID_SOPHIE;
});

describe("RM-3 : trois statuts fixes", () => {
  it("la liste des statuts est écrite dans le code et dans la contrainte de la base, jamais dans une table", () => {
    expect(STATUTS).toEqual(["nouvelle", "en_cours", "traitee"]);
    const depot = readFileSync(join(MIGRATIONS, "20261119180000_depot_demande.sql"), "utf8").toLowerCase();
    expect(depot).toMatch(/constraint demandes_statut_check\s+check \(statut in \('nouvelle', 'en_cours', 'traitee'\)\)/);
    for (const fichier of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(join(MIGRATIONS, fichier), "utf8").replace(/--.*$/gm, "").toLowerCase();
      expect(sql, fichier).not.toMatch(/create table [\w.]*statut/);
      expect(sql, fichier).not.toMatch(/(drop|alter) constraint demandes_statut_check/);
    }
  });
});

describe("RM-3 : l'espace d'administration ne gère pas les statuts", () => {
  it("aucune page d'administration ne porte sur les statuts", () => {
    expect(fichiers(ADMIN).some((f) => f.endsWith("page.tsx"))).toBe(true);
    for (const fichier of fichiers(ADMIN)) {
      expect(relative(racine, fichier), relative(racine, fichier)).not.toMatch(/statut/i);
    }
  });

  it("aucune page d'administration n'utilise les statuts ni ne change un statut", () => {
    for (const fichier of fichiers(ADMIN).filter((f) => /\.(ts|tsx)$/.test(f))) {
      const source = code(fichier);
      expect(source, relative(racine, fichier)).not.toMatch(/STATUTS|LIBELLES_STATUTS|changer-statut|actionChangerStatut/);
    }
  });

  it("le menu d'administration n'a aucune entrée sur les statuts", async () => {
    const element = await SectionAdministration();
    const html = element ? renderToStaticMarkup(element) : "";
    expect(html).toContain('data-slot="section-administration"');
    expect(texteDe(html)).not.toMatch(/statut|nouvelle|en cours|traitée/i);
    for (const [, adresse] of html.matchAll(/<a [^>]*href="([^"]*)"/g)) {
      expect(adresse).toMatch(/^\/admin\//);
      expect(adresse).not.toMatch(/statut/i);
    }
  });

  it("aucune Server Function n'ajoute, ne renomme ni ne supprime un statut ; seule changer-statut change celui d'une demande", () => {
    const parStatut = readdirSync(ACTIONS).filter((f) => /statut/i.test(f));
    expect(parStatut).toEqual(["changer-statut.ts"]);
    for (const fichier of readdirSync(ACTIONS)) {
      expect(fichier).not.toMatch(/(ajouter|renommer|supprimer|creer)-statut/);
    }
    // Les Server Functions d'administration (celles qui commencent par
    // `exigerAdministrateur`) ne touchent pas aux statuts.
    const administration = readdirSync(ACTIONS).filter((f) => code(join(ACTIONS, f)).includes("exigerAdministrateur()"));
    expect(administration).toContain("supprimer-categorie.ts");
    for (const fichier of administration) {
      expect(code(join(ACTIONS, fichier)), fichier).not.toMatch(/statut/i);
    }
  });
});

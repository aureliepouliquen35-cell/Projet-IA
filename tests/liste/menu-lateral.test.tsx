import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Menu latéral de l'espace interne (story 1.8 ; EXPERIENCE.md, Information
// Architecture ; DESIGN.md, Menu latéral ; NFR-4) : logo, « Demandes » avec
// sa pastille annoncée « à traiter », nom et rôle, « Se déconnecter »,
// numéro de version. Supabase est simulé.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);
const chemin = vi.hoisted(() => ({ valeur: "/demandes" as string | null }));

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `connection()` n'a de sens que pendant une vraie requête Next.js.
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  usePathname: () => chemin.valeur,
}));

import LayoutInterne from "@/app/(interne)/layout";
import { estActif, LienMenu, VueLienMenu } from "@/components/interne/lien-menu";
import { MenuLateral, PastilleATraiter, VERSION } from "@/components/interne/menu-lateral";
import { UtilisateurConnecte } from "@/components/interne/utilisateur-connecte";

import { texteDe } from "../aides/formulaire-depot";
import { fabriquerDemandes, ID_KARIM } from "../aides/supabase-connexion";

import paquet from "../../package.json";

beforeEach(() => {
  simulation.reinitialiser();
  simulation.session.id = ID_KARIM;
  chemin.valeur = "/demandes";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const rendreAsync = async (element: Promise<ReactElement | null>) => {
  const resolu = await element;
  return resolu ? renderToStaticMarkup(resolu) : "";
};

describe("menu latéral", () => {
  it("logo, « Demandes », numéro de version de package.json (AD-17)", () => {
    const html = renderToStaticMarkup(<MenuLateral />);
    expect(html).toContain('aria-label="Nova Services"');
    expect(html).toMatch(/<nav aria-label="Menu principal"/);
    expect(html).toMatch(/<a[^>]*href="\/demandes"/);
    expect(VERSION).toBe(paquet.version);
    expect(texteDe(html)).toContain(`Version v${paquet.version}`);
  });

  it("« Nouvelle demande » (story 2.3, icône plus dans un carré) après « Demandes » ; section Administration absente de la coque (rendue sous <Suspense> pour les seuls administrateurs, story 3.1)", () => {
    const html = renderToStaticMarkup(<MenuLateral />);
    expect(html).toMatch(/<a[^>]*href="\/demandes\/nouvelle"[^>]*>.*lucide-square-plus.*Nouvelle demande<\/span><\/a>/);
    expect(html.indexOf('href="/demandes"')).toBeLessThan(html.indexOf('href="/demandes/nouvelle"'));
    expect(texteDe(html)).not.toMatch(/Administration|Comptes|Catégories/);
  });

  it("fixe à gauche (240 px) à partir de 1 024 px, bandeau en haut en dessous", () => {
    const html = renderToStaticMarkup(<MenuLateral />);
    const classes = html.match(/<aside[^>]*class="([^"]*)"/)?.[1] ?? "";
    expect(classes).toContain("lg:w-sidebar");
    expect(classes).toContain("lg:sticky");
    expect(classes).toContain("lg:flex-col");
    expect(classes).toContain("border-b");
  });

  it("nom, rôle et « Se déconnecter » en bas du menu, lus sous <Suspense>", async () => {
    const html = await rendreAsync(UtilisateurConnecte());
    expect(html).toMatch(/data-slot="nom-utilisateur"[^>]*>Karim Benali<\/p>/);
    expect(html).toMatch(/data-slot="role-utilisateur"[^>]*>Collaborateur<\/p>/);
    expect(texteDe(html)).toContain("Se déconnecter");
    const source = readFileSync(join(process.cwd(), "src/components/interne/menu-lateral.tsx"), "utf8");
    expect(source).toMatch(/<Suspense fallback=\{<SqueletteUtilisateur \/>\}>\s*<UtilisateurConnecte \/>/);
    expect(source).toMatch(/<Suspense fallback=\{null\}>\s*<PastilleATraiter \/>/);
  });
});

describe("pastille de « Demandes »", () => {
  it("le nombre à traiter, annoncé « à traiter » aux lecteurs d'écran", async () => {
    simulation.demandes.push(...fabriquerDemandes(42, 5));
    const html = await rendreAsync(PastilleATraiter());
    expect(html).toMatch(/^<span data-slot="pastille-a-traiter"[^>]*>5<span class="sr-only"> à traiter<\/span><\/span>$/);
  });

  it("attend une vraie requête (connection) avant de lire la session (Cache Components)", () => {
    const source = readFileSync(join(process.cwd(), "src/components/interne/menu-lateral.tsx"), "utf8");
    expect(source).toMatch(
      /export async function PastilleATraiter\(\) \{[\s\S]*?await connection\(\);\s*const compteur = await compterATraiter\(\);/,
    );
  });

  it("base vide : « 0 »", async () => {
    expect(texteDe(await rendreAsync(PastilleATraiter()))).toBe("0 à traiter");
  });

  it("compteur en panne : pas de pastille", async () => {
    simulation.pannesRpc.compter_a_traiter = { data: null, error: { code: "57P01", message: "x" } };
    await expect(PastilleATraiter()).resolves.toBeNull();
  });

  it("sans session : renvoi vers /connexion", async () => {
    simulation.session.id = null;
    await expect(PastilleATraiter()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
  });
});

describe("élément actif du menu", () => {
  it.each([
    ["/demandes", true],
    ["/demandes/NOVA-2026-0042", true],
    ["/demandesxyz", false],
    ["/admin", false],
    [null, false],
  ] as const)("%s → actif : %s", (valeur, attendu) => {
    expect(estActif(valeur, "/demandes")).toBe(attendu);
  });

  it("actif : aria-current=\"page\", fond bleu clair, icône et barre violettes", () => {
    const html = renderToStaticMarkup(
      <LienMenu href="/demandes" icone={<svg />}>
        Demandes
      </LienMenu>,
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("bg-primary-soft");
    expect(html).toContain("[&amp;_svg]:text-accent-nova");
    expect(html).toContain("shadow-[inset_3px_0_0_var(--color-accent-nova)]");
  });

  it("menu rendu sur le détail d'une demande : « Demandes » actif", () => {
    chemin.valeur = "/demandes/NOVA-2026-0042";
    const html = renderToStaticMarkup(<MenuLateral />);
    expect(html).toMatch(/<a [^>]*href="\/demandes"[^>]*aria-current="page"|<a [^>]*aria-current="page"[^>]*href="\/demandes"/);
  });

  it("en attendant l'adresse (Suspense) : le même lien, inactif", () => {
    const attente = renderToStaticMarkup(
      <VueLienMenu href="/demandes" icone={<svg />} actif={false}>
        Demandes
      </VueLienMenu>,
    );
    expect(attente).toContain('href="/demandes"');
    expect(attente).not.toContain("aria-current");
  });

  it("inactif : sans aria-current", () => {
    chemin.valeur = "/admin/comptes";
    const html = renderToStaticMarkup(
      <LienMenu href="/demandes" icone={<svg />}>
        Demandes
      </LienMenu>,
    );
    expect(html).not.toContain("aria-current");
    expect(html).not.toContain("bg-primary-soft");
  });
});

describe("layout de l'espace interne", () => {
  it("affiche le menu latéral et la page", () => {
    const html = renderToStaticMarkup(
      <LayoutInterne>
        <p>contenu</p>
      </LayoutInterne>,
    );
    expect(html).toContain('data-slot="menu-lateral"');
    expect(html).toContain("<p>contenu</p>");
    expect(html.indexOf('data-slot="menu-lateral"')).toBeLessThan(html.indexOf("<p>contenu</p>"));
  });

  it("garde le rechargement d'une page ressortie du cache", () => {
    const source = readFileSync(join(process.cwd(), "src/app/(interne)/layout.tsx"), "utf8");
    expect(source).toMatch(/^\s*<RechargementSiRestauree \/>$/m);
  });
});

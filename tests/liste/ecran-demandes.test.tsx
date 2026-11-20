import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Écran I3 « Demandes » (story 1.8 ; FR-11, FR-14, EXPERIENCE.md), rendu en
// HTML avec Supabase simulé : carte « à traiter », vrai tableau, badges
// écrits en toutes lettres, pagination, états vide, erreur et chargement,
// lecture de `?page=`.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);
const rafraichir = vi.hoisted(() => vi.fn());

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `connection()` n'a de sens que pendant une vraie requête Next.js.
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: rafraichir }),
}));

import { ContenuDemandes } from "@/app/(interne)/demandes/contenu-demandes";
import PageDemandes from "@/app/(interne)/demandes/page";
import { BadgeStatut } from "@/components/interne/badge-statut";
import { CarteATraiter } from "@/components/interne/carte-a-traiter";
import { EtatListeErreur, SqueletteListe } from "@/components/interne/etat-liste";
import { Pagination } from "@/components/interne/pagination";
import { STATUTS } from "@/shared/constantes";
import { LIBELLES_STATUTS } from "@/shared/libelles";

import { texteDe } from "../aides/formulaire-depot";
import { fabriquerDemandes, ID_KARIM } from "../aides/supabase-connexion";

/** HTML de `/demandes?…` pour Karim, connecté. */
async function ecran(parametres: Record<string, string | string[]> = {}): Promise<string> {
  return renderToStaticMarkup(await ContenuDemandes({ searchParams: Promise.resolve(parametres) }));
}

/** Les références des lignes du tableau, dans l'ordre. */
const references = (html: string) => [...html.matchAll(/NOVA-\d{4}-\d{4}/g)].map(([r]) => r);

/** Contenu d'un bouton (lien ou bouton grisé) de la pagination. */
function bouton(html: string, libelle: string): string {
  return html.match(new RegExp(`<(a|button)[^>]*>(?:(?!</(?:a|button)>).)*${libelle}(?:(?!</(?:a|button)>).)*</(?:a|button)>`))?.[0] ?? "";
}

beforeEach(() => {
  simulation.reinitialiser();
  simulation.session.id = ID_KARIM;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("accueil : 5 Nouvelle sur 42", () => {
  beforeEach(() => {
    simulation.demandes.push(...fabriquerDemandes(42, 5));
  });

  it("carte « 5 à traiter », sous-texte « Nouvelles »", async () => {
    const html = await ecran();
    expect(texteDe(html)).toMatch(/^5 à traiter Nouvelles /);
    expect(html).toMatch(/data-slot="nombre-a-traiter"[^>]*>5</);
  });

  it("un vrai tableau : légende, en-têtes de colonnes, 25 lignes", async () => {
    const html = await ecran();
    expect(html).toContain("<table");
    expect(html).toContain('<caption class="sr-only">Demandes, des plus récentes aux plus anciennes</caption>');
    const entetes = [...html.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(([, t]) => t);
    expect(entetes).toEqual(["Référence", "Déposée le", "Demandeur", "Objet", "Catégorie", "Statut"]);
    expect(html.match(/data-slot="ligne-demande"/g)).toHaveLength(25);
  });

  it("chaque ligne : référence, date, demandeur, objet, catégorie, badge ; plus récentes d'abord", async () => {
    const html = await ecran();
    expect(references(html)).toEqual(
      Array.from({ length: 25 }, (_, i) => `NOVA-2026-${String(42 - i).padStart(4, "0")}`),
    );
    const premiere = html.match(/<tr data-slot="ligne-demande".*?<\/tr>/)?.[0] ?? "";
    expect(texteDe(premiere)).toBe(
      "NOVA-2026-0042 8 nov. 2026, 8 h 47 Demandeur 42 Objet de la demande 42 Problème technique Nouvelle",
    );
    expect(premiere).toContain('<time dateTime="2026-11-08T07:47:00.000Z">');
  });

  it("ni l'email ni le téléphone du demandeur", async () => {
    const html = await ecran();
    expect(html).not.toMatch(/@|mailto:|tel:/);
  });

  it("pas de lien vers le détail, de filtre, de « Réinitialiser » ni de « Nouvelle demande »", async () => {
    const html = await ecran();
    expect(html).not.toMatch(/href="\/demandes\/NOVA/);
    expect(texteDe(html)).not.toMatch(/Filtres|Réinitialiser|Nouvelle demande|Attribuée à|Tout est à jour/);
  });

  it("ligne de résultat « 42 demandes » au-dessus du tableau, annoncée par la zone toujours présente", async () => {
    const html = await ecran();
    expect(html).toMatch(/<p class="[^"]*"><strong[^>]*>42 demandes<\/strong><\/p><div[^>]*><table/);
    expect(html).toContain('<p data-slot="annonce-resultats" role="status" class="sr-only">42 demandes</p>');
  });

  it("pagination : « Demandes 1 à 25 sur 42 · Page 1 sur 2 », « Précédente » grisé", async () => {
    const html = await ecran();
    expect(texteDe(html)).toContain("Demandes 1 à 25 sur 42 · Page 1 sur 2");
    expect(bouton(html, "Précédente")).toMatch(/^<button[^>]*disabled/);
    expect(bouton(html, "Suivante")).toMatch(/^<a[^>]*href="\/demandes\?page=2"/);
    expect(html).toMatch(/<nav aria-label="Pagination"/);
  });

  it("page suivante (?page=2) : lignes 26 à 42, « Suivante » grisé", async () => {
    const html = await ecran({ page: "2" });
    expect(references(html)).toHaveLength(17);
    expect(references(html)[0]).toBe("NOVA-2026-0017");
    expect(texteDe(html)).toContain("Demandes 26 à 42 sur 42 · Page 2 sur 2");
    expect(bouton(html, "Suivante")).toMatch(/^<button[^>]*disabled/);
    expect(bouton(html, "Précédente")).toMatch(/^<a[^>]*href="\/demandes"/);
  });

  it.each(["0", "abc", "-3"])("page impossible (?page=%s) : page 1", async (page) => {
    const html = await ecran({ page });
    expect(texteDe(html)).toContain("Page 1 sur 2");
    expect(simulation.rpcSession).toHaveBeenCalledWith("lister_demandes", { p_page: 1, p_taille: 25 });
  });

  it("page trop loin (?page=9) : la dernière", async () => {
    const html = await ecran({ page: "9" });
    expect(texteDe(html)).toContain("Demandes 26 à 42 sur 42 · Page 2 sur 2");
  });
});

describe("autres situations", () => {
  it("une seule page : « Page 1 sur 1 », deux boutons grisés", async () => {
    simulation.demandes.push(...fabriquerDemandes(3, 3));
    const html = await ecran();
    expect(texteDe(html)).toContain("Demandes 1 à 3 sur 3 · Page 1 sur 1");
    expect(bouton(html, "Précédente")).toMatch(/^<button[^>]*disabled/);
    expect(bouton(html, "Suivante")).toMatch(/^<button[^>]*disabled/);
  });

  it("base vide : « 0 à traiter » et le message vide à la place du tableau", async () => {
    const html = await ecran();
    expect(texteDe(html)).toBe(
      "0 à traiter Nouvelles Aucune demande pour le moment. Les demandes déposées sur le formulaire apparaîtront ici.",
    );
    expect(html).not.toContain("<table");
    expect(html).not.toContain("Pagination");
  });

  it("panne de lecture : « Impossible de charger les demandes. » + « Réessayer », carte « — »", async () => {
    simulation.demandes.push(...fabriquerDemandes(42, 5));
    simulation.pannesRpc.lister_demandes = { data: null, error: { code: "57P01", message: "x" } };
    simulation.pannesRpc.compter_a_traiter = { data: null, error: { code: "57P01", message: "x" } };
    const html = await ecran();
    expect(texteDe(html)).toBe("— à traiter Nouvelles Impossible de charger les demandes. Réessayer");
    expect(html).not.toContain("<table");
    const journal = simulation.journal().map((l) => l.evenement);
    expect(journal).toEqual(["erreur_inattendue", "erreur_inattendue"]);
  });

  it("compteur seul en panne : « — », la liste reste affichée", async () => {
    simulation.demandes.push(...fabriquerDemandes(3, 1));
    simulation.pannesRpc.compter_a_traiter = { data: null, error: { code: "57P01", message: "x" } };
    const html = await ecran();
    expect(html).toMatch(/data-slot="nombre-a-traiter"[^>]*>—</);
    expect(html).toContain("<table");
  });

  it("sans session : rien n'est lu, renvoi vers /connexion", async () => {
    simulation.session.id = null;
    await expect(ContenuDemandes({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });
});

describe("composants", () => {
  it.each(STATUTS)("badge « %s » : écrit en toutes lettres, pilule à sa couleur", (statut) => {
    const html = renderToStaticMarkup(<BadgeStatut statut={statut} />);
    expect(texteDe(html)).toBe(LIBELLES_STATUTS[statut]);
    expect(html).toContain("rounded-full");
    expect(html).toContain(`bg-status-${statut.replace("_", "-")}-bg`);
    expect(html).not.toMatch(/accent/);
  });

  it("libellés des statuts", () => {
    expect(LIBELLES_STATUTS).toEqual({ nouvelle: "Nouvelle", en_cours: "En cours", traitee: "Traitée" });
  });

  it("carte : nombre écrit à la française, « — » si inconnu", () => {
    expect(texteDe(renderToStaticMarkup(<CarteATraiter nombre={1234} />))).toBe("1 234 à traiter Nouvelles");
    expect(texteDe(renderToStaticMarkup(<CarteATraiter nombre={null} />))).toBe("— à traiter Nouvelles");
  });

  it("pagination : la ligne de résumé", () => {
    const html = renderToStaticMarkup(<Pagination total={51} page={3} pages={3} />);
    expect(texteDe(html)).toBe("Demandes 51 à 51 sur 51 · Page 3 sur 3 Précédente Suivante");
  });

  it("erreur : annoncée aux lecteurs d'écran ; « Réessayer » relit la page (router.refresh)", () => {
    const html = renderToStaticMarkup(<EtatListeErreur />);
    expect(html).toMatch(/^<div data-slot="liste-erreur" role="alert"/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>.*Réessayer<\/button>/);
    const source = readFileSync(join(process.cwd(), "src/components/interne/bouton-reessayer.tsx"), "utf8");
    expect(source).toContain('"use client"');
    expect(source).toContain("router.refresh()");
  });

  it("squelette : carte + 8 lignes grises, après 300 ms, annoncé", () => {
    const html = renderToStaticMarkup(<SqueletteListe />);
    expect(html).toContain("animate-apres-300ms");
    expect(html).toContain('role="status"');
    expect(html).toMatch(/<span class="sr-only">Chargement…<\/span>/);
    expect(html.match(/data-slot="ligne-squelette"/g)).toHaveLength(8);
  });
});

describe("page /demandes", () => {
  it("titre dans la coque, contenu (avec ?page=) sous <Suspense> et son squelette", () => {
    const parametres = Promise.resolve({ page: "2" });
    const element = PageDemandes({ searchParams: parametres, params: Promise.resolve({}) } as never);
    const html = renderToStaticMarkup(element);
    expect(html).toMatch(/<h1[^>]*>Demandes<\/h1>/);
    // Le contenu attend la personne connectée : c'est le squelette (fallback) qui s'affiche.
    expect(html.match(/data-slot="ligne-squelette"/g)).toHaveLength(8);
    const source = readFileSync(join(process.cwd(), "src/app/(interne)/demandes/page.tsx"), "utf8");
    expect(source).toMatch(/<Suspense fallback=\{<SqueletteListe \/>\}>\s*<ContenuDemandes searchParams=\{searchParams\} \/>/);
    expect(source).not.toMatch(/await searchParams/);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// FR-14 : afficher d'un clic les demandes à traiter (story 2.2). La carte
// « N à traiter » est un lien vers `/demandes?a_traiter=oui` ; la liste n'y
// montre que les demandes comptées, avec le filtre « À traiter » actif, qui
// se combine avec la recherche et les autres filtres. Matrice de la story,
// écran rendu en HTML avec Supabase simulé (la simulation applique la même
// définition que la base pour le compteur et pour le filtre ; le texte de
// la migration est vérifié dans `tests/liste/migration-filtre-a-traiter.test.ts`).
// Le parcours réel (clic, passage *En cours*) est dans
// `tests/e2e/a-traiter.spec.ts`.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/cache", () => ({ refresh }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

import { ContenuDemande } from "@/app/(interne)/demandes/[reference]/contenu-demande";
import { ContenuDemandes } from "@/app/(interne)/demandes/contenu-demandes";
import { CarteATraiter } from "@/components/interne/carte-a-traiter";
import { PastilleATraiter } from "@/components/interne/menu-lateral";
import { actionChangerStatut } from "@/server/actions/changer-statut";
import { lireListeDemandes } from "@/server/lectures/demandes";

import { texteDe } from "../aides/formulaire-depot";
import { CATEGORIES_DEPART, fabriquerDemandes, ID_KARIM, ID_PROBLEME_TECHNIQUE } from "../aides/supabase-connexion";

/** HTML de `/demandes?…` pour Karim, connecté. */
async function ecran(parametres: Record<string, string | string[]> = {}): Promise<string> {
  return renderToStaticMarkup(await ContenuDemandes({ searchParams: Promise.resolve(parametres) }));
}

/** Les références affichées (texte des liens), dans l'ordre. */
const references = (html: string) => [...html.matchAll(/>(NOVA-\d{4}-\d{4})</g)].map(([, r]) => r);

/** Texte de la zone d'annonce toujours présente (`role="status"`). */
const annonce = (html: string) =>
  html.match(/<p data-slot="annonce-resultats" role="status" class="sr-only">([^<]*)<\/p>/)?.[1] ?? null;

/** La carte compteur (lien entier). */
const carte = (html: string) => html.match(/<a [^>]*data-slot="carte-a-traiter".*?<\/a>/)?.[0] ?? "";

/** Le bouton « À traiter » de la rangée de filtres. */
const bouton = (html: string) => html.match(/<button [^>]*data-slot="filtre-a-traiter"[^>]*>[^<]*<\/button>/)?.[0] ?? "";

/** Vrai si le bouton « À traiter » est allumé. */
const actif = (html: string) => {
  const balise = bouton(html);
  expect(balise).not.toBe("");
  const allume = balise.includes('aria-pressed="true"');
  expect(balise.includes("data-actif")).toBe(allume);
  return allume;
};

/** Les liens « Réinitialiser » (rangée de filtres et état sans résultat). */
const reinitialiser = (html: string) => [...html.matchAll(/<a[^>]*>Réinitialiser<\/a>/g)].map(([lien]) => lien);

/** Adresse (décodée) d'un lien, dans une balise. */
const adresse = (balise: string) => balise.match(/href="([^"]*)"/)?.[1]?.replace(/&amp;/g, "&") ?? null;

/** Le nombre de la carte. */
const nombreCarte = (html: string) => html.match(/data-slot="nombre-a-traiter"[^>]*>([^<]*)</)?.[1] ?? null;

/** Statuts des lignes affichées (dernier texte de chaque ligne : le badge). */
const statuts = (html: string) =>
  [...html.matchAll(/<tr data-slot="ligne-demande".*?<\/tr>/g)].map(([ligne]) => texteDe(ligne).split(" ").at(-1));

/**
 * 42 demandes fictives, dont les 5 plus récentes *Nouvelle* (0042 à 0038),
 * les autres *En cours* et *Traitée* en alternance. 0042 et 0040 sont des
 * « Problème technique » avec « Imprimante » dans l'objet ; 0037 aussi,
 * mais *Traitée* ; toutes les autres sont « Autre ».
 */
function remplir() {
  const demandes = fabriquerDemandes(42, 5).map((d) => ({ ...d, categorie: "Autre", categorie_id: CATEGORIES_DEPART[4].id }));
  for (const index of [0, 2, 5]) {
    Object.assign(demandes[index], { objet: `Imprimante ${index}`, categorie: "Problème technique", categorie_id: ID_PROBLEME_TECHNIQUE });
  }
  simulation.demandes.push(...demandes);
}

beforeEach(() => {
  simulation.reinitialiser();
  simulation.session.id = ID_KARIM;
  refresh.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  remplir();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("FR-14 : la carte « N à traiter » ouvre les demandes à traiter", () => {
  it("la carte est un vrai lien vers /demandes?a_traiter=oui (repart de zéro), nommé « 5 à traiter, afficher ces demandes »", async () => {
    for (const parametres of [{}, { q: "imprimante", statut: "traitee", canal: "email", page: "2" }] as Record<string, string>[]) {
      const lien = carte(await ecran(parametres));
      expect(adresse(lien)).toBe("/demandes?a_traiter=oui");
      expect(lien).toContain('aria-label="5 à traiter, afficher ces demandes"');
      expect(texteDe(lien)).toBe("5 à traiter Nouvelles Afficher ces demandes");
    }
  });

  it("clic sur la carte (5 Nouvelle sur 42) : « 5 demandes », toutes Nouvelle ; filtre « À traiter » actif ; « Réinitialiser » visible", async () => {
    const html = await ecran({ a_traiter: "oui" });
    expect(references(html)).toEqual(["NOVA-2026-0042", "NOVA-2026-0041", "NOVA-2026-0040", "NOVA-2026-0039", "NOVA-2026-0038"]);
    expect(statuts(html)).toEqual(Array(5).fill("Nouvelle"));
    expect(html).toMatch(/<strong[^>]*>5 demandes<\/strong>/);
    expect(annonce(html)).toBe("5 demandes");
    expect(nombreCarte(html)).toBe("5");
    expect(actif(html)).toBe(true);
    expect(reinitialiser(html).map(adresse)).toEqual(["/demandes"]);
    expect(simulation.rpcSession).toHaveBeenCalledWith("lister_demandes", { p_page: 1, p_taille: 25, p_a_traiter: true });
  });

  it("le compteur et le filtre suivent la même définition (Urgente non Traitée comprise, AD-5)", async () => {
    // Pas encore de priorité à l'écran (epic 6), mais la base la connaît déjà.
    Object.assign(simulation.demandes.find((d) => d.reference === "NOVA-2026-0037")!, { priorite: "urgente", statut: "en_cours" });
    const html = await ecran({ a_traiter: "oui" });
    expect(nombreCarte(html)).toBe("6");
    expect(references(html)).toHaveLength(6);
    expect(references(html)).toContain("NOVA-2026-0037");
  });

  it("combiné (?a_traiter=oui&categorie=…&q=imprimante) : seules les demandes qui remplissent toutes les conditions", async () => {
    const html = await ecran({ a_traiter: "oui", categorie: ID_PROBLEME_TECHNIQUE, q: "imprimante" });
    expect(references(html)).toEqual(["NOVA-2026-0042", "NOVA-2026-0040"]);
    expect(annonce(html)).toBe("2 demandes");
    expect(actif(html)).toBe(true);
    // Sans « À traiter », la Traitée revient.
    expect(references(await ecran({ categorie: ID_PROBLEME_TECHNIQUE, q: "imprimante" }))).toEqual([
      "NOVA-2026-0042",
      "NOVA-2026-0040",
      "NOVA-2026-0037",
    ]);
  });

  it("contradictoire (?a_traiter=oui&statut=traitee) : « Aucune demande trouvée » + « Réinitialiser » (qui retire aussi a_traiter)", async () => {
    const html = await ecran({ a_traiter: "oui", statut: "traitee" });
    expect(html).not.toContain("<table");
    expect(texteDe(html)).toContain("Aucune demande trouvée Vérifiez l'orthographe ou retirez des filtres. Réinitialiser");
    expect(annonce(html)).toBe("Aucune demande trouvée");
    expect(reinitialiser(html).map(adresse)).toEqual(["/demandes", "/demandes"]);
    expect(actif(html)).toBe(true);
  });

  it.each([["1"], ["non"], ["OUI"], [""], [["non", "oui"]]])(
    "valeur inconnue (?a_traiter=%j) : filtre ignoré, liste non filtrée, filtre inactif",
    async (valeur) => {
      const html = await ecran({ a_traiter: valeur });
      expect(texteDe(html)).toContain("42 demandes");
      expect(actif(html)).toBe(false);
      expect(reinitialiser(html)).toEqual([]);
      expect(simulation.rpcSession).toHaveBeenCalledWith("lister_demandes", { p_page: 1, p_taille: 25 });
      expect(html).toMatch(/<a[^>]*href="\/demandes\?page=2"[^>]*rel="next"|<a[^>]*rel="next"[^>]*href="\/demandes\?page=2"/);
    },
  );

  it("rien à traiter : « 0 à traiter » + « Tout est à jour », sans félicitations ; tableau normal ; carte toujours cliquable", async () => {
    for (const demande of simulation.demandes) if (demande.statut === "nouvelle") demande.statut = "en_cours";
    const html = await ecran();
    expect(texteDe(carte(html))).toBe("0 à traiter Tout est à jour Afficher ces demandes");
    expect(adresse(carte(html))).toBe("/demandes?a_traiter=oui");
    expect(texteDe(html)).not.toMatch(/bravo|félicit|super|bien joué|!/i);
    expect(html).toContain("<table");
    expect(texteDe(html)).toContain("42 demandes");
    // Ouverte quand même : « Aucune demande trouvée », pas l'état « aucune demande en base ».
    expect(texteDe(await ecran({ a_traiter: "oui" }))).toContain("Aucune demande trouvée");
  });

  it("après un passage En cours : carte et pastille à 4 ; la liste a_traiter=oui ne la montre plus", async () => {
    const avant = await ecran({ a_traiter: "oui" });
    expect(nombreCarte(avant)).toBe("5");
    expect(texteDe(renderToStaticMarkup((await PastilleATraiter())!))).toBe("5 à traiter");

    await expect(
      actionChangerStatut({ reference: "NOVA-2026-0040", statutVu: "nouvelle", nouveauStatut: "en_cours" }),
    ).resolves.toMatchObject({ ok: true });
    // L'action demande à Next.js de recalculer la page (carte, pastille, liste).
    expect(refresh).toHaveBeenCalledTimes(1);

    const apres = await ecran({ a_traiter: "oui" });
    expect(nombreCarte(apres)).toBe("4");
    expect(texteDe(renderToStaticMarkup((await PastilleATraiter())!))).toBe("4 à traiter");
    expect(references(apres)).toEqual(["NOVA-2026-0042", "NOVA-2026-0041", "NOVA-2026-0039", "NOVA-2026-0038"]);
    expect(annonce(apres)).toBe("4 demandes");
  });

  it("compteur illisible : carte « — », toujours un lien vers la liste filtrée ; panne journalisée (inchangé)", async () => {
    simulation.pannesRpc.compter_a_traiter = { data: null, error: { code: "57P01", message: "x" } };
    const html = await ecran({ a_traiter: "oui" });
    expect(nombreCarte(html)).toBe("—");
    expect(adresse(carte(html))).toBe("/demandes?a_traiter=oui");
    // Le tiret n'est pas lu à voix haute : un nom en toutes lettres.
    expect(carte(html)).toContain('aria-label="Nombre à traiter indisponible, afficher ces demandes"');
    expect(carte(html)).not.toContain('aria-label="—');
    expect(references(html)).toHaveLength(5);
    expect(simulation.journal()).toEqual([
      { evenement: "erreur_inattendue", details: { type: "lecture", lecture: "compter_a_traiter" } },
    ]);
  });
});

describe("adresse de la liste : a_traiter suit la pagination, le détail et le fil d'Ariane", () => {
  it("pagination, lien vers le détail et fil d'Ariane gardent a_traiter=oui (après canal, avant page)", async () => {
    // 30 demandes Nouvelle : deux pages.
    simulation.reinitialiser();
    simulation.session.id = ID_KARIM;
    simulation.demandes.push(...fabriquerDemandes(42, 30));
    const parametres = { a_traiter: "oui", canal: "formulaire", page: "2" };
    const html = await ecran(parametres);
    expect(texteDe(html)).toContain("Page 2 sur 2");
    expect(adresse(html.match(/<a[^>]*rel="prev"[^>]*>/)?.[0] ?? "")).toBe("/demandes?canal=formulaire&a_traiter=oui");
    const lien = html.match(/<a [^>]*>(NOVA-\d{4}-\d{4})<\/a>/);
    expect(adresse(lien![0])).toBe(`/demandes/${lien![1]}?canal=formulaire&a_traiter=oui&page=2`);

    const detail = renderToStaticMarkup(
      await ContenuDemande({ params: Promise.resolve({ reference: lien![1] }), searchParams: Promise.resolve(parametres) }),
    );
    const retour = detail.match(/<nav aria-label="Fil d&#x27;Ariane"[^>]*>.*?<a [^>]*href="([^"]*)"/)?.[1]?.replace(/&amp;/g, "&");
    expect(retour).toBe("/demandes?canal=formulaire&a_traiter=oui&page=2");
  });

  it("catégorie bien formée mais inconnue : retirée (filtresAppliques), « À traiter » gardé partout", async () => {
    simulation.reinitialiser();
    simulation.session.id = ID_KARIM;
    simulation.demandes.push(...fabriquerDemandes(42, 30));
    const html = await ecran({ a_traiter: "oui", categorie: "c0000000-0000-4000-8000-000000000099", page: "2" });
    expect(actif(html)).toBe(true);
    expect(html).toContain('<input type="hidden" name="a_traiter" value="oui"/>');
    expect(texteDe(html)).toContain("30 demandes");
    expect(adresse(html.match(/<a[^>]*rel="prev"[^>]*>/)?.[0] ?? "")).toBe("/demandes?a_traiter=oui");
    const lien = html.match(/<a [^>]*>(NOVA-\d{4}-\d{4})<\/a>/);
    expect(adresse(lien![0])).toBe(`/demandes/${lien![1]}?a_traiter=oui&page=2`);
  });
});

describe("clic sur la carte : la barre repart de zéro (une recherche en attente ne repasse pas par-dessus)", () => {
  it("la carte est rendue par la barre, au-dessus du formulaire, dans une zone qui écoute le clic", async () => {
    const html = await ecran({ q: "imprimante" });
    expect(html).toMatch(/<div data-slot="zone-carte"><a [^>]*data-slot="carte-a-traiter"/);
    expect(html.indexOf('data-slot="zone-carte"')).toBeLessThan(html.indexOf('<form role="search"'));
    const contenu = readFileSync(join(process.cwd(), "src/app/(interne)/demandes/contenu-demandes.tsx"), "utf8");
    expect(contenu).toContain("carte={<CarteATraiter nombre={compteur.ok ? compteur.donnees : null} />}");
  });

  it("composant client : le clic arrête la frappe en attente, vide le champ, garde le seul « À traiter » ; le lien navigue", () => {
    const source = readFileSync(join(process.cwd(), "src/components/interne/recherche-demandes.tsx"), "utf8");
    expect(source).toMatch(
      /function ouvrirATraiter\(\) \{\s*arreterMinuteur\(\);\s*setTexte\(""\);\s*setChoix\(\{ aTraiter: true \}\);\s*setEnvoyee\(adresseListe\(\{ aTraiter: true \}\)\);\s*\}/,
    );
    // Phase de capture : avant la navigation du lien ; pas pour un clic « nouvel onglet ».
    expect(source).toMatch(/onClickCapture=\{\(evenement\) => \{\s*if \(evenement\.button !== 0 \|\| evenement\.metaKey[^}]*return;\s*ouvrirATraiter\(\);/);
    // La navigation reste celle du lien (marche sans JavaScript) : la barre ne lance rien.
    expect(source.match(/function ouvrirATraiter\(\) \{[\s\S]*?\n {2}\}/)?.[0]).not.toContain("router");
  });
});

describe("journal (AD-12, AD-13) : le filtre n'est jamais écrit", () => {
  it("panne de la liste filtrée : journalisée avec le seul nom de la lecture", async () => {
    simulation.pannesRpc.lister_demandes = { data: null, error: { code: "57P01", message: "x" } };
    await expect(lireListeDemandes(1, "", { aTraiter: true })).resolves.toEqual({ ok: false });
    expect(simulation.journal()).toEqual([
      { evenement: "erreur_inattendue", details: { type: "lecture", lecture: "lister_demandes" } },
    ]);
    const ecrit = JSON.stringify(simulation.appels("ecrire_journal")) + vi.mocked(console.error).mock.calls.map(String).join("\n");
    expect(ecrit).not.toMatch(/a_traiter|aTraiter|p_a_traiter/);
  });
});

describe("bouton « À traiter » de la rangée de filtres (DESIGN.md, Bouton de filtre)", () => {
  it("toujours présent, à droite de « Canal », avant « Réinitialiser » ; sans chevron", async () => {
    for (const parametres of [{}, { a_traiter: "oui" }] as Record<string, string>[]) {
      const html = await ecran(parametres);
      const rangee = html.match(/<div data-slot="filtres".*?<\/form>/)?.[0] ?? "";
      expect(rangee.indexOf('name="canal"')).toBeLessThan(rangee.indexOf('data-slot="filtre-a-traiter"'));
      expect(bouton(html)).toMatch(/^<button type="button"[^>]*>À traiter<\/button>$/);
      expect(bouton(html)).not.toContain("lucide-chevron");
    }
    const actifHtml = await ecran({ a_traiter: "oui" });
    const rangee = actifHtml.match(/<div data-slot="filtres".*?<\/form>/)?.[0] ?? "";
    expect(rangee.indexOf('data-slot="filtre-a-traiter"')).toBeLessThan(rangee.indexOf(">Réinitialiser<"));
  });

  it("inactif : gris, aria-pressed=false, pas de champ caché ; actif : fond primary-soft, bordure et texte bleus, champ caché a_traiter=oui", async () => {
    const inactif = await ecran();
    expect(bouton(inactif)).toContain('aria-pressed="false"');
    expect(bouton(inactif)).toMatch(/class="[^"]*\bh-9\b[^"]*\bborder-border-input\b/);
    expect(bouton(inactif)).not.toContain("bg-primary-soft");
    expect(inactif).not.toContain('name="a_traiter"');

    const allume = await ecran({ a_traiter: "oui" });
    expect(bouton(allume)).toContain('aria-pressed="true"');
    expect(bouton(allume)).toMatch(/class="[^"]*border-primary bg-primary-soft text-primary/);
    const formulaire = allume.match(/<form role="search" action="\/demandes" method="get">.*?<\/form>/)?.[0] ?? "";
    expect(formulaire).toContain('<input type="hidden" name="a_traiter" value="oui"/>');
  });

  it("composant : un clic allume ou éteint le filtre, par `onChange` (appliqué tout de suite, page 1, texte tapé gardé)", () => {
    const source = readFileSync(join(process.cwd(), "src/components/interne/filtres-demandes.tsx"), "utf8");
    expect(source).toContain("onClick={() => onChange(relireFiltres({ ...choix, aTraiter: aTraiter ? undefined : true }))}");
    expect(source).toContain('type="button"');
    // `onChange` est `filtrer` de la barre : avec le texte tapé, `router.replace`, page 1.
    const barre = readFileSync(join(process.cwd(), "src/components/interne/recherche-demandes.tsx"), "utf8");
    expect(barre).toContain("onChange={filtrer}");
    expect(barre).toMatch(/function filtrer\(nouveaux: FiltresListe\) \{\s*setChoix\(nouveaux\);\s*naviguer\(texte, nouveaux\);/);
  });

  it("carte : rendue seule, « — » si inconnu ; aucun texte de félicitations à 0", () => {
    expect(texteDe(renderToStaticMarkup(createElement(CarteATraiter, { nombre: 0 })))).toBe("0 à traiter Tout est à jour Afficher ces demandes");
    expect(texteDe(renderToStaticMarkup(createElement(CarteATraiter, { nombre: null })))).toBe("— à traiter Nouvelles Afficher ces demandes");
    const html = renderToStaticMarkup(createElement(CarteATraiter, { nombre: 5 }));
    expect(html).toMatch(/^<a [^>]*href="\/demandes\?a_traiter=oui"/);
    expect(html).toMatch(/aria-describedby="([^"]+)".*id="\1"[^>]*>Nouvelles</);
    // Carte de DESIGN.md : fond primary, chiffre 32 px (text-counter), étoile à 35 %.
    expect(html).toMatch(/class="[^"]*\bbg-primary\b[^"]*text-primary-foreground/);
    expect(html).toContain("text-counter");
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*class="[^"]*fill-accent-nova-light opacity-35/);
  });
});

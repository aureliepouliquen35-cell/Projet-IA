import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Recherche sur l'écran I3 « Demandes » (story 1.9 ; FR-12, EXPERIENCE.md),
// rendu en HTML avec Supabase simulé : formulaire de recherche, ligne
// « N demandes », état « Aucune demande trouvée » et « Réinitialiser »,
// pagination qui garde `q`, panne (barre toujours là, journal sans le texte
// cherché). Le comportement dans le navigateur (300 ms, Entrée, estompage)
// est vérifié sur le texte du composant client et à la main (`npm run dev`).

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

import { ContenuDemandes } from "@/app/(interne)/demandes/contenu-demandes";
import { EtatRechercheVide } from "@/components/interne/etat-liste";
import { Pagination } from "@/components/interne/pagination";
import { DELAI_RECHERCHE_MS, RechercheDemandes } from "@/components/interne/recherche-demandes";
import { lireListeDemandes } from "@/server/lectures/demandes";

import { texteDe } from "../aides/formulaire-depot";
import { fabriquerDemandes, ID_KARIM } from "../aides/supabase-connexion";

/** HTML de `/demandes?…` pour Karim, connecté. */
async function ecran(parametres: Record<string, string | string[]> = {}): Promise<string> {
  return renderToStaticMarkup(await ContenuDemandes({ searchParams: Promise.resolve(parametres) }));
}

/** Les références affichées (texte des liens, pas leur adresse), dans l'ordre. */
const references = (html: string) => [...html.matchAll(/>(NOVA-\d{4}-\d{4})</g)].map(([, r]) => r);

/** Texte de la zone d'annonce toujours présente (`role="status"`). */
const annonce = (html: string) =>
  html.match(/<p data-slot="annonce-resultats" role="status" class="sr-only">([^<]*)<\/p>/)?.[1] ?? null;

/** Le champ de recherche (balise `<input>`). */
const champ = (html: string) => html.match(/<input[^>]*name="q"[^>]*>/)?.[0] ?? "";

/** HTML sans la rangée de filtres (story 2.1, vérifiée dans `tests/regles/fr-13-filtres.test.ts`). */
const sansFiltres = (html: string) => html.replace(/<div data-slot="filtres"[\s\S]*?<\/form>/, "</form>");

/** Contenu d'un lien ou bouton de la pagination. */
function bouton(html: string, libelle: string): string {
  return html.match(new RegExp(`<(a|button)[^>]*>(?:(?!</(?:a|button)>).)*${libelle}(?:(?!</(?:a|button)>).)*</(?:a|button)>`))?.[0] ?? "";
}

/** Demande d'Hélène Dupuis (NOVA-2026-0042) et 41 autres. */
function remplir() {
  const [premiere, ...autres] = fabriquerDemandes(42, 5);
  simulation.demandes.push(
    {
      ...premiere,
      nom: "Hélène Dupuis",
      email: "helene.dupuis@boulangerie-dupuis.fr",
      entreprise: "Boulangerie Dupuis",
      objet: "Livraison du four à pain",
    },
    ...autres,
  );
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

describe("barre de recherche", () => {
  beforeEach(remplir);

  it("sous la carte « à traiter » : formulaire role=search, GET /demandes, marche sans JavaScript", async () => {
    const html = await ecran();
    expect(html.indexOf('data-slot="carte-a-traiter"')).toBeLessThan(html.indexOf('role="search"'));
    expect(html.indexOf('role="search"')).toBeLessThan(html.indexOf("<table"));
    expect(html).toMatch(/<form role="search" action="\/demandes" method="get"/);
  });

  it("champ q : loupe, phrase en gris, nom donné aux lecteurs d'écran, 150 caractères au plus", async () => {
    const html = await ecran();
    const input = champ(html);
    expect(input).toContain('type="search"');
    expect(input).toContain('maxLength="150"');
    expect(input).toContain('aria-label="Rechercher par référence, nom, email, entreprise ou objet"');
    expect(input).toContain('placeholder="Rechercher par référence, nom, email, entreprise ou objet"');
    expect(input).toContain('value=""');
    expect(html).toMatch(/<form role="search"[^>]*><div[^>]*><svg[^>]*lucide-search[^>]*aria-hidden="true"/);
    // Pas d'étiquette visible (maquette) : la phrase est dans le champ. Les
    // seules étiquettes sont celles des filtres (story 2.1), après le champ.
    expect(sansFiltres(html)).not.toContain("<label");
  });

  it("?q= : le champ affiche le texte cherché (rechargement, adresse partagée)", async () => {
    const html = await ecran({ q: "Hélène" });
    expect(champ(html)).toContain('value="Hélène"');
    expect(references(html)).toEqual(["NOVA-2026-0042"]);
  });

  it("?q= trop long ou en double : le premier, coupé à 150", async () => {
    const html = await ecran({ q: [`helene${"x".repeat(200)}`, "autre"] });
    expect(champ(html)).toContain(`value="helene${"x".repeat(144)}"`);
  });

  it("résultats dans une zone estompée pendant une nouvelle recherche (pas en attente au départ)", async () => {
    const html = await ecran();
    expect(html).toMatch(/<div data-slot="resultats" class="transition-opacity">/);
    expect(html).not.toContain("aria-busy");
  });
});

describe("résultats", () => {
  beforeEach(remplir);

  it("référence : seule cette demande, « 1 demande » annoncé", async () => {
    const html = await ecran({ q: "nova-2026-0042" });
    expect(references(html)).toEqual(["NOVA-2026-0042"]);
    expect(html).toMatch(/<p class="[^"]*"><strong[^>]*>1 demande<\/strong><\/p>/);
    expect(annonce(html)).toBe("1 demande");
    expect(texteDe(html)).toContain("Demandes 1 à 1 sur 1 · Page 1 sur 1");
  });

  it("HÉLÈNE trouve Hélène Dupuis", async () => {
    const html = await ecran({ q: "HÉLÈNE" });
    expect(texteDe(html)).toContain("NOVA-2026-0042 8 nov. 2026, 8 h 47 Hélène Dupuis Livraison du four à pain");
  });

  it("recherche par email : trouvée, mais l'email ne s'affiche pas", async () => {
    const html = await ecran({ q: "dupuis@" });
    expect(references(html)).toEqual(["NOVA-2026-0042"]);
    expect(html.replace(/value="[^"]*"/, "")).not.toMatch(/@|mailto:|tel:|Boulangerie/);
  });

  it("sans recherche : « 42 demandes »", async () => {
    const html = await ecran();
    expect(html).toMatch(/<strong[^>]*>42 demandes<\/strong>/);
    expect(annonce(html)).toBe("42 demandes");
  });

  it("rien ne correspond : « Aucune demande trouvée » à la place du tableau, « Réinitialiser » vers /demandes", async () => {
    const html = await ecran({ q: "zzzz" });
    expect(html).not.toContain("<table");
    expect(html).not.toContain("Pagination");
    expect(html).not.toMatch(/\d+ demandes?</);
    const etat = html.match(/<div data-slot="recherche-vide".*?<\/div>/)?.[0] ?? "";
    expect(etat).toMatch(/^<div data-slot="recherche-vide" class=/);
    expect(annonce(html)).toBe("Aucune demande trouvée");
    // Lu une fois dans la zone d'annonce (invisible), une fois à l'écran.
    expect(texteDe(sansFiltres(html))).toBe(
      "5 à traiter Nouvelles Aucune demande trouvée Aucune demande trouvée Vérifiez l'orthographe ou retirez des filtres. Réinitialiser",
    );
    expect(bouton(html, "Réinitialiser")).toMatch(/^<a[^>]*href="\/demandes"[^>]*data-variant="secondaire"|^<a[^>]*data-variant="secondaire"[^>]*href="\/demandes"/);
    // La barre reste là, avec le texte cherché.
    expect(champ(html)).toContain('value="zzzz"');
  });

  it("espaces seuls : la liste complète", async () => {
    const html = await ecran({ q: "   " });
    expect(html).toMatch(/<strong[^>]*>42 demandes<\/strong>/);
    expect(champ(html)).toContain('value=""');
  });

  it("plusieurs pages : ?q=essai&page=2 donne les lignes 26 à 30 ; « Précédente » garde q", async () => {
    simulation.demandes.length = 0;
    simulation.demandes.push(
      ...fabriquerDemandes(40).map((d, i) => (i < 30 ? { ...d, objet: `Essai numéro ${i + 1}` } : d)),
    );
    const html = await ecran({ q: "essai", page: "2" });
    expect(references(html)).toEqual(["NOVA-2026-0015", "NOVA-2026-0014", "NOVA-2026-0013", "NOVA-2026-0012", "NOVA-2026-0011"]);
    expect(texteDe(html)).toContain("30 demandes");
    expect(texteDe(html)).toContain("Demandes 26 à 30 sur 30 · Page 2 sur 2");
    expect(bouton(html, "Précédente")).toMatch(/^<a[^>]*href="\/demandes\?q=essai"/);
    expect(bouton(html, "Suivante")).toMatch(/^<button[^>]*disabled/);
  });

  it("page 1 d'une recherche : « Suivante » garde q et va en page 2", async () => {
    simulation.demandes.length = 0;
    simulation.demandes.push(...fabriquerDemandes(40).map((d) => ({ ...d, nom: "Élodie Martin" })));
    const html = await ecran({ q: "elodie" });
    expect(bouton(html, "Suivante")).toMatch(/^<a[^>]*href="\/demandes\?q=elodie&amp;page=2"/);
  });
});

describe("autres états", () => {
  it("base vide, sans q : message « Aucune demande pour le moment… » et le bouton de saisie (story 2.3)", async () => {
    const html = await ecran();
    expect(texteDe(sansFiltres(html))).toBe(
      "0 à traiter Nouvelles Aucune demande pour le moment. Les demandes déposées sur le formulaire apparaîtront ici. Saisir une demande reçue par téléphone",
    );
    expect(annonce(html)).toBe("");
  });

  it("base vide, avec q : « Aucune demande trouvée »", async () => {
    const html = await ecran({ q: "helene" });
    expect(texteDe(html)).toContain("Aucune demande trouvée");
  });

  it("panne avec q : « Impossible de charger les demandes. » + « Réessayer » ; la barre reste utilisable", async () => {
    remplir();
    simulation.pannesRpc.lister_demandes = { data: null, error: { code: "57P01", message: "x" } };
    const html = await ecran({ q: "Hélène Dupuis" });
    expect(texteDe(sansFiltres(html))).toBe("5 à traiter Nouvelles Impossible de charger les demandes. Réessayer");
    expect(champ(html)).toContain('value="Hélène Dupuis"');
    expect(champ(html)).not.toMatch(/ disabled[ =/>]/);
    expect(annonce(html)).toBe("");
  });
});

describe("journal (AD-12, AD-13) : le texte cherché n'est jamais écrit", () => {
  it.each([
    ["refus de la base", { data: null, error: { code: "57P01", message: "x" } }],
    ["réponse inattendue", { data: { total: 1, page: 1, demandes: [{ statut: "inconnu" }] }, error: null }],
  ])("%s : journalisée avec un code, sans le texte cherché", async (_, panne) => {
    simulation.pannesRpc.lister_demandes = panne;
    await expect(lireListeDemandes(1, "helene.dupuis@boulangerie-dupuis.fr")).resolves.toEqual({ ok: false });
    const journal = simulation.journal();
    expect(journal).toEqual([{ evenement: "erreur_inattendue", details: { type: "lecture", lecture: "lister_demandes" } }]);
    const ecrit = JSON.stringify(simulation.rpc.mock.calls) + vi.mocked(console.error).mock.calls.map(String).join("\n");
    expect(ecrit).not.toMatch(/helene|dupuis/i);
  });
});

describe("lecture", () => {
  it("envoie le texte nettoyé (p_q) et le renvoie à l'écran ; vide : pas de p_q (appel de la story 1.8)", async () => {
    remplir();
    const resultat = await lireListeDemandes(1, "  Hélène  ");
    expect(resultat.ok && resultat.donnees.recherche).toBe("Hélène");
    expect(simulation.rpcSession).toHaveBeenCalledWith("lister_demandes", { p_page: 1, p_taille: 25, p_q: "Hélène" });
    await lireListeDemandes(1, " ");
    expect(simulation.rpcSession).toHaveBeenLastCalledWith("lister_demandes", { p_page: 1, p_taille: 25 });
  });
});

describe("composants", () => {
  it("état sans résultat : pastille loupe violette ; « Réinitialiser » remplace l'adresse, comme la recherche", () => {
    const html = renderToStaticMarkup(<EtatRechercheVide />);
    expect(html).toMatch(/^<div data-slot="recherche-vide" class=/);
    expect(html).not.toContain('role="status"');
    const source = readFileSync(join(process.cwd(), "src/components/interne/etat-liste.tsx"), "utf8");
    expect(source).toMatch(/<Link href=\{adresseListe\(\)\} replace>/);
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*bg-accent-nova-soft text-accent-nova"><svg[^>]*lucide-search/);
  });

  it("pagination sans q : adresses simples", () => {
    const html = renderToStaticMarkup(<Pagination total={60} page={2} pages={3} />);
    expect(bouton(html, "Précédente")).toMatch(/href="\/demandes"/);
    expect(bouton(html, "Suivante")).toMatch(/href="\/demandes\?page=3"/);
  });

  it("barre : enfants affichés dans la zone de résultats", () => {
    const html = renderToStaticMarkup(
      <RechercheDemandes q="essai" annonce="3 demandes">
        <p>contenu</p>
      </RechercheDemandes>,
    );
    expect(html).toMatch(/<div data-slot="resultats"[^>]*><p>contenu<\/p><\/div>$/);
    expect(champ(html)).toContain('value="essai"');
    // Zone d'annonce toujours présente, hors de la zone de résultats (qui change).
    expect(html).toMatch(/<\/form><p data-slot="annonce-resultats" role="status" class="sr-only">3 demandes<\/p><div data-slot="resultats"/);
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });

  it("composant client : 300 ms ou Entrée, router.replace dans une transition, aria-busy et estompage", () => {
    expect(DELAI_RECHERCHE_MS).toBe(300);
    const source = readFileSync(join(process.cwd(), "src/components/interne/recherche-demandes.tsx"), "utf8");
    expect(source.startsWith('"use client";')).toBe(true);
    expect(source).toContain("useTransition()");
    // Recherche et filtres partent ensemble, à la page 1.
    expect(source).toMatch(/const adresse = adresseListe\(\{ q: lireRecherche\(brut\), \.\.\.nouveaux \}\);\s*setEnvoyee\(adresse\);\s*demarrer\(\(\) => router\.replace\(adresse\)\);/);
    expect(source).not.toContain("router.push");
    expect(source).toContain("setTimeout(() => naviguer(valeur, choix), DELAI_RECHERCHE_MS)");
    expect(source).toMatch(/onSubmit=\{\(evenement\) => \{\s*evenement\.preventDefault\(\);\s*naviguer\(texte, choix\);/);
    expect(source).toContain("aria-busy={enAttente || undefined}");
    expect(source).toContain('enAttente && "opacity-50"');
    // Texte et filtres resynchronisés si l'adresse change d'ailleurs (Réinitialiser, Retour).
    expect(source).toMatch(/if \(recue !== derniereRecue\) \{\s*setDerniereRecue\(recue\);\s*if \(recue !== envoyee\) \{\s*setTexte\(q\);\s*setChoix\(filtres\);\s*setEnvoyee\(recue\);\s*setChangementsExternes\(\(n\) => n \+ 1\);/);
    // … et la recherche en attente (300 ms) est abandonnée, sinon elle renverrait l'ancien texte.
    expect(source).toMatch(/useLayoutEffect\(\(\) => \{\s*if \(changementsExternes === 0 \|\| minuteur\.current === null\) return;\s*clearTimeout\(minuteur\.current\);/);
  });
});

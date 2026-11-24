import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// FR-13 : filtrer la liste des demandes par statut, catégorie et canal, en
// même temps que la recherche ; le nombre de résultats est affiché ;
// « Réinitialiser » retire tous les filtres. Matrice de la story 2.1, écran
// rendu en HTML avec Supabase simulé (la simulation applique les règles de
// la migration, dont le texte est vérifié dans
// `tests/liste/migration-filtres-demandes.test.ts`). Le comportement dans le
// navigateur (application immédiate, estompage) est vérifié sur le texte du
// composant client et à la main (`npm run dev`).

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

import { ContenuDemande } from "@/app/(interne)/demandes/[reference]/contenu-demande";
import { ContenuDemandes } from "@/app/(interne)/demandes/contenu-demandes";
import { lireCategoriesFiltre, lireListeDemandes } from "@/server/lectures/demandes";

import { texteDe } from "../aides/formulaire-depot";
import { CATEGORIES_DEPART, fabriquerDemandes, ID_KARIM, ID_PROBLEME_TECHNIQUE } from "../aides/supabase-connexion";

const ID_INFORMATION = CATEGORIES_DEPART[0].id;
const ID_ADMINISTRATIVE = CATEGORIES_DEPART[3].id;
const ID_AUTRE = CATEGORIES_DEPART[4].id;
/** Bien formé, mais d'aucune catégorie. */
const ID_INCONNU = "c0000000-0000-4000-8000-000000000099";

/** HTML de `/demandes?…` pour Karim, connecté. */
async function ecran(parametres: Record<string, string | string[]> = {}): Promise<string> {
  return renderToStaticMarkup(await ContenuDemandes({ searchParams: Promise.resolve(parametres) }));
}

/** Les références affichées (texte des liens, pas leur adresse), dans l'ordre. */
const references = (html: string) => [...html.matchAll(/>(NOVA-\d{4}-\d{4})</g)].map(([, r]) => r);

/** Texte de la zone d'annonce toujours présente (`role="status"`). */
const annonce = (html: string) =>
  html.match(/<p data-slot="annonce-resultats" role="status" class="sr-only">([^<]*)<\/p>/)?.[1] ?? null;

/** Un bouton de filtre (cadre, étiquette, liste), par le nom de son paramètre. */
const boutonFiltre = (html: string, nom: string) =>
  html.match(new RegExp(`<div data-slot="bouton-filtre"(?:(?!<div data-slot="bouton-filtre").)*?name="${nom}".*?</select>`))?.[0] ?? "";

/** Texte de l'option choisie d'un bouton de filtre. */
const valeurFiltre = (html: string, nom: string) =>
  boutonFiltre(html, nom).match(/<option(?=[^>]*selected="")[^>]*>([^<]*)</)?.[1]?.replace(/&#x27;/g, "'") ?? null;

/** Les boutons de filtre actifs, par le nom de leur paramètre. */
const actifs = (html: string) =>
  ["statut", "categorie", "canal"].filter((nom) => boutonFiltre(html, nom).includes("data-actif"));

/** Les liens « Réinitialiser » (rangée de filtres et état sans résultat). */
const reinitialiser = (html: string) => [...html.matchAll(/<a[^>]*>Réinitialiser<\/a>/g)].map(([lien]) => lien);

/** Adresse (décodée) d'un lien, dans une balise. */
const adresse = (balise: string) => balise.match(/href="([^"]*)"/)?.[1]?.replace(/&amp;/g, "&") ?? null;

/** Adresse du lien « Précédente » de la pagination. */
const precedente = (html: string) => adresse(html.match(/<a[^>]*rel="prev"[^>]*>/)?.[0] ?? "");

/**
 * 42 demandes fictives (catégorie « Autre », par le formulaire), dont :
 *   - 0042 : Nouvelle, Problème technique, « Imprimante en panne » ;
 *   - 0041 : Nouvelle, Demande d'information, « Imprimante : devis », par email ;
 *   - 0040 : Nouvelle, Problème technique, « Écran noir », par téléphone ;
 *   - 0037 : Traitée, Problème technique, « Imprimante réparée », par téléphone.
 */
function remplir() {
  const demandes = fabriquerDemandes(42, 5).map((d) => ({ ...d, categorie: "Autre", categorie_id: ID_AUTRE }));
  Object.assign(demandes[0], { objet: "Imprimante en panne", categorie: "Problème technique", categorie_id: ID_PROBLEME_TECHNIQUE });
  Object.assign(demandes[1], { objet: "Imprimante : devis", categorie: "Demande d'information", categorie_id: ID_INFORMATION, canal: "email" });
  Object.assign(demandes[2], { objet: "Écran noir", categorie: "Problème technique", categorie_id: ID_PROBLEME_TECHNIQUE, canal: "telephone" });
  Object.assign(demandes[5], { objet: "Imprimante réparée", categorie: "Problème technique", categorie_id: ID_PROBLEME_TECHNIQUE, canal: "telephone" });
  simulation.demandes.push(...demandes);
}

beforeEach(() => {
  simulation.reinitialiser();
  simulation.session.id = ID_KARIM;
  vi.spyOn(console, "error").mockImplementation(() => {});
  remplir();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("FR-13 : filtrer la liste", () => {
  it("trois conditions (Nouvelle + Problème technique + « imprimante ») : seules les demandes qui les remplissent, avec leur nombre", async () => {
    const html = await ecran({ statut: "nouvelle", categorie: ID_PROBLEME_TECHNIQUE, q: "imprimante" });
    expect(references(html)).toEqual(["NOVA-2026-0042"]);
    expect(html).toMatch(/<strong[^>]*>1 demande<\/strong>/);
    expect(annonce(html)).toBe("1 demande");
    expect(actifs(html)).toEqual(["statut", "categorie"]);
    expect(valeurFiltre(html, "statut")).toBe("Nouvelle");
    expect(valeurFiltre(html, "categorie")).toBe("Problème technique");
    expect(valeurFiltre(html, "canal")).toBe("Tous");
    expect(simulation.rpcSession).toHaveBeenCalledWith("lister_demandes", {
      p_page: 1,
      p_taille: 25,
      p_q: "imprimante",
      p_statut: "nouvelle",
      p_categorie: ID_PROBLEME_TECHNIQUE,
    });
  });

  it("chaque condition compte : sans le statut, la demande Traitée revient ; sans la catégorie, celle d'information", async () => {
    expect(references(await ecran({ categorie: ID_PROBLEME_TECHNIQUE, q: "imprimante" }))).toEqual(["NOVA-2026-0042", "NOVA-2026-0037"]);
    expect(references(await ecran({ statut: "nouvelle", q: "imprimante" }))).toEqual(["NOVA-2026-0042", "NOVA-2026-0041"]);
  });

  it("un seul filtre (?canal=telephone) : les demandes reçues par téléphone ; bouton Canal actif", async () => {
    const html = await ecran({ canal: "telephone" });
    expect(references(html)).toEqual(["NOVA-2026-0040", "NOVA-2026-0037"]);
    expect(texteDe(html)).toContain("2 demandes");
    expect(actifs(html)).toEqual(["canal"]);
    expect(valeurFiltre(html, "canal")).toBe("Téléphone");
    expect(reinitialiser(html)).toHaveLength(1);
  });

  it("rien ne correspond : « Aucune demande trouvée », la phrase d'aide et « Réinitialiser » ; annoncé", async () => {
    const html = await ecran({ statut: "traitee", canal: "email" });
    expect(html).not.toContain("<table");
    expect(texteDe(html)).toContain("Aucune demande trouvée Vérifiez l'orthographe ou retirez des filtres. Réinitialiser");
    expect(annonce(html)).toBe("Aucune demande trouvée");
    // Celui de la rangée de filtres et celui de l'état sans résultat, tous deux vers /demandes.
    expect(reinitialiser(html).map(adresse)).toEqual(["/demandes", "/demandes"]);
    expect(actifs(html)).toEqual(["statut", "canal"]);
  });

  it("réinitialiser : /demandes affiche toute la liste, champ vide, filtres « Tous »", async () => {
    const avant = await ecran({ statut: "nouvelle", q: "imprimante" });
    expect(adresse(reinitialiser(avant)[0])).toBe("/demandes");
    const html = await ecran();
    expect(texteDe(html)).toContain("42 demandes");
    expect(html).toMatch(/<input[^>]*name="q"[^>]*value=""/);
    expect(actifs(html)).toEqual([]);
    expect(["statut", "categorie", "canal"].map((nom) => valeurFiltre(html, nom))).toEqual(["Tous", "Toutes", "Tous"]);
    expect(reinitialiser(html)).toEqual([]);
  });

  it("« Réinitialiser » de la rangée : seulement si un filtre est actif (pas pour une recherche seule) ; remplace l'adresse", async () => {
    expect(reinitialiser(await ecran({ q: "imprimante" }))).toEqual([]);
    expect(reinitialiser(await ecran({ categorie: ID_AUTRE }))).toHaveLength(1);
    const source = readFileSync(join(process.cwd(), "src/components/interne/filtres-demandes.tsx"), "utf8");
    expect(source).toMatch(/\{filtreActif\(choix\) \? \(\s*<Button asChild variant="secondaire" size="sm" className="ml-auto">\s*<Link href=\{adresseListe\(\)\} replace onClick=\{onReinitialiser\}>/);
  });

  it("retour du détail : filtres, recherche et page gardés par les liens, le détail et son fil d'Ariane", async () => {
    // 38 demandes « Autre » qui contiennent « demandeur » : deux pages.
    const parametres = { q: "demandeur", categorie: ID_AUTRE, canal: "formulaire", page: "2" };
    const suite = `q=demandeur&categorie=${ID_AUTRE}&canal=formulaire`;
    const html = await ecran(parametres);
    expect(texteDe(html)).toContain("38 demandes");
    expect(texteDe(html)).toContain("Page 2 sur 2");
    const lien = html.match(/<a [^>]*>(NOVA-\d{4}-\d{4})<\/a>/);
    expect(lien?.[1]).toBe("NOVA-2026-0013");
    expect(adresse(lien![0])).toBe(`/demandes/${lien![1]}?${suite}&page=2`);
    expect(precedente(html)).toBe(`/demandes?${suite}`);

    const detail = renderToStaticMarkup(
      await ContenuDemande({ params: Promise.resolve({ reference: lien![1] }), searchParams: Promise.resolve(parametres) }),
    );
    const retour = detail.match(/<nav aria-label="Fil d&#x27;Ariane"[^>]*>.*?<a [^>]*href="([^"]*)"/)?.[1]?.replace(/&amp;/g, "&");
    expect(retour).toBe(`/demandes?${suite}&page=2`);
  });

  it("le fil d'Ariane ignore les filtres invalides de l'adresse du détail", async () => {
    const detail = renderToStaticMarkup(
      await ContenuDemande({
        params: Promise.resolve({ reference: "NOVA-2026-0042" }),
        searchParams: Promise.resolve({ statut: "abc", canal: ["email", "fax"], categorie: "x" }),
      }),
    );
    expect(detail).toMatch(/<nav aria-label="Fil d&#x27;Ariane"[^>]*>.*?<a [^>]*href="\/demandes\?canal=email"/);
  });

  it.each([
    ["?statut=abc", { statut: "abc" }],
    ["?canal=fax", { canal: "fax" }],
    ["?categorie=pas-un-uuid", { categorie: "pas-un-uuid" }],
    ["UUID d'aucune catégorie", { categorie: ID_INCONNU }],
  ])("valeur inconnue (%s) : filtre ignoré (« Tous »), liste non filtrée", async (_, parametres) => {
    const html = await ecran(parametres);
    expect(texteDe(html)).toContain("42 demandes");
    expect(actifs(html)).toEqual([]);
    expect(reinitialiser(html)).toEqual([]);
    expect(html).toMatch(/<a[^>]*rel="next"[^>]*href="\/demandes\?page=2"|<a[^>]*href="\/demandes\?page=2"[^>]*rel="next"/);
  });

  it("catégorie désactivée : proposée après les actives, sous un trait, suivie de « (désactivée) » ; filtrable", async () => {
    simulation.categories.find((c) => c.id === ID_ADMINISTRATIVE)!.active = false;
    Object.assign(simulation.demandes[10], { categorie: "Question administrative", categorie_id: ID_ADMINISTRATIVE });

    const html = await ecran();
    const options = [...boutonFiltre(html, "categorie").matchAll(/<option[^>]*>([^<]*)<\/option>|<hr\/>/g)].map(
      ([balise, texte]) => (balise === "<hr/>" ? "—" : texte.replace(/&#x27;/g, "'")),
    );
    expect(options).toEqual([
      "Toutes",
      "Demande d'information",
      "Problème technique",
      "Demande de rendez-vous",
      "Autre",
      "—",
      "Question administrative (désactivée)",
    ]);

    const filtree = await ecran({ categorie: ID_ADMINISTRATIVE });
    expect(references(filtree)).toEqual(["NOVA-2026-0032"]);
    expect(valeurFiltre(filtree, "categorie")).toBe("Question administrative (désactivée)");
    expect(actifs(filtree)).toEqual(["categorie"]);
  });

  it("catégories illisibles : bouton Catégorie désactivé, le reste marche ; panne journalisée avec un code", async () => {
    simulation.pannesRpc.lister_categories = { data: null, error: { code: "57P01", message: "x" } };
    const html = await ecran({ statut: "nouvelle" });
    expect(boutonFiltre(html, "categorie")).toMatch(/<select[^>]*disabled=""/);
    expect(boutonFiltre(html, "statut")).not.toMatch(/<select[^>]*disabled=""/);
    expect(boutonFiltre(html, "canal")).not.toMatch(/<select[^>]*disabled=""/);
    expect(texteDe(html)).toContain("5 demandes");
    expect(actifs(html)).toEqual(["statut"]);
    expect(simulation.journal()).toEqual([
      { evenement: "erreur_inattendue", details: { type: "lecture", lecture: "lister_categories" } },
    ]);
    expect(simulation.appels("ecrire_journal")[0]).toMatchObject({ p_code_erreur: expect.stringMatching(/\S/) });
  });

  it("panne de la liste : « Impossible de charger les demandes. » + « Réessayer » ; filtres utilisables", async () => {
    simulation.pannesRpc.lister_demandes = { data: null, error: { code: "57P01", message: "x" } };
    const html = await ecran({ statut: "nouvelle", canal: "email", q: "imprimante" });
    expect(texteDe(html)).toContain("Impossible de charger les demandes. Réessayer");
    for (const nom of ["statut", "categorie", "canal"]) expect(boutonFiltre(html, nom)).not.toMatch(/<select[^>]*disabled=""/);
    expect(actifs(html)).toEqual(["statut", "canal"]);
    expect(annonce(html)).toBe("");
  });
});

describe("journal (AD-12, AD-13) : ni le texte cherché ni les filtres", () => {
  it.each([
    ["refus de la base", { data: null, error: { code: "57P01", message: "x" } }],
    ["réponse inattendue", { data: { total: 1, page: 1, demandes: [{ statut: "inconnu" }] }, error: null }],
  ])("%s : journalisée avec un code, sans filtre ni texte", async (_, panne) => {
    simulation.pannesRpc.lister_demandes = panne;
    const filtres = { statut: "en_cours", categorie: ID_PROBLEME_TECHNIQUE, canal: "telephone" } as const;
    await expect(lireListeDemandes(1, "helene.dupuis@boulangerie-dupuis.fr", filtres)).resolves.toEqual({ ok: false });
    expect(simulation.journal()).toEqual([
      { evenement: "erreur_inattendue", details: { type: "lecture", lecture: "lister_demandes" } },
    ]);
    const ecrit = JSON.stringify(simulation.rpc.mock.calls) + vi.mocked(console.error).mock.calls.map(String).join("\n");
    expect(ecrit).not.toMatch(/helene|dupuis|en_cours|telephone|c0000000/i);
  });

  it("lecture des catégories en panne : rien d'autre que le nom de la lecture", async () => {
    simulation.pannesRpc.lister_categories = { data: [{ id: "x", nom: "Secret" }], error: null };
    await expect(lireCategoriesFiltre()).resolves.toEqual({ ok: false });
    expect(simulation.journal()).toEqual([
      { evenement: "erreur_inattendue", details: { type: "lecture", lecture: "lister_categories" } },
    ]);
    expect(vi.mocked(console.error).mock.calls.map(String).join("\n")).not.toContain("Secret");
  });
});

describe("rangée de filtres (DESIGN.md, Bouton de filtre ; accessibilité)", () => {
  it("sous le champ, dans le même formulaire GET : icône « curseurs » devant « Filtres », puis Statut, Catégorie, Canal (et « À traiter », story 2.2)", async () => {
    const html = await ecran();
    const formulaire = html.match(/<form role="search" action="\/demandes" method="get">.*?<\/form>/)?.[0] ?? "";
    expect(formulaire.indexOf('name="q"')).toBeLessThan(formulaire.indexOf('data-slot="filtres"'));
    expect(formulaire).toMatch(/<div data-slot="filtres" role="group" aria-labelledby="([^"]+)"[^>]*><span id="\1"[^>]*><svg[^>]*lucide-sliders-horizontal[^>]*aria-hidden="true"[^>]*>.*?<\/svg>Filtres<\/span>/);
    expect([...formulaire.matchAll(/<select[^>]*name="(\w+)"/g)].map(([, nom]) => nom)).toEqual(["statut", "categorie", "canal"]);
    expect(texteDe(formulaire)).toMatch(/^Filtres Statut : Tous Nouvelle En cours Traitée Catégorie : Toutes .* Canal : Tous Formulaire Téléphone Email À traiter$/);
    // Pas de filtres Should (epic 6).
    expect(texteDe(html)).not.toMatch(/Priorité|Attribution|Sans activité/);
  });

  it("chaque bouton : étiquette visible liée à la liste, valeurs = codes de l'adresse, 36 px, bordure grise", async () => {
    const html = await ecran();
    const statut = boutonFiltre(html, "statut");
    const id = statut.match(/<select[^>]*id="([^"]+)"/)?.[1];
    expect(statut).toContain(`<label for="${id}"`);
    expect(statut).toMatch(/>Statut :<\/label>/);
    expect([...statut.matchAll(/<option[^>]*value="([^"]*)"/g)].map(([, v]) => v)).toEqual(["", "nouvelle", "en_cours", "traitee"]);
    expect([...boutonFiltre(html, "canal").matchAll(/<option[^>]*value="([^"]*)"/g)].map(([, v]) => v)).toEqual(["", "formulaire", "telephone", "email"]);
    expect(statut).toMatch(/^<div data-slot="bouton-filtre" class="[^"]*\bh-9\b[^"]*\bborder-border-input\b/);
    expect(statut).not.toContain("bg-primary-soft");
    expect(statut).toMatch(/<select[^>]*class="[^"]*font-semibold/);
  });

  it("actif : fond primary-soft, bordure et texte bleus", async () => {
    const statut = boutonFiltre(await ecran({ statut: "en_cours" }), "statut");
    expect(statut).toMatch(/^<div data-slot="bouton-filtre" data-actif="true" class="[^"]*border-primary bg-primary-soft text-primary/);
  });

  it("composant client : un filtre part tout de suite, avec le texte tapé, à la page 1, sans remplir l'historique", () => {
    const source = readFileSync(join(process.cwd(), "src/components/interne/recherche-demandes.tsx"), "utf8");
    expect(source).toMatch(/function filtrer\(nouveaux: FiltresListe\) \{\s*setChoix\(nouveaux\);\s*naviguer\(texte, nouveaux\);/);
    // La frappe en attente est remplacée par la navigation qui l'emporte (pas annulée).
    expect(source).toMatch(/function naviguer\(brut: string, nouveaux: FiltresListe\) \{\s*arreterMinuteur\(\);/);
    expect(source).toContain(
      "<FiltresDemandes choix={choix} categories={categories} onChange={filtrer} onReinitialiser={reinitialiser} />",
    );
    // « Réinitialiser » vide la barre avant de naviguer : ni la frappe en attente, ni l'ancien choix ne reviennent.
    expect(source).toMatch(/function reinitialiser\(\) \{\s*arreterMinuteur\(\);\s*setTexte\(""\);\s*setChoix\(\{\}\);\s*setEnvoyee\(adresseListe\(\)\);/);
    expect(source).not.toContain("router.push");
  });
});

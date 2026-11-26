import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Écran I4 « Détail d'une demande » (story 1.10 ; FR-15, FR-17, NFR-11,
// EXPERIENCE.md, DESIGN.md), rendu en HTML avec Supabase simulé : en-tête,
// blocs Demande, Demandeur, Informations et Historique, panneau « Statut »,
// description piégée affichée telle quelle, champs facultatifs vides, fil
// d'Ariane qui garde la recherche et la page, demande introuvable,
// squelette, et lien de chaque ligne de la liste vers le détail.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `connection()` n'a de sens que pendant une vraie requête Next.js.
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
// La barre de recherche de la liste (composant client) lit le routeur.
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, replace: () => {} }),
}));

import { ContenuDemande } from "@/app/(interne)/demandes/[reference]/contenu-demande";
import DemandeIntrouvable from "@/app/(interne)/demandes/[reference]/not-found";
import PageDemande from "@/app/(interne)/demandes/[reference]/page";
import { ContenuDemandes } from "@/app/(interne)/demandes/contenu-demandes";
import { SqueletteDemande } from "@/components/interne/squelette-demande";
import { TableauDemandes } from "@/components/interne/tableau-demandes";
import { adresseDetail } from "@/shared/adresse-liste";

import { texteDe } from "../aides/formulaire-depot";
import { fabriquerDemandes, ID_KARIM, type DemandeSimulee } from "../aides/supabase-connexion";

const PIEGE = "<script>alert(1)</script>\nDeuxième ligne\n\nQuatrième ligne <b>gras</b> & co";

/** La demande de Claire (EXPERIENCE.md, Flux 1), sans téléphone. */
const CLAIRE: DemandeSimulee = {
  ...fabriquerDemandes(42)[0],
  nom: "Claire Martin",
  email: "claire.martin@cabinet-martin.fr",
  telephone: null,
  entreprise: "Cabinet Martin Expertise",
  objet: "Accès impossible à l'outil de facturation",
  description: "Depuis ce matin, l'outil affiche « session refusée ».\nJ'ai redémarré le poste, sans effet.",
  statut: "nouvelle",
};

/** HTML de `/demandes/{reference}?…` pour Karim, connecté. */
async function ecran(reference = "NOVA-2026-0042", parametres: Record<string, string | string[]> = {}): Promise<string> {
  return renderToStaticMarkup(
    await ContenuDemande({ params: Promise.resolve({ reference }), searchParams: Promise.resolve(parametres) }),
  );
}

/** Un bloc de la colonne principale, par son titre. */
function bloc(html: string, titre: string): string {
  return html.match(new RegExp(`<section[^>]*><h2[^>]*>(?:(?!</h2>).)*${titre}</h2>[\\s\\S]*?</section>`))?.[0] ?? "";
}

/** Le lien « ← Demandes » du fil d'Ariane. */
const lienRetour = (html: string) =>
  html.match(/<nav aria-label="Fil d&#x27;Ariane"[^>]*>.*?<a [^>]*href="([^"]*)"/)?.[1]?.replace(/&amp;/g, "&");

beforeEach(() => {
  simulation.reinitialiser();
  simulation.session.id = ID_KARIM;
  simulation.demandes.push(CLAIRE, ...fabriquerDemandes(41));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("demande existante (NOVA-2026-0042)", () => {
  it("en-tête : fil d'Ariane, référence en chasse fixe, objet en titre, badge de statut", async () => {
    const html = await ecran();
    expect(texteDe(html)).toMatch(
      /^Demandes NOVA-2026-0042 NOVA-2026-0042 Accès impossible à l'outil de facturation Nouvelle /,
    );
    expect(html).toMatch(/<p class="font-mono[^"]*">NOVA-2026-0042<\/p>/);
    expect(html).toMatch(/<h1[^>]*>Accès impossible à l&#x27;outil de facturation<\/h1><span data-slot="badge-statut" data-statut="nouvelle"/);
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("bloc Demande : la description, retours à la ligne gardés", async () => {
    const demande = bloc(await ecran(), "Demande");
    expect(demande).toContain(
      "Depuis ce matin, l&#x27;outil affiche « session refusée ».\nJ&#x27;ai redémarré le poste, sans effet.",
    );
    expect(demande).toMatch(/data-slot="description" class="[^"]*whitespace-pre-wrap/);
  });

  it("bloc Demandeur : nom, email en mailto:, « Non renseigné », entreprise", async () => {
    const demandeur = bloc(await ecran(), "Demandeur");
    expect(texteDe(demandeur)).toBe(
      "Demandeur Nom Claire Martin Email claire.martin@cabinet-martin.fr Téléphone Non renseigné Entreprise Cabinet Martin Expertise Voir ses autres demandes",
    );
    expect(demandeur).toMatch(/<a href="mailto:claire\.martin@cabinet-martin\.fr"[^>]*>claire\.martin@cabinet-martin\.fr<\/a>/);
    expect(demandeur).not.toContain("tel:");
  });

  it("téléphone en tel: ; entreprise absente : « Non renseignée »", async () => {
    simulation.demandes[0] = { ...CLAIRE, telephone: "06 12 34 56 78", entreprise: null };
    const demandeur = bloc(await ecran(), "Demandeur");
    expect(demandeur).toMatch(/<a href="tel:0612345678"[^>]*>06 12 34 56 78<\/a>/);
    expect(texteDe(demandeur)).toContain("Entreprise Non renseignée");
  });

  it("téléphone sans aucun chiffre : affiché en simple texte, sans lien tel:", async () => {
    simulation.demandes[0] = { ...CLAIRE, telephone: "inconnu" };
    const demandeur = bloc(await ecran(), "Demandeur");
    expect(texteDe(demandeur)).toContain("Téléphone inconnu");
    expect(demandeur).not.toContain("tel:");
  });

  it("email piégé (champs de message dans l'adresse) : encodé dans mailto:, arobases lisibles", async () => {
    simulation.demandes[0] = { ...CLAIRE, email: "a@b.fr?cc=x@y.fr&body=z" };
    const demandeur = bloc(await ecran(), "Demandeur");
    expect(demandeur).toMatch(/<a href="mailto:a@b\.fr%3Fcc%3Dx@y\.fr%26body%3Dz"[^>]*>a@b\.fr\?cc=x@y\.fr&amp;body=z<\/a>/);
  });

  it("bloc Informations : catégorie, canal, date de dépôt (heure de Paris) ; ni clôture ni « (désactivée) »", async () => {
    const informations = bloc(await ecran(), "Informations");
    expect(texteDe(informations)).toBe(
      "Informations Catégorie Problème technique Canal Formulaire Déposée le 8 nov. 2026, 8 h 47",
    );
    expect(informations).toContain('<time dateTime="2026-11-08T07:47:00.000Z">');
  });

  it("catégorie désactivée depuis (story 4.2, RM-11) : « Problème technique (désactivée) »", async () => {
    simulation.categories[1].active = false;
    const informations = bloc(await ecran(), "Informations");
    expect(texteDe(informations)).toContain("Catégorie Problème technique (désactivée) Canal Formulaire");
  });

  it("la mention n'est que sur le détail : le tableau de I3 (lu dans la base simulée) garde le nom seul", async () => {
    simulation.categories[1].active = false;
    const html = renderToStaticMarkup(await ContenuDemandes({ searchParams: Promise.resolve({}) }));
    const tableau = html.match(/<table data-slot="tableau-demandes"[\s\S]*?<\/table>/)?.[0] ?? "";
    expect(texteDe(tableau)).toContain("Problème technique");
    expect(tableau).not.toContain("(désactivée)");
  });

  it.each([
    ["telephone", "Téléphone"],
    ["email", "Email"],
  ] as const)("canal %s : « %s »", async (canal, libelle) => {
    simulation.demandes[0] = { ...CLAIRE, canal };
    expect(texteDe(bloc(await ecran(), "Informations"))).toContain(`Canal ${libelle}`);
  });

  it("historique : « Demande créée · Demandeur · 8 nov. 2026, 8 h 47 »", async () => {
    const historique = bloc(await ecran(), "Historique");
    expect(texteDe(historique)).toBe("Historique Demande créée Demandeur · 8 nov. 2026, 8 h 47");
    expect(historique).toMatch(/<ol data-slot="historique"/);
  });

  it("historique : affiché dans l'ordre reçu de la base (du plus ancien au plus récent)", async () => {
    simulation.demandes[0] = {
      ...CLAIRE,
      evenements: [
        { type: "creation", auteur: "demandeur", date: "2026-11-08T07:47:00+00:00" },
        { type: "creation", auteur: "systeme", date: "2026-11-08T08:12:00+00:00" },
      ],
    };
    const lignes = [...bloc(await ecran(), "Historique").matchAll(/<li data-slot="evenement".*?<\/li>/g)].map(([l]) =>
      texteDe(l),
    );
    expect(lignes).toEqual([
      "Demande créée Demandeur · 8 nov. 2026, 8 h 47",
      "Demande créée Système · 8 nov. 2026, 9 h 12",
    ]);
  });

  it("panneau « Statut » : le statut actuel, puis les seuls passages permis (story 1.11)", async () => {
    const html = await ecran();
    const panneau = html.match(/<aside[^>]*data-slot="panneau-statut".*?<\/aside>/)?.[0] ?? "";
    expect(texteDe(panneau)).toBe("Statut Actuel : Nouvelle Passer En cours Marquer Traitée");
    expect(panneau).toContain('aria-labelledby="titre-panneau-statut"');
    expect(html.match(/<button/g)).toHaveLength(2);
  });

  it("deux colonnes à partir de 1 024 px ; une colonne en dessous, panneau sous l'en-tête", async () => {
    const html = await ecran();
    expect(html).toMatch(/class="grid gap-6 lg:grid-cols-\[minmax\(0,1fr\)_20rem\][^"]*"><aside/);
    expect(html.indexOf('data-slot="panneau-statut"')).toBeLessThan(html.indexOf("<section"));
    expect(html).toMatch(/data-slot="panneau-statut" class="[^"]*lg:col-start-2 lg:row-start-1/);
  });

  it("ni priorité, ni clôture (demande non traitée), ni attribution, ni commentaire, ni suppression", async () => {
    const texte = texteDe(await ecran());
    expect(texte).not.toMatch(/Priorité|Clôturée|Attribuée|Commentaire|Supprimer|désactivée/);
  });

  it("le statut vient de la base (En cours)", async () => {
    simulation.demandes[0] = { ...CLAIRE, statut: "en_cours" };
    const html = await ecran();
    expect(html.match(/data-statut="en_cours"/g)).toHaveLength(2);
  });
});

describe("description piégée (NFR-11)", () => {
  it("affichée telle quelle, échappée, lignes gardées : rien d'exécuté", async () => {
    simulation.demandes[0] = { ...CLAIRE, description: PIEGE };
    const html = await ecran();
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>gras</b>");
    expect(bloc(html, "Demande")).toContain(
      "&lt;script&gt;alert(1)&lt;/script&gt;\nDeuxième ligne\n\nQuatrième ligne &lt;b&gt;gras&lt;/b&gt; &amp; co",
    );
  });

  it("l'objet et le nom piégés sont aussi du texte", async () => {
    simulation.demandes[0] = { ...CLAIRE, objet: "<img src=x onerror=alert(1)>", nom: "<i>Claire</i>" };
    const html = await ecran();
    expect(html).not.toMatch(/<img|<i>/);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("le code n'utilise jamais dangerouslySetInnerHTML", () => {
    for (const fichier of [
      "src/app/(interne)/demandes/[reference]/contenu-demande.tsx",
      "src/components/interne/historique-demande.tsx",
      "src/components/interne/fil-ariane.tsx",
    ]) {
      expect(readFileSync(join(process.cwd(), fichier), "utf8")).not.toContain("dangerouslySetInnerHTML");
    }
  });
});

describe("référence dans l'adresse", () => {
  it("en minuscules : même demande", async () => {
    const html = await ecran("nova-2026-0042");
    expect(texteDe(html)).toContain("Accès impossible à l'outil de facturation");
    expect(simulation.rpcSession).toHaveBeenCalledWith("lire_demande", { p_reference: "NOVA-2026-0042" });
  });

  it.each(["NOVA-2026-9999", "abc"])("inconnue ou mal formée (%s) : notFound()", async (reference) => {
    await expect(ecran(reference)).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("mal formée : aucun appel à la base", async () => {
    await expect(ecran("abc")).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("sans session : renvoi vers la connexion avant toute lecture", async () => {
    simulation.session.id = null;
    await expect(ecran()).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/) });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("panne : l'erreur remonte (écran S3)", async () => {
    simulation.pannesRpc.lire_demande = { data: null, error: { code: "57P01", message: "connexion perdue" } };
    await expect(ecran()).rejects.toThrow("La fonction lire_demande a échoué (code 57P01).");
  });
});

describe("demande introuvable (not-found.tsx)", () => {
  const html = renderToStaticMarkup(<DemandeIntrouvable />);

  it("message de l'UX et « Retour aux demandes » en bouton principal vers /demandes", () => {
    expect(html).toContain("Cette demande n&#x27;existe pas ou a été supprimée.");
    const lien = html.match(/<a [^>]*>(?:(?!<\/a>).)*Retour aux demandes<\/a>/)?.[0] ?? "";
    expect(lien).toContain('href="/demandes"');
    expect(lien).toContain('data-variant="principal"');
    expect(html).not.toContain("Déposer une demande");
  });

  it("garde le logo, sans pastille d'icône", () => {
    expect(html).toContain('aria-label="Nova Services"');
    expect(html).not.toContain("bg-accent-nova-soft");
  });
});

describe("fil d'Ariane : retour à la même liste", () => {
  it("venu de ?q=helene&page=2 : /demandes?q=helene&page=2", async () => {
    expect(lienRetour(await ecran("NOVA-2026-0042", { q: "helene", page: "2" }))).toBe("/demandes?q=helene&page=2");
  });

  it("adresse sans q ni page : /demandes", async () => {
    expect(lienRetour(await ecran())).toBe("/demandes");
  });

  it("q et page nettoyés comme dans la liste (espaces, page impossible)", async () => {
    expect(lienRetour(await ecran("NOVA-2026-0042", { q: "  Hélène Dupuis ", page: "abc" }))).toBe(
      "/demandes?q=H%C3%A9l%C3%A8ne+Dupuis",
    );
    expect(lienRetour(await ecran("NOVA-2026-0042", { page: ["3", "4"] }))).toBe("/demandes?page=3");
  });

  it("« ← Demandes » en lien bleu, puis la référence en chasse fixe (page actuelle)", async () => {
    const html = await ecran();
    const fil = html.match(/<nav aria-label="Fil d&#x27;Ariane".*?<\/nav>/)?.[0] ?? "";
    expect(texteDe(fil)).toBe("Demandes NOVA-2026-0042");
    expect(fil).toMatch(/<a [^>]*class="[^"]*text-primary[^"]*"[^>]*><svg[^>]*lucide-arrow-left/);
    expect(fil).toMatch(/<span aria-current="page" class="font-mono">NOVA-2026-0042<\/span>/);
  });
});

describe("chargement", () => {
  it("la page : contenu sous <Suspense>, squelette en attendant", () => {
    const html = renderToStaticMarkup(
      <PageDemande params={Promise.resolve({ reference: "NOVA-2026-0042" })} searchParams={Promise.resolve({})} />,
    );
    expect(html).toContain('data-slot="squelette"');
  });

  it("squelette : visible après 300 ms, annoncé « Chargement… »", () => {
    const html = renderToStaticMarkup(<SqueletteDemande />);
    expect(html).toMatch(/<div data-slot="squelette" role="status" class="animate-apres-300ms"/);
    expect(html).toContain('<span class="sr-only">Chargement…</span>');
  });
});

describe("liste : chaque ligne ouvre le détail", () => {
  /** Le lien de la première ligne du tableau. */
  const premierLien = (html: string) =>
    html.match(/<tr data-slot="ligne-demande"[^>]*>.*?<a [^>]*href="([^"]*)"[^>]*>(NOVA-[^<]*)<\/a>/)?.slice(1);

  it("adresseDetail garde q et page", () => {
    expect(adresseDetail("NOVA-2026-0042")).toBe("/demandes/NOVA-2026-0042");
    expect(adresseDetail("NOVA-2026-0042", { q: "helene", page: 2 })).toBe("/demandes/NOVA-2026-0042?q=helene&page=2");
    expect(adresseDetail("NOVA-2026-0042", { q: "  ", page: 1 })).toBe("/demandes/NOVA-2026-0042");
    expect(adresseDetail("NOVA-2026-0042", { q: "a&b" })).toBe("/demandes/NOVA-2026-0042?q=a%26b");
  });

  it("la référence est un vrai lien, étiré sur toute la ligne", () => {
    const html = renderToStaticMarkup(
      <TableauDemandes demandes={[{ id: CLAIRE.id, reference: CLAIRE.reference, dateDepot: "2026-11-08T07:47:00.000Z", nom: CLAIRE.nom, objet: CLAIRE.objet, categorie: CLAIRE.categorie, statut: "nouvelle" }]} />,
    );
    expect(html).toMatch(/<tr data-slot="ligne-demande" class="relative[^"]*"/);
    expect(html).toMatch(/<a class="[^"]*after:absolute after:inset-0[^"]*" href="\/demandes\/NOVA-2026-0042">NOVA-2026-0042<\/a>|<a href="\/demandes\/NOVA-2026-0042" class="[^"]*after:absolute after:inset-0[^"]*">NOVA-2026-0042<\/a>/);
  });

  it("accueil de la liste : lien sans paramètre", async () => {
    const html = renderToStaticMarkup(await ContenuDemandes({ searchParams: Promise.resolve({}) }));
    expect(premierLien(html)).toEqual(["/demandes/NOVA-2026-0042", "NOVA-2026-0042"]);
    expect(html.match(/<a [^>]*href="\/demandes\/NOVA-\d{4}-\d{4}"/g)).toHaveLength(25);
  });

  it("page 2 d'une recherche : chaque lien porte q et page", async () => {
    const html = renderToStaticMarkup(
      await ContenuDemandes({ searchParams: Promise.resolve({ q: "demandeur", page: "2" }) }),
    );
    expect(premierLien(html)).toEqual(["/demandes/NOVA-2026-0016?q=demandeur&amp;page=2", "NOVA-2026-0016"]);
  });

  it("la liste n'affiche toujours ni email ni téléphone", async () => {
    const html = renderToStaticMarkup(await ContenuDemandes({ searchParams: Promise.resolve({}) }));
    expect(html).not.toMatch(/@|mailto:|tel:/);
  });
});

/** Le lien « Voir ses autres demandes » du bloc Demandeur (story 2.4) : [balise, href, contenu]. */
function lienAutres(html: string) {
  const trouve = bloc(html, "Demandeur").match(/<a ([^>]*data-slot="autres-demandes"[^>]*)>(.*?)<\/a>/);
  if (!trouve) return null;
  const href = trouve[1].match(/href="([^"]*)"/)?.[1] ?? "";
  return { balise: trouve[1], adresse: new URL(href.replace(/&amp;/g, "&"), "http://localhost"), contenu: trouve[2] };
}

describe("« Voir ses autres demandes » (story 2.4, FR-12)", () => {
  it("dans le bloc Demandeur, sous les champs : la liste cherchée sur son email", async () => {
    const lien = lienAutres(await ecran());
    expect(lien).not.toBeNull();
    expect(texteDe(lien!.contenu)).toBe("Voir ses autres demandes");
    expect(lien!.adresse.pathname).toBe("/demandes");
    expect(Object.fromEntries(lien!.adresse.searchParams)).toEqual({ q: "claire.martin@cabinet-martin.fr" });
  });

  it("venu d'une liste filtrée (q, statut, catégorie, canal, à traiter, page 2) : seulement l'email, ni filtre ni page", async () => {
    const lien = lienAutres(
      await ecran("NOVA-2026-0042", {
        q: "helene",
        statut: "nouvelle",
        categorie: "11111111-1111-4111-8111-111111111111",
        canal: "telephone",
        a_traiter: "oui",
        page: "2",
      }),
    );
    expect(Object.fromEntries(lien!.adresse.searchParams)).toEqual({ q: "claire.martin@cabinet-martin.fr" });
  });

  it.each(["anne+devis@exemple.fr", "a@b.fr?cc=x@y.fr&body=z", "O'Brien@Exemple.fr"])(
    "email avec caractères spéciaux (« %s ») : encodé dans l'adresse, retrouvé tel quel",
    async (email) => {
      simulation.demandes[0] = { ...CLAIRE, email };
      expect(lienAutres(await ecran())!.adresse.searchParams.get("q")).toBe(email);
    },
  );

  it("vrai lien de 44 px de haut, en bleu souligné, loupe décorative", async () => {
    const lien = lienAutres(await ecran())!;
    expect(lien.balise).toMatch(/min-h-11/);
    expect(lien.balise).toMatch(/text-primary/);
    expect(lien.balise).toMatch(/\bunderline\b/);
    expect(lien.contenu).toMatch(/^<svg[^>]*aria-hidden="true"/);
  });
});

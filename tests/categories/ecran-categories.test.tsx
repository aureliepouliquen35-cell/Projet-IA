import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Écran A2 « Catégories » et son lien du menu (story 4.1 ; EXPERIENCE.md,
// A2 ; DESIGN.md, Tableau, Badges, Squelette ; FR-26, RM-7), rendus en HTML
// sans navigateur : la page, le champ « Nouvelle catégorie » et
// « Ajouter », la liste Nom · État · Nombre de demandes · Actions,
// « Renommer » et sa ligne modifiable, les messages sous les champs, l'état
// d'erreur, le squelette, puis les réducteurs et les envois (verrou, toast).
// Supabase est simulé ; les Server Functions le sont pour les envois.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);
const chemin = vi.hoisted(() => ({ valeur: "/admin/categories" as string | null }));

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `connection()` n'a de sens que pendant une vraie requête Next.js.
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  usePathname: () => chemin.valeur,
  useRouter: () => ({ refresh: () => {} }),
}));
vi.mock("@/server/actions/ajouter-categorie", () => ({ actionAjouterCategorie: vi.fn() }));
vi.mock("@/server/actions/renommer-categorie", () => ({ actionRenommerCategorie: vi.fn() }));
vi.mock("@/server/actions/changer-etat-categorie", () => ({ actionChangerEtatCategorie: vi.fn() }));
vi.mock("@/server/actions/supprimer-categorie", () => ({ actionSupprimerCategorie: vi.fn() }));

import { ContenuCategories } from "@/app/(interne)/admin/categories/contenu-categories";
import PageCategories, { metadata } from "@/app/(interne)/admin/categories/page";
import {
  actionApresReponseAjout,
  envoyerAjout,
  ETAT_AJOUT_INITIAL,
  ID_NOUVELLE_CATEGORIE,
  preparerEnvoiAjout,
  reduireAjout,
  VueAjouterCategorie,
  type ActionAjout,
  type EtatAjout,
} from "@/components/interne/ajouter-categorie";
import {
  actionApresReponseRenommage,
  envoyerRenommage,
  ETAT_RENOMMAGE_INITIAL,
  idChampRenommage,
  idFormulaireRenommage,
  preparerEnvoiRenommage,
  reduireRenommage,
  VueLigneCategorie,
  type ActionRenommage,
  type EtatRenommage,
} from "@/components/interne/renommer-categorie";
import { SectionAdministration } from "@/components/interne/section-administration";
import {
  BadgeDesactivee,
  EtatCategoriesErreur,
  LIGNES_SQUELETTE_CATEGORIES,
  SqueletteCategories,
} from "@/components/interne/tableau-categories";
import { ADRESSE_CATEGORIES } from "@/shared/acces";
import { MESSAGES_CATEGORIES } from "@/shared/messages";
import { echec, succes } from "@/shared/reponse";

import { texteDe } from "../aides/formulaire-depot";
import { CATEGORIES_DEPART, fabriquerDemandes, ID_KARIM, ID_SOPHIE, PROFIL_SOPHIE } from "../aides/supabase-connexion";

const S1 = "Accès refusé. Cette page est réservée aux administrateurs.";
const DEJA_PRIS = "Une catégorie active porte déjà ce nom.";
const PANNE = "La catégorie n'a pas pu être enregistrée. Réessayez.";
const OBLIGATOIRE = "Ce champ est obligatoire";
const TROP_LONG = "Le nom ne doit pas dépasser 50 caractères";

const AUTRE = { id: CATEGORIES_DEPART[4].id, nom: "Autre", active: true, nombreDemandes: 3 };

beforeEach(() => {
  simulation.reinitialiser();
  simulation.profils.set(ID_SOPHIE, { ...PROFIL_SOPHIE });
  simulation.session.id = ID_SOPHIE;
  chemin.valeur = ADRESSE_CATEGORIES;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const rendreSection = async () => {
  const element = await SectionAdministration();
  return element ? renderToStaticMarkup(element) : "";
};

const rendreContenu = async () => renderToStaticMarkup(await ContenuCategories());

/** Le bouton `data-slot` : sa balise ouvrante et son contenu. */
function bouton(html: string, slot: string): { balise: string; contenu: string } {
  const [, balise = "", contenu = ""] =
    html.match(new RegExp(`(<button [^>]*data-slot="${slot}"[^>]*>)([\\s\\S]*?)</button>`)) ?? [];
  return { balise, contenu };
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

describe("lien « Catégories » de la section Administration", () => {
  it("adresse de l'écran A2 : /admin/categories", () => {
    expect(ADRESSE_CATEGORIES).toBe("/admin/categories");
  });

  it("administrateur : « Catégories » (icône Tags) vers /admin/categories, après « Comptes »", async () => {
    const html = await rendreSection();
    expect(texteDe(html)).toBe("Administration Comptes Catégories");
    expect(html).toMatch(/<a[^>]*href="\/admin\/categories"[^>]*>(?:(?!<\/a>).)*lucide-tags(?:(?!<\/a>).)*Catégories<\/span><\/a>/);
    expect(html.indexOf('href="/admin/comptes"')).toBeLessThan(html.indexOf('href="/admin/categories"'));
  });

  it("sur /admin/categories : « Catégories » actif, « Comptes » inactif", async () => {
    const html = await rendreSection();
    const liens = [...html.matchAll(/<a [^>]*>/g)].map(([balise]) => balise);
    expect(liens.filter((balise) => balise.includes('aria-current="page"'))).toEqual([
      expect.stringContaining('href="/admin/categories"'),
    ]);
  });

  it("collaborateur : ni la section, ni « Catégories »", async () => {
    simulation.session.id = ID_KARIM;
    expect(await rendreSection()).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Page et contenu
// ---------------------------------------------------------------------------

describe("écran A2 « Catégories »", () => {
  it("titre, champ « Nouvelle catégorie » et « Ajouter » en haut, puis la liste", async () => {
    const html = await rendreContenu();
    expect(html).toMatch(/<h1[^>]*>Catégories<\/h1>/);
    expect(html).toMatch(new RegExp(`<label[^>]*for="${ID_NOUVELLE_CATEGORIE}"[^>]*>Nouvelle catégorie</label>`));
    const ajouter = bouton(html, "bouton-ajouter");
    expect(ajouter.balise).toContain('type="submit"');
    expect(texteDe(ajouter.contenu)).toBe("Ajouter");
    const ordre = ["<h1", 'data-slot="ajouter-categorie"', 'data-slot="tableau-categories"'].map((m) => html.indexOf(m));
    expect(ordre).toEqual([...ordre].sort((a, b) => a - b));
    expect(ordre[0]).toBeGreaterThan(-1);
  });

  it("vrai tableau Nom · État · Nombre de demandes · Actions", async () => {
    const html = await rendreContenu();
    expect(html).toMatch(/<caption class="sr-only">[^<]+<\/caption>/);
    const entetes = [...html.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(([, texte]) => texte);
    expect(entetes).toEqual(["Nom", "État", "Nombre de demandes", "Actions"]);
  });

  it("toutes les catégories, dans l'ordre du formulaire : nom en en-tête de ligne, « Active », nombre de demandes, « Renommer »", async () => {
    simulation.demandes.push(...fabriquerDemandes(6));
    const parCategorie = new Map<string, number>();
    for (const d of simulation.demandes) parCategorie.set(d.categorie, (parCategorie.get(d.categorie) ?? 0) + 1);

    const html = await rendreContenu();
    const lignes = [...html.matchAll(/<tr data-slot="ligne-categorie"[^>]*>([\s\S]*?)<\/tr>/g)].map(([, ligne]) => ligne);
    expect(lignes).toHaveLength(5);
    lignes.forEach((ligne, index) => {
      const { nom } = CATEGORIES_DEPART[index];
      expect(ligne).toMatch(/^<th scope="row"/);
      const nombre = parCategorie.get(nom) ?? 0;
      // Story 4.2 : « Désactiver », puis « Supprimer » seulement sans demande.
      const actions = nombre === 0 ? "Renommer Désactiver Supprimer" : "Renommer Désactiver";
      expect(texteDe(ligne).replace(/&#x27;|'/g, "'")).toBe(`${nom} Active ${nombre} ${actions}`);
      expect(ligne).toContain(`aria-label="Renommer la catégorie ${nom.replace(/'/g, "&#x27;")}"`);
    });
    // Au moins une ligne de chaque sorte dans cet essai.
    expect(new Set(CATEGORIES_DEPART.map((c) => (parCategorie.get(c.nom) ?? 0) === 0))).toEqual(new Set([true, false]));
    expect(texteDe(html)).not.toMatch(/Réactiver/);
  });

  it("catégorie désactivée (story 4.2) : badge gris *Désactivée*, écrit en toutes lettres", async () => {
    simulation.categories[1].active = false;
    const html = await rendreContenu();
    expect(html.match(/data-slot="badge-desactivee"/g)).toHaveLength(1);
    expect(renderToStaticMarkup(<BadgeDesactivee />)).toMatch(/bg-inactive-bg[^"]*text-inactive-fg[^>]*>Désactivée<\/span>$/);
  });

  it("lecture en panne : « Impossible de charger les catégories. » et « Réessayer » ; le champ d'ajout reste", async () => {
    simulation.pannesRpc.lister_categories_administration = { data: null, error: { code: "57P01", message: "x" } };
    const html = await rendreContenu();
    expect(html).toContain('data-slot="categories-erreur"');
    expect(texteDe(html)).toContain("Impossible de charger les catégories. Réessayer");
    expect(html).toContain('data-slot="ajouter-categorie"');
    expect(html).not.toContain("tableau-categories");
    expect(renderToStaticMarkup(<EtatCategoriesErreur />)).toMatch(/role="alert"/);
  });

  it("collaborateur : écran S1 seul, aucune lecture", async () => {
    simulation.session.id = ID_KARIM;
    expect(texteDe(await rendreContenu())).toBe(`${S1} Retour aux demandes`);
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("refus de la base (rôle retiré entre-temps) : S1", async () => {
    simulation.pannesRpc.lister_categories_administration = { data: null, error: { code: "NV202", message: "x" } };
    expect(texteDe(await rendreContenu())).toBe(`${S1} Retour aux demandes`);
  });

  it("squelette : titre, champ et lignes en gris, après 300 ms, annoncé « Chargement… »", () => {
    const html = renderToStaticMarkup(<SqueletteCategories />);
    expect(html).toMatch(/^<div data-slot="squelette" role="status" class="animate-apres-300ms /);
    expect(html).toContain('<span class="sr-only">Chargement…</span>');
    expect(html.match(/data-slot="ligne-squelette"/g)).toHaveLength(LIGNES_SQUELETTE_CATEGORIES);
  });

  it("page : titre de l'onglet neutre, contenu sous <Suspense> avec le squelette, coque sans titre ni donnée", () => {
    expect(metadata.title).toBe("Administration — Nova Services");
    const source = readFileSync(join(process.cwd(), "src/app/(interne)/admin/categories/page.tsx"), "utf8");
    expect(source).toMatch(/<Suspense fallback=\{<SqueletteCategories \/>\}>\s*<ContenuCategories \/>\s*<\/Suspense>/);
    const html = renderToStaticMarkup(<PageCategories />);
    expect(html).toContain('data-slot="squelette"');
    expect(html).not.toMatch(/<h1/);
  });

  it("contenu : attend une vraie requête (connection) puis vérifie le rôle avant toute lecture", () => {
    const source = readFileSync(join(process.cwd(), "src/app/(interne)/admin/categories/contenu-categories.tsx"), "utf8");
    expect(source).toMatch(
      /await connection\(\);\s*if \(!\(await exigerAdministrateur\(\)\)\) return <EcranAccesRefuse \/>;\s*const lecture = await lireCategoriesAdministration\(\);/,
    );
  });
});

// ---------------------------------------------------------------------------
// Ajout
// ---------------------------------------------------------------------------

const rendreAjout = (etat: Partial<EtatAjout> = {}, envoiEnCours = false) =>
  renderToStaticMarkup(<VueAjouterCategorie etat={{ ...ETAT_AJOUT_INITIAL, ...etat }} envoiEnCours={envoiEnCours} />);

const champ = (html: string, id: string) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";

const appliquerAjout = (actions: ActionAjout[], depart: EtatAjout = ETAT_AJOUT_INITIAL) =>
  actions.reduce(reduireAjout, depart);

describe("« Nouvelle catégorie » et « Ajouter »", () => {
  it("champ vide, « Ajouter » actif (jamais grisé d'avance), formulaire sans validation du navigateur", () => {
    const html = rendreAjout();
    expect(html).toMatch(/^<form noValidate=""[^>]*data-slot="ajouter-categorie"/);
    expect(champ(html, ID_NOUVELLE_CATEGORIE)).toContain('value=""');
    expect(bouton(html, "bouton-ajouter").balise).not.toContain('disabled=""');
    expect(html).toContain("lucide-plus");
  });

  it("erreur : message sous le champ, relié au champ, saisie gardée", () => {
    const html = rendreAjout({ nom: "Autre", erreur: DEJA_PRIS });
    const input = champ(html, ID_NOUVELLE_CATEGORIE);
    expect(input).toContain('aria-invalid="true"');
    expect(input).toContain(`aria-describedby="${ID_NOUVELLE_CATEGORIE}-erreur"`);
    expect(input).toContain('value="Autre"');
    expect(html).toMatch(new RegExp(`<p id="${ID_NOUVELLE_CATEGORIE}-erreur" data-slot="erreur-champ"[^>]*>.*${DEJA_PRIS}</p>`));
  });

  it("pendant l'envoi : indicateur sur « Ajouter », bouton inactif, saisie figée", () => {
    const html = rendreAjout({ nom: "Facturation" }, true);
    const ajouter = bouton(html, "bouton-ajouter");
    expect(ajouter.balise).toMatch(/disabled="" aria-busy="true"/);
    expect(ajouter.contenu).toContain("lucide-loader-circle");
    expect(texteDe(ajouter.contenu)).toBe("Ajouter");
    expect(champ(html, ID_NOUVELLE_CATEGORIE)).toContain('readOnly=""');
    expect(html).toMatch(/<form[^>]*aria-busy="true"/);
  });

  it("réducteur : saisie, refus, correction, réussite (champ vidé)", () => {
    let etat = appliquerAjout([{ type: "saisie", valeur: " " }, { type: "refus", message: OBLIGATOIRE }]);
    expect(etat).toMatchObject({ nom: " ", erreur: OBLIGATOIRE, appelsChamp: 1 });
    etat = reduireAjout(etat, { type: "saisie", valeur: "x".repeat(51) });
    expect(etat.erreur).toBe(TROP_LONG);
    etat = reduireAjout(etat, { type: "saisie", valeur: "Facturation" });
    expect(etat.erreur).toBeNull();
    etat = appliquerAjout([{ type: "envoi" }, { type: "reussite" }], etat);
    expect(etat).toEqual({ nom: "", erreur: null, appelsChamp: 1 });
  });

  it("réducteur : sans message affiché, la saisie n'en fait pas apparaître", () => {
    expect(reduireAjout(ETAT_AJOUT_INITIAL, { type: "saisie", valeur: "" }).erreur).toBeNull();
  });

  it("réducteur : doublon puis champ vidé : le message disparaît, sans « obligatoire » avant le prochain envoi", () => {
    let etat = appliquerAjout([{ type: "saisie", valeur: "facturation" }, { type: "refus", message: DEJA_PRIS }]);
    expect(etat.erreur).toBe(DEJA_PRIS);
    etat = reduireAjout(etat, { type: "saisie", valeur: "" });
    expect(etat).toMatchObject({ nom: "", erreur: null });
    // L'obligation revient à l'envoi.
    expect(preparerEnvoiAjout(etat.nom, { current: false })).toEqual({ type: "refus", message: OBLIGATOIRE });
  });

  it("réducteur : un nom encore trop long garde son message pendant la frappe", () => {
    const etat = appliquerAjout([{ type: "saisie", valeur: "x".repeat(60) }, { type: "refus", message: TROP_LONG }]);
    expect(reduireAjout(etat, { type: "saisie", valeur: "x".repeat(55) }).erreur).toBe(TROP_LONG);
  });

  it("nom vide, que des espaces ou trop long : message, rien n'est envoyé, verrou ouvert", () => {
    const verrou = { current: false };
    expect(preparerEnvoiAjout("", verrou)).toEqual({ type: "refus", message: OBLIGATOIRE });
    expect(preparerEnvoiAjout("   ", verrou)).toEqual({ type: "refus", message: OBLIGATOIRE });
    expect(preparerEnvoiAjout("x".repeat(51), verrou)).toEqual({ type: "refus", message: TROP_LONG });
    expect(verrou.current).toBe(false);
    expect(preparerEnvoiAjout("x".repeat(50), verrou)).toEqual({ type: "envoi" });
    expect(verrou.current).toBe(true);
  });

  it("réponses : réussite, nom refusé, déjà pris, accès refusé, panne et tout le reste", () => {
    expect(actionApresReponseAjout(succes({ id: AUTRE.id, nom: "Facturation" }))).toEqual({ type: "reussite" });
    expect(actionApresReponseAjout(echec("VALIDATION", "1 champ", { champs: { nom: TROP_LONG } }))).toEqual({
      type: "refus",
      message: TROP_LONG,
    });
    expect(actionApresReponseAjout(echec("CONFLIT", DEJA_PRIS, { champs: { nom: DEJA_PRIS } }))).toEqual({
      type: "refus",
      message: DEJA_PRIS,
    });
    expect(actionApresReponseAjout(echec("ACCES_REFUSE", "Accès refusé."))).toEqual({ type: "refus", message: "Accès refusé." });
    for (const code of ["ERREUR_INTERNE", "VALIDATION", "INTROUVABLE"] as const) {
      expect(actionApresReponseAjout(echec(code, "message technique"))).toEqual({ type: "refus", message: PANNE });
    }
  });

  it("double clic : un seul envoi", async () => {
    const verrou = { current: false };
    const ajouter = vi.fn(async () => succes({ id: AUTRE.id, nom: "Facturation" }));
    const cliquer = () => {
      const debut = preparerEnvoiAjout("Facturation", verrou);
      if (debut.type === "envoi") {
        void envoyerAjout({ nom: "Facturation", ajouter, agir: () => {}, apresReussite: () => {}, envoiVerrouille: verrou });
      }
      return debut;
    };
    expect(cliquer()).toEqual({ type: "envoi" });
    expect(cliquer()).toEqual({ type: "ignore" });
    await vi.waitFor(() => expect(verrou.current).toBe(false));
    expect(ajouter).toHaveBeenCalledExactlyOnceWith({ nom: "Facturation" });
  });

  it("réussite : champ vidé, toast avec le nom enregistré (texte de l'UX), verrou rouvert", async () => {
    const verrou = { current: true };
    const agir = vi.fn();
    const apresReussite = vi.fn();
    await envoyerAjout({
      nom: " Facturation ",
      ajouter: async () => succes({ id: AUTRE.id, nom: "Facturation" }),
      agir,
      apresReussite,
      envoiVerrouille: verrou,
    });
    expect(agir).toHaveBeenCalledExactlyOnceWith({ type: "reussite" });
    expect(apresReussite).toHaveBeenCalledExactlyOnceWith({ id: AUTRE.id, nom: "Facturation" });
    expect(verrou.current).toBe(false);
    expect(MESSAGES_CATEGORIES.ajoutee("Facturation")).toBe(
      "Catégorie Facturation ajoutée. Elle est déjà proposée dans le formulaire.",
    );
    const source = readFileSync(join(process.cwd(), "src/components/interne/ajouter-categorie.tsx"), "utf8");
    expect(source).toContain("apresReussite: (categorie) => afficherSucces(MESSAGES_CATEGORIES.ajoutee(categorie.nom))");
  });

  it("nom déjà pris : message sous le champ, saisie gardée, pas de toast", async () => {
    const agir = vi.fn();
    const apresReussite = vi.fn();
    await envoyerAjout({
      nom: "facturation",
      ajouter: async () => echec("CONFLIT", DEJA_PRIS, { champs: { nom: DEJA_PRIS } }),
      agir,
      apresReussite,
      envoiVerrouille: { current: true },
    });
    expect(agir).toHaveBeenCalledExactlyOnceWith({ type: "refus", message: DEJA_PRIS });
    expect(apresReussite).not.toHaveBeenCalled();
    const etat = appliquerAjout([{ type: "saisie", valeur: "facturation" }, { type: "envoi" }, agir.mock.calls[0][0]]);
    expect(etat).toMatchObject({ nom: "facturation", erreur: DEJA_PRIS });
  });

  it("réseau coupé : panne sous le champ, verrou rouvert", async () => {
    const verrou = { current: true };
    const agir = vi.fn();
    await envoyerAjout({
      nom: "Facturation",
      ajouter: async () => {
        throw new TypeError("fetch failed");
      },
      agir,
      apresReussite: () => {},
      envoiVerrouille: verrou,
    });
    expect(agir).toHaveBeenCalledExactlyOnceWith({ type: "refus", message: PANNE });
    expect(verrou.current).toBe(false);
  });

  it("redirection du serveur (session terminée) : relancée, verrou rouvert", async () => {
    const verrou = { current: true };
    const agir = vi.fn();
    const redirection = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/connexion;307;" });
    await expect(
      envoyerAjout({
        nom: "Facturation",
        ajouter: async () => {
          throw redirection;
        },
        agir,
        apresReussite: () => {},
        envoiVerrouille: verrou,
      }),
    ).rejects.toBe(redirection);
    expect(agir).not.toHaveBeenCalled();
    expect(verrou.current).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Renommage
// ---------------------------------------------------------------------------

const enEdition = (etat: Partial<EtatRenommage> = {}): EtatRenommage => ({
  ...ETAT_RENOMMAGE_INITIAL,
  edition: true,
  valeur: AUTRE.nom,
  ...etat,
});

const rendreLigne = (etat: EtatRenommage = ETAT_RENOMMAGE_INITIAL, envoiEnCours = false) =>
  renderToStaticMarkup(
    <table>
      <tbody>
        <VueLigneCategorie categorie={AUTRE} etatCategorie="Active" etat={etat} envoiEnCours={envoiEnCours} />
      </tbody>
    </table>,
  );

const appliquerRenommage = (actions: ActionRenommage[], depart: EtatRenommage = ETAT_RENOMMAGE_INITIAL) =>
  actions.reduce(reduireRenommage, depart);

describe("« Renommer »", () => {
  it("en lecture : le nom, « Active », le nombre, « Renommer » (secondaire, nom accessible)", () => {
    const html = rendreLigne();
    expect(texteDe(html)).toBe("Autre Active 3 Renommer");
    const renommer = bouton(html, "renommer-categorie");
    expect(renommer.balise).toContain('type="button"');
    expect(renommer.balise).toContain('aria-label="Renommer la catégorie Autre"');
    expect(renommer.balise).toContain('data-variant="secondaire"');
    expect(renommer.contenu).toContain("lucide-pencil");
    expect(html).not.toContain("<input");
  });

  it("en édition : le nom devient un champ prérempli ; « Enregistrer » (rattaché au formulaire de la ligne) et « Annuler »", () => {
    const html = rendreLigne(enEdition());
    const input = champ(html, idChampRenommage(AUTRE.id));
    expect(input).toContain('value="Autre"');
    expect(input).toContain('aria-label="Nouveau nom de la catégorie Autre"');
    expect(input).not.toContain('aria-invalid="true"');
    expect(html).toMatch(new RegExp(`<form id="${idFormulaireRenommage(AUTRE.id)}" noValidate=""`));
    const enregistrer = bouton(html, "enregistrer-renommage");
    expect(enregistrer.balise).toContain('type="submit"');
    expect(enregistrer.balise).toContain(`form="${idFormulaireRenommage(AUTRE.id)}"`);
    expect(enregistrer.contenu).toBe("Enregistrer");
    expect(enregistrer.balise).toContain('aria-label="Enregistrer le nom de la catégorie Autre"');
    const annuler = bouton(html, "annuler-renommage");
    expect(annuler.balise).toContain('type="button"');
    expect(annuler.contenu).toBe("Annuler");
    expect(annuler.balise).toContain('aria-label="Annuler le renommage de la catégorie Autre"');
    expect(html).not.toContain('data-slot="renommer-categorie"');
  });

  it("erreur : message sous le champ de la ligne, relié au champ", () => {
    const html = rendreLigne(enEdition({ valeur: "Problème technique", erreur: DEJA_PRIS }));
    const id = idChampRenommage(AUTRE.id);
    const input = champ(html, id);
    expect(input).toContain('aria-invalid="true"');
    expect(input).toContain(`aria-describedby="${id}-erreur"`);
    expect(input).toContain('value="Problème technique"');
    expect(html).toMatch(new RegExp(`<p id="${id}-erreur" data-slot="erreur-champ"[^>]*>.*${DEJA_PRIS}</p>`));
  });

  it("pendant l'envoi : indicateur sur « Enregistrer », boutons inactifs, saisie figée", () => {
    const html = rendreLigne(enEdition({ valeur: "Divers" }), true);
    const enregistrer = bouton(html, "enregistrer-renommage");
    expect(enregistrer.balise).toMatch(/disabled="" aria-busy="true"/);
    expect(enregistrer.contenu).toContain("lucide-loader-circle");
    expect(texteDe(enregistrer.contenu)).toBe("Enregistrer");
    expect(bouton(html, "annuler-renommage").balise).toContain('disabled=""');
    expect(champ(html, idChampRenommage(AUTRE.id))).toContain('readOnly=""');
  });

  it("Échap dans le champ : annule (le code)", () => {
    const source = readFileSync(join(process.cwd(), "src/components/interne/renommer-categorie.tsx"), "utf8");
    expect(source).toMatch(/if \(evenement\.key !== "Escape"\) return;\s*evenement\.preventDefault\(\);\s*onAnnuler\?\.\(\);/);
    expect(source).toContain("onKeyDown={touche}");
  });

  it("« Renommer » et « Enregistrer » ont des clés distinctes (le code)", () => {
    // Sans elles, React réutilise le bouton « Renommer » pour « Enregistrer »
    // pendant le clic : le navigateur termine le clic sur un bouton devenu
    // `submit`, le nom inchangé est envoyé et la ligne se referme aussitôt
    // (défaut vu à l'écran par Aurel le 26 nov. 2026).
    const source = readFileSync(join(process.cwd(), "src/components/interne/renommer-categorie.tsx"), "utf8");
    expect(source).toMatch(/<Button\s+key="enregistrer"\s+type="submit"/);
    expect(source).toMatch(/<Button\s+key="annuler"/);
    expect(source).toMatch(/<Button\s+key="renommer"/);
  });

  it("réducteur : début (nom d'origine), saisie, annulation (nom d'origine revenu, rien gardé)", () => {
    let etat = appliquerRenommage([{ type: "debut", nom: "Autre" }]);
    expect(etat).toMatchObject({ edition: true, valeur: "Autre", erreur: null, appelsChamp: 1 });
    etat = appliquerRenommage([{ type: "saisie", valeur: "Divers" }, { type: "annulation" }], etat);
    expect(etat).toMatchObject({ edition: false, valeur: "", erreur: null, appelsBouton: 1 });
    expect(reduireRenommage(etat, { type: "debut", nom: "Autre" }).valeur).toBe("Autre");
  });

  it("réducteur : refus, correction, réussite (retour en lecture)", () => {
    let etat = appliquerRenommage([{ type: "debut", nom: "Autre" }, { type: "saisie", valeur: "" }, { type: "refus", message: OBLIGATOIRE }]);
    expect(etat).toMatchObject({ edition: true, erreur: OBLIGATOIRE, appelsChamp: 2 });
    etat = reduireRenommage(etat, { type: "saisie", valeur: "Divers" });
    expect(etat.erreur).toBeNull();
    etat = appliquerRenommage([{ type: "envoi" }, { type: "reussite", change: true }], etat);
    expect(etat).toMatchObject({ edition: false, erreur: null, appelsBouton: 1 });
  });

  it("réducteur : doublon puis champ vidé sur la ligne : le message disparaît, la ligne reste en édition", () => {
    let etat = appliquerRenommage([{ type: "debut", nom: "Autre" }, { type: "refus", message: DEJA_PRIS }]);
    etat = reduireRenommage(etat, { type: "saisie", valeur: "" });
    expect(etat).toMatchObject({ edition: true, valeur: "", erreur: null });
  });

  it("préparation : nom vide ou trop long refusé ; même nom (espaces de bord retirés) : rien n'est envoyé ; sinon envoi", () => {
    const verrou = { current: false };
    expect(preparerEnvoiRenommage("  ", "Autre", verrou)).toEqual({ type: "refus", message: OBLIGATOIRE });
    expect(preparerEnvoiRenommage("x".repeat(51), "Autre", verrou)).toEqual({ type: "refus", message: TROP_LONG });
    expect(preparerEnvoiRenommage(" Autre ", "Autre", verrou)).toEqual({ type: "inchange" });
    expect(verrou.current).toBe(false);
    expect(preparerEnvoiRenommage("Divers", "Autre", verrou)).toEqual({ type: "envoi" });
    expect(verrou.current).toBe(true);
    expect(preparerEnvoiRenommage("Divers", "Autre", verrou)).toEqual({ type: "ignore" });
  });

  it("même nom : la ligne repasse en lecture sans envoi ni toast (le code)", () => {
    const source = readFileSync(join(process.cwd(), "src/components/interne/renommer-categorie.tsx"), "utf8");
    expect(source).toMatch(/if \(debut\.type === "inchange"\) \{\s*agir\(\{ type: "reussite", change: false \}\);\s*return;/);
  });

  it("réponses : réussite (avec ou sans changement), nom refusé, déjà pris, accès refusé, introuvable et panne", () => {
    expect(actionApresReponseRenommage(succes({ id: AUTRE.id, nom: "Divers", change: true }))).toEqual({
      type: "reussite",
      change: true,
    });
    expect(actionApresReponseRenommage(succes({ id: AUTRE.id, nom: "Autre", change: false }))).toEqual({
      type: "reussite",
      change: false,
    });
    expect(actionApresReponseRenommage(echec("VALIDATION", "1 champ", { champs: { nom: TROP_LONG } }))).toEqual({
      type: "refus",
      message: TROP_LONG,
    });
    expect(actionApresReponseRenommage(echec("CONFLIT", DEJA_PRIS))).toEqual({ type: "refus", message: DEJA_PRIS });
    expect(actionApresReponseRenommage(echec("ACCES_REFUSE", "Accès refusé."))).toEqual({
      type: "refus",
      message: "Accès refusé.",
    });
    for (const code of ["INTROUVABLE", "ERREUR_INTERNE", "VALIDATION"] as const) {
      expect(actionApresReponseRenommage(echec(code, "message technique"))).toEqual({ type: "refus", message: PANNE });
    }
  });

  it("double clic : un seul envoi", async () => {
    const verrou = { current: false };
    const renommer = vi.fn(async () => succes({ id: AUTRE.id, nom: "Divers", change: true }));
    const cliquer = () => {
      const debut = preparerEnvoiRenommage("Divers", "Autre", verrou);
      if (debut.type === "envoi") {
        void envoyerRenommage({
          categorieId: AUTRE.id,
          nom: "Divers",
          renommer,
          agir: () => {},
          apresRenommage: () => {},
          envoiVerrouille: verrou,
        });
      }
      return debut;
    };
    expect(cliquer()).toEqual({ type: "envoi" });
    expect(cliquer()).toEqual({ type: "ignore" });
    await vi.waitFor(() => expect(verrou.current).toBe(false));
    expect(renommer).toHaveBeenCalledExactlyOnceWith({ categorieId: AUTRE.id, nom: "Divers" });
  });

  it("renommée : retour en lecture, toast « Catégorie renommée » ; sans changement : pas de toast", async () => {
    const agir = vi.fn();
    const apresRenommage = vi.fn();
    const verrou = { current: true };
    await envoyerRenommage({
      categorieId: AUTRE.id,
      nom: "Divers",
      renommer: async () => succes({ id: AUTRE.id, nom: "Divers", change: true }),
      agir,
      apresRenommage,
      envoiVerrouille: verrou,
    });
    expect(agir).toHaveBeenCalledExactlyOnceWith({ type: "reussite", change: true });
    expect(apresRenommage).toHaveBeenCalledTimes(1);
    expect(verrou.current).toBe(false);
    expect(MESSAGES_CATEGORIES.renommee).toBe("Catégorie renommée");

    apresRenommage.mockClear();
    await envoyerRenommage({
      categorieId: AUTRE.id,
      nom: "Autre",
      renommer: async () => succes({ id: AUTRE.id, nom: "Autre", change: false }),
      agir: () => {},
      apresRenommage,
      envoiVerrouille: { current: true },
    });
    expect(apresRenommage).not.toHaveBeenCalled();
  });

  it("nom déjà pris : message sous le champ de la ligne, saisie gardée, toujours en édition", async () => {
    const agir = vi.fn();
    await envoyerRenommage({
      categorieId: AUTRE.id,
      nom: "Problème technique",
      renommer: async () => echec("CONFLIT", DEJA_PRIS, { champs: { nom: DEJA_PRIS } }),
      agir,
      apresRenommage: () => {},
      envoiVerrouille: { current: true },
    });
    const etat = appliquerRenommage([
      { type: "debut", nom: "Autre" },
      { type: "saisie", valeur: "Problème technique" },
      { type: "envoi" },
      agir.mock.calls[0][0],
    ]);
    expect(etat).toMatchObject({ edition: true, valeur: "Problème technique", erreur: DEJA_PRIS });
  });

  it("réseau coupé : panne sous le champ, verrou rouvert ; redirection : relancée", async () => {
    const verrou = { current: true };
    const agir = vi.fn();
    await envoyerRenommage({
      categorieId: AUTRE.id,
      nom: "Divers",
      renommer: async () => {
        throw new TypeError("fetch failed");
      },
      agir,
      apresRenommage: () => {},
      envoiVerrouille: verrou,
    });
    expect(agir).toHaveBeenCalledExactlyOnceWith({ type: "refus", message: PANNE });
    expect(verrou.current).toBe(false);

    const redirection = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/connexion;307;" });
    verrou.current = true;
    await expect(
      envoyerRenommage({
        categorieId: AUTRE.id,
        nom: "Divers",
        renommer: async () => {
          throw redirection;
        },
        agir,
        apresRenommage: () => {},
        envoiVerrouille: verrou,
      }),
    ).rejects.toBe(redirection);
    expect(verrou.current).toBe(false);
  });
});

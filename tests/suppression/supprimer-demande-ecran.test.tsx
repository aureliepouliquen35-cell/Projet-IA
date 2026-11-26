import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { compile } from "@tailwindcss/node";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Zone administrateur de l'écran I4 (story 4.4 ; EXPERIENCE.md, I4, Flux 5,
// Fenêtre de confirmation, Toast ; DESIGN.md ; FR-28, RM-7), rendue en HTML
// avec Supabase simulé : zone visible pour un administrateur seulement,
// bouton « Supprimer la demande… », fenêtre de confirmation, variante
// `danger`, indicateur pendant l'envoi, suite donnée à chaque réponse,
// verrou du double clic, retour à la liste.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, replace: () => {} }),
}));
// La fenêtre s'ouvre dans un portail, que le rendu serveur n'affiche pas :
// ici, elle s'affiche à sa place.
vi.mock("radix-ui", async (original) => {
  const radix = await original<typeof import("radix-ui")>();
  return {
    ...radix,
    AlertDialog: { ...radix.AlertDialog, Portal: ({ children }: { children: React.ReactNode }) => children },
  };
});

import { redirect } from "next/navigation";

import { ContenuDemande } from "@/app/(interne)/demandes/[reference]/contenu-demande";
import {
  appliquerSuiteSuppression,
  changerOuvertureSuppression,
  dependancesSuiteSuppression,
  envoyerSuppression,
  suiteApresSuppression,
  SupprimerDemande,
  VueSupprimerDemande,
  type SuiteSuppression,
} from "@/components/interne/supprimer-demande";
import { echec, succes } from "@/shared/reponse";

import { texteDe } from "../aides/formulaire-depot";
import { fabriquerDemandes, ID_KARIM, ID_SOPHIE, PROFIL_SOPHIE, type DemandeSimulee } from "../aides/supabase-connexion";

const REFERENCE = "NOVA-2026-0042";
const CLAIRE: DemandeSimulee = {
  ...fabriquerDemandes(42)[0],
  nom: "Claire Martin",
  email: "claire.martin@cabinet-martin.fr",
  objet: "Accès impossible à l'outil de facturation",
  statut: "nouvelle",
};
const TITRE = "Supprimer définitivement la demande NOVA-2026-0042 ?";
const TEXTE = "La demande et tout son historique seront effacés. Cette action est irréversible.";
const ECHEC = "La demande n'a pas pu être supprimée. Réessayez.";

const vue = (options: Partial<Parameters<typeof VueSupprimerDemande>[0]> = {}) =>
  renderToStaticMarkup(<VueSupprimerDemande reference={REFERENCE} {...options} />);

/** La fenêtre de confirmation, seule. */
const fenetre = (html: string) => html.match(/<div[^>]*role="alertdialog"[\s\S]*<\/div><\/div>/)?.[0] ?? "";

/** Les boutons : libellé, variante, désactivé, attributs. */
function boutons(html: string) {
  return [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(([, attributs, contenu]) => ({
    libelle: texteDe(contenu),
    variante: attributs.match(/data-variant="(\w+)"/)?.[1],
    desactive: /\sdisabled=""/.test(attributs),
    attributs,
    contenu,
  }));
}

/** HTML de `/demandes/NOVA-2026-0042?…` pour la personne connectée. */
async function ecran(parametres: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(
    await ContenuDemande({ params: Promise.resolve({ reference: REFERENCE }), searchParams: Promise.resolve(parametres) }),
  );
}

/** Le panneau d'actions (aside). */
const panneau = (html: string) => html.match(/<aside[^>]*data-slot="panneau-statut"[\s\S]*?<\/aside>/)?.[0] ?? "";

beforeEach(() => {
  simulation.reinitialiser();
  simulation.profils.set(ID_SOPHIE, { ...PROFIL_SOPHIE });
  simulation.session.id = ID_SOPHIE;
  simulation.demandes.push({ ...CLAIRE }, ...fabriquerDemandes(41));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("écran I4 : zone administrateur (RM-7)", () => {
  it("administrateur : en bas du panneau d'actions, séparée par un trait, « Supprimer la demande… »", async () => {
    const html = panneau(await ecran());
    expect(html).toMatch(/data-slot="zone-administrateur" class="[^"]*border-t[^"]*"/);
    expect(html.indexOf('data-slot="zone-administrateur"')).toBeGreaterThan(html.indexOf('data-slot="actions-statut"'));
    // Dernier élément du panneau.
    expect(html).toMatch(/data-slot="zone-administrateur"[\s\S]*<\/button><\/div><\/aside>$/);
    expect(texteDe(html)).toMatch(/Supprimer la demande…$/);
  });

  it("collaborateur : ni zone administrateur, ni bouton, ni texte de suppression", async () => {
    simulation.session.id = ID_KARIM;
    const html = await ecran();
    expect(html).not.toContain("zone-administrateur");
    expect(html).not.toContain("supprimer-demande");
    expect(texteDe(html)).not.toMatch(/Supprimer/);
  });

  it("administrateur rétrogradé : la page recalculée n'a plus la zone", async () => {
    expect(await ecran()).toContain("zone-administrateur");
    simulation.profils.get(ID_SOPHIE)!.role = "collaborateur";
    expect(await ecran()).not.toContain("zone-administrateur");
  });

  it("zone nommée pour les lecteurs d'écran", () => {
    expect(vue()).toMatch(/^<div role="group" aria-label="Administration de la demande" data-slot="zone-administrateur"/);
  });
});

describe("bouton « Supprimer la demande… »", () => {
  it("lien rouge en semi-gras, sans fond, avec la corbeille ; il ouvre une fenêtre", () => {
    const [bouton] = boutons(vue());
    expect(bouton.libelle).toBe("Supprimer la demande…");
    expect(bouton.attributs).toContain('type="button"');
    expect(bouton.attributs).toContain('aria-haspopup="dialog"');
    expect(bouton.attributs).toMatch(/class="[^"]*\btext-danger\b[^"]*"/);
    expect(bouton.attributs).toMatch(/class="[^"]*\bfont-semibold\b[^"]*"/);
    expect(bouton.attributs).not.toMatch(/\bbg-|data-variant/);
    expect(bouton.contenu).toMatch(/^<svg[^>]*lucide-trash2?[^>]*aria-hidden="true"/);
  });

  it("44 px de haut au moins (cible tactile)", () => {
    expect(boutons(vue())[0].attributs).toMatch(/class="[^"]*\bmin-h-11\b/);
  });

  it("fenêtre fermée : rien d'autre n'est affiché", () => {
    expect(vue()).not.toContain("alertdialog");
  });
});

describe("fenêtre de confirmation (EXPERIENCE.md, Flux 5)", () => {
  const html = () => vue({ fenetreOuverte: true });

  it("pastille, titre avec la référence en chasse fixe, texte, « Annuler » puis « Supprimer définitivement »", () => {
    expect(texteDe(fenetre(html()))).toBe(`${TITRE} ${TEXTE} Annuler Supprimer définitivement`);
    expect(fenetre(html())).toContain('<span class="font-mono">NOVA-2026-0042</span>');
    expect(fenetre(html())).toMatch(/data-slot="fenetre-supprimer"/);
  });

  it("pastille rouge clair avec la corbeille, avant le titre", () => {
    const f = fenetre(html());
    expect(f).toMatch(/data-slot="pastille-supprimer" class="[^"]*rounded-full[^"]*bg-danger-soft[^"]*text-danger/);
    expect(f.indexOf("pastille-supprimer")).toBeLessThan(f.indexOf("alert-dialog-title"));
    expect(f).toMatch(/pastille-supprimer[^>]*><svg[^>]*lucide-trash/);
  });

  it("« Annuler » secondaire, « Supprimer définitivement » danger (seul bouton danger), alignés à droite", () => {
    const tous = boutons(html());
    const [annuler, confirmer] = boutons(fenetre(html()));
    expect([annuler.libelle, annuler.variante]).toEqual(["Annuler", "secondaire"]);
    expect([confirmer.libelle, confirmer.variante]).toEqual(["Supprimer définitivement", "danger"]);
    expect(tous.filter((b) => b.variante === "danger")).toHaveLength(1);
    expect(fenetre(html())).toMatch(/data-slot="alert-dialog-footer" class="[^"]*sm:justify-end/);
  });

  it("440 px de large au plus", () => {
    expect(fenetre(html())).toMatch(/class="[^"]*max-w-\[440px\]/);
  });

  it("fenêtre d'alerte, titre et texte identifiés (lecteurs d'écran)", () => {
    expect(fenetre(html())).toMatch(/^<div role="alertdialog"/);
    expect(fenetre(html())).toMatch(/<h2 id="[^"]+" data-slot="alert-dialog-title"/);
    expect(fenetre(html())).toMatch(/<p id="[^"]+" data-slot="alert-dialog-description"/);
  });

  it("sélection sur « Annuler » et Échap qui ferme : comportement de Radix, non modifié", () => {
    const source = readFileSync(join(process.cwd(), "src/components/interne/supprimer-demande.tsx"), "utf8");
    expect(source).not.toMatch(/onOpenAutoFocus|onEscapeKeyDown|autoFocus/);
  });

  it("pendant l'envoi : indicateur, deux boutons désactivés, fenêtre occupée", () => {
    const f = fenetre(vue({ fenetreOuverte: true, envoiEnCours: true }));
    const [annuler, confirmer] = boutons(f);
    expect(annuler.desactive).toBe(true);
    expect(confirmer.desactive).toBe(true);
    expect(confirmer.contenu).toContain("animate-spin");
    expect(confirmer.libelle).toBe("Supprimer définitivement");
    expect(f).toMatch(/aria-busy="true"/);
  });

  it("au repos : rien de désactivé, pas d'indicateur", () => {
    const [annuler, confirmer] = boutons(fenetre(html()));
    expect(annuler.desactive || confirmer.desactive).toBe(false);
    expect(fenetre(html())).not.toContain("animate-spin");
  });

  it("le composant avec état s'affiche comme l'écran au repos", () => {
    expect(renderToStaticMarkup(<SupprimerDemande reference={REFERENCE} retour="/demandes" />)).toBe(vue());
  });
});

describe("suite donnée à chaque réponse (suiteApresSuppression)", () => {
  it.each<[string, Parameters<typeof suiteApresSuppression>[0], SuiteSuppression]>([
    ["réussite", succes({ reference: REFERENCE }), { type: "succes", message: "Demande NOVA-2026-0042 supprimée" }],
    ["introuvable (S2 au recalcul)", echec("INTROUVABLE", "…"), { type: "rien" }],
    ["accès refusé", echec("ACCES_REFUSE", "…"), { type: "erreur", message: "Accès refusé." }],
    ["validation", echec("VALIDATION", "…"), { type: "erreur", message: ECHEC }],
    ["panne", echec("ERREUR_INTERNE", "Une erreur inattendue s'est produite."), { type: "erreur", message: ECHEC }],
    ["aucune réponse (le serveur a changé de page)", undefined, { type: "rien" }],
  ])("%s", (_, reponse, suite) => {
    expect(suiteApresSuppression(reponse)).toEqual(suite);
  });
});

describe("envoi (envoyerSuppression) : verrou, réseau coupé, redirection", () => {
  function envoyer(supprimer: Parameters<typeof envoyerSuppression>[0]["supprimer"], verrou = { current: false }) {
    const suites: SuiteSuppression[] = [];
    const promesse = envoyerSuppression({ reference: REFERENCE, supprimer, envoiVerrouille: verrou, apresReponse: (s) => suites.push(s) });
    return { promesse, suites, verrou };
  }

  it("la Server Function reçoit la référence ; verrou fermé pendant l'envoi", async () => {
    const supprimer = vi.fn(async () => succes({ reference: REFERENCE }));
    const { promesse, verrou } = envoyer(supprimer);
    expect(verrou.current).toBe(true);
    await promesse;
    expect(supprimer).toHaveBeenCalledWith({ reference: REFERENCE });
  });

  it("réussite : suite de succès ; le verrou reste fermé (la page va changer)", async () => {
    const { promesse, suites, verrou } = envoyer(async () => succes({ reference: REFERENCE }));
    await promesse;
    expect(suites).toEqual([{ type: "succes", message: "Demande NOVA-2026-0042 supprimée" }]);
    expect(verrou.current).toBe(true);
  });

  it.each([
    ["panne", echec("ERREUR_INTERNE", "…")],
    ["introuvable", echec("INTROUVABLE", "…")],
    ["accès refusé", echec("ACCES_REFUSE", "…")],
  ])("%s : verrou rouvert", async (_, reponse) => {
    const { promesse, verrou } = envoyer(async () => reponse);
    await promesse;
    expect(verrou.current).toBe(false);
  });

  it("réseau coupé : même suite qu'une panne, verrou rouvert", async () => {
    const { promesse, suites, verrou } = envoyer(async () => {
      throw new TypeError("fetch failed");
    });
    await promesse;
    expect(suites).toEqual([{ type: "erreur", message: ECHEC }]);
    expect(verrou.current).toBe(false);
  });

  it("double clic : la Server Function n'est appelée qu'une fois", async () => {
    let terminer: (valeur: ReturnType<typeof succes<{ reference: string }>>) => void = () => {};
    const supprimer = vi.fn(() => new Promise<ReturnType<typeof succes<{ reference: string }>>>((r) => (terminer = r)));
    const premier = envoyer(supprimer);
    const second = envoyer(supprimer, premier.verrou);
    await second.promesse;
    expect(second.suites).toEqual([]);
    terminer(succes({ reference: REFERENCE }));
    await premier.promesse;
    expect(supprimer).toHaveBeenCalledTimes(1);
    expect(premier.suites).toHaveLength(1);
  });

  it("redirection du serveur (session terminée) : relancée pour Next.js, verrou rouvert, aucune suite", async () => {
    let redirection: unknown;
    try {
      redirect("/connexion");
    } catch (erreur) {
      redirection = erreur;
    }
    const { promesse, suites, verrou } = envoyer(async () => {
      throw redirection;
    });
    await expect(promesse).rejects.toBe(redirection);
    expect(suites).toEqual([]);
    expect(verrou.current).toBe(false);
  });
});

describe("après la réponse (appliquerSuiteSuppression)", () => {
  function dependances() {
    const ordre: string[] = [];
    return {
      ordre,
      deps: {
        setFenetreOuverte: vi.fn((ouverte: boolean) => ordre.push(`fenetre:${ouverte}`)),
        marquerSupprimee: vi.fn(() => ordre.push("occupee")),
        afficherSucces: vi.fn((message: string) => ordre.push(`succes:${message}`)),
        afficherErreur: vi.fn((message: string) => ordre.push(`erreur:${message}`)),
        retourner: vi.fn(() => ordre.push("retour")),
      },
    };
  }

  it("réussite : fenêtre gardée occupée, toast, puis retour à la liste", () => {
    const { ordre, deps } = dependances();
    appliquerSuiteSuppression({ type: "succes", message: "Demande NOVA-2026-0042 supprimée" }, deps);
    expect(ordre).toEqual(["occupee", "succes:Demande NOVA-2026-0042 supprimée", "retour"]);
  });

  it("panne : fenêtre fermée, toast d'erreur, la demande reste affichée (pas de retour)", () => {
    const { ordre, deps } = dependances();
    appliquerSuiteSuppression({ type: "erreur", message: ECHEC }, deps);
    expect(ordre).toEqual(["fenetre:false", `erreur:${ECHEC}`]);
  });

  it("rien (S2 au recalcul) : fenêtre fermée, aucun toast", () => {
    const { ordre, deps } = dependances();
    appliquerSuiteSuppression({ type: "rien" }, deps);
    expect(ordre).toEqual(["fenetre:false"]);
  });
});

describe("ouverture et fermeture (changerOuvertureSuppression)", () => {
  it("« Annuler » ou Échap au repos : la fenêtre se ferme, rien n'est envoyé", () => {
    const setFenetreOuverte = vi.fn();
    changerOuvertureSuppression(false, { current: false }, setFenetreOuverte);
    expect(setFenetreOuverte).toHaveBeenCalledWith(false);
  });

  it("pendant l'envoi (ou après une réussite) : la fenêtre ne se ferme pas", () => {
    const setFenetreOuverte = vi.fn();
    changerOuvertureSuppression(false, { current: true }, setFenetreOuverte);
    expect(setFenetreOuverte).not.toHaveBeenCalled();
  });

  it("ouverture : la fenêtre s'ouvre", () => {
    const setFenetreOuverte = vi.fn();
    changerOuvertureSuppression(true, { current: false }, setFenetreOuverte);
    expect(setFenetreOuverte).toHaveBeenCalledWith(true);
  });
});

describe("retour à la liste d'où l'on venait", () => {
  it("la zone reçoit l'adresse de la liste (même recherche, mêmes filtres, même page)", () => {
    const source = readFileSync(join(process.cwd(), "src/app/(interne)/demandes/[reference]/contenu-demande.tsx"), "utf8");
    expect(source).toMatch(
      /utilisateur\.role === "administrateur" \? \(\s*<SupprimerDemande key=\{`suppression-\$\{demande\.reference\}`\} reference=\{demande\.reference\} retour=\{retour\} \/>/,
    );
  });

  /** Branchement de la zone avec un faux routeur ; chaque appel noté dans l'ordre. */
  function branchement(retour: string) {
    const ordre: string[] = [];
    const deps = dependancesSuiteSuppression({
      router: { replace: (adresse) => ordre.push(`replace:${adresse}`), refresh: () => ordre.push("refresh") },
      retour,
      setFenetreOuverte: (ouverte) => ordre.push(`fenetre:${ouverte}`),
      setSupprimee: (supprimee) => ordre.push(`supprimee:${supprimee}`),
      afficherSucces: (message) => ordre.push(`succes:${message}`),
      afficherErreur: (message) => ordre.push(`erreur:${message}`),
    });
    return { ordre, deps };
  }

  it("réussite : fenêtre gardée occupée, toast, puis replace(retour) avec ses paramètres, puis refresh()", () => {
    const retour = "/demandes?q=paul%40exemple.fr&page=2";
    const { ordre, deps } = branchement(retour);
    appliquerSuiteSuppression({ type: "succes", message: "Demande NOVA-2026-0042 supprimée" }, deps);
    expect(ordre).toEqual([
      "supprimee:true",
      "succes:Demande NOVA-2026-0042 supprimée",
      `replace:${retour}`,
      "refresh",
    ]);
  });

  it("échec : la fenêtre se ferme, toast d'erreur, aucune navigation", () => {
    const { ordre, deps } = branchement("/demandes?q=paul%40exemple.fr&page=2");
    appliquerSuiteSuppression({ type: "erreur", message: ECHEC }, deps);
    expect(ordre).toEqual(["fenetre:false", `erreur:${ECHEC}`]);
  });

  it("la zone avec état passe par ce branchement", () => {
    const zone = readFileSync(join(process.cwd(), "src/components/interne/supprimer-demande.tsx"), "utf8");
    expect(zone).toContain("dependancesSuiteSuppression({ router, retour, setFenetreOuverte, setSupprimee })");
  });
});

describe("thème compilé (AD-19) : chaque classe de la zone et de la fenêtre existe", () => {
  const CLASSES = ["border-t", "text-danger", "bg-danger-soft", "font-semibold", "min-h-11", "max-w-[440px]", "animate-spin"];
  let css = "";
  const fichierCss = join(process.cwd(), "src", "app", "globals.css");

  beforeAll(async () => {
    const compilateur = await compile(readFileSync(fichierCss, "utf8"), {
      base: dirname(fichierCss),
      from: fichierCss,
      onDependency: () => {},
    });
    css = compilateur.build(CLASSES);
  });

  it.each(CLASSES)("%s", (classe) => {
    expect(css).toContain(`.${classe.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)}`);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// « Désactiver », « Réactiver » et « Supprimer » de la colonne Actions de
// l'écran A2 (story 4.2 ; EXPERIENCE.md, A2, Fenêtre de confirmation,
// Toast ; FR-26, RM-11), rendus en HTML sans navigateur : boutons,
// indicateurs pendant l'envoi, fenêtre de confirmation et ses refus, suite
// donnée à chaque réponse, verrou du double clic, place dans la ligne. Les
// Server Functions sont simulées.

const changer = vi.hoisted(() => vi.fn());
const supprimer = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/changer-etat-categorie", () => ({ actionChangerEtatCategorie: changer }));
vi.mock("@/server/actions/supprimer-categorie", () => ({ actionSupprimerCategorie: supprimer }));
vi.mock("@/server/actions/renommer-categorie", () => ({ actionRenommerCategorie: vi.fn() }));
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

import {
  appliquerSuiteEtatCategorie,
  envoyerEtatCategorie,
  messageEchecCategorie,
  suiteApresReponseEtatCategorie,
  VueEtatCategorie,
  type CategorieEtat,
  type SuiteEtatCategorie,
} from "@/components/interne/etat-categorie";
import {
  ETAT_RENOMMAGE_INITIAL,
  LigneCategorie,
  VueLigneCategorie,
  type CategorieLigne,
} from "@/components/interne/renommer-categorie";
import {
  appliquerSuiteSuppressionCategorie,
  changerOuvertureSuppressionCategorie,
  envoyerSuppressionCategorie,
  suiteApresSuppressionCategorie,
  suppressionProposee,
  VueSupprimerCategorie,
  type CategorieSuppression,
  type SuiteSuppressionCategorie,
} from "@/components/interne/supprimer-categorie";
import { echec, succes } from "@/shared/reponse";

import { texteDe } from "../aides/formulaire-depot";

const ID = "c0000000-0000-4000-8000-000000000005";
const AUTRE: CategorieLigne = { id: ID, nom: "Autre", active: true, nombreDemandes: 3 };
const FACTURATION: CategorieLigne = { id: ID, nom: "Facturation", active: true, nombreDemandes: 0 };
const DERNIERE = "Impossible : au moins une catégorie doit rester active, sinon le formulaire serait inutilisable.";
const UTILISEE = "Impossible de supprimer une catégorie utilisée par des demandes. Vous pouvez la désactiver.";
const DEJA_PRIS = "Une catégorie active porte déjà ce nom.";
const PANNE = "La catégorie n'a pas pu être modifiée. Réessayez.";
const TITRE = "Supprimer la catégorie Facturation ?";
const TEXTE = "Elle n'a jamais été utilisée. Cette action est irréversible.";

const vueEtat = (categorie: CategorieEtat, options: Partial<Parameters<typeof VueEtatCategorie>[0]> = {}) =>
  renderToStaticMarkup(<VueEtatCategorie categorie={categorie} {...options} />);
const vueSupprimer = (
  categorie: CategorieSuppression = FACTURATION,
  options: Partial<Parameters<typeof VueSupprimerCategorie>[0]> = {},
) => renderToStaticMarkup(<VueSupprimerCategorie categorie={categorie} {...options} />);

/** La fenêtre de confirmation, seule. */
const fenetre = (html: string) => html.match(/<div[^>]*role="alertdialog"[\s\S]*<\/div><\/div>/)?.[0] ?? "";

/** Les boutons : libellé, variante, désactivé, attributs. */
function boutons(html: string) {
  return [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(([, attributs, contenu]) => ({
    libelle: texteDe(contenu).replace(/&#x27;/g, "'"),
    variante: attributs.match(/data-variant="(\w+)"/)?.[1],
    desactive: /\sdisabled=""/.test(attributs),
    attributs,
    contenu,
  }));
}

/** Une redirection de Next.js, telle que `redirect()` la lève. */
function redirection(): unknown {
  try {
    redirect("/connexion");
  } catch (erreur) {
    return erreur;
  }
}

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Désactiver, réactiver
// ---------------------------------------------------------------------------

describe("« Désactiver » et « Réactiver »", () => {
  it("catégorie active : « Désactiver », secondaire, nommé avec la catégorie, d'un clic (sans fenêtre)", () => {
    const [bouton] = boutons(vueEtat(AUTRE));
    expect(bouton.libelle).toBe("Désactiver");
    expect(bouton.variante).toBe("secondaire");
    expect(bouton.attributs).toContain('aria-label="Désactiver la catégorie Autre"');
    expect(bouton.attributs).toContain('data-slot="desactiver-categorie"');
    expect(bouton.attributs).not.toContain("aria-haspopup");
    expect(bouton.desactive).toBe(false);
  });

  it("catégorie désactivée : « Réactiver »", () => {
    const [bouton] = boutons(vueEtat({ ...AUTRE, active: false }));
    expect(bouton.libelle).toBe("Réactiver");
    expect(bouton.attributs).toContain('aria-label="Réactiver la catégorie Autre"');
  });

  it.each([
    [true, "Désactivation…"],
    [false, "Réactivation…"],
  ])("envoi en cours (active : %s) : « %s » avec l'indicateur, bouton inactif", (active, texte) => {
    const [bouton] = boutons(vueEtat({ ...AUTRE, active }, { envoiEnCours: true }));
    expect(bouton.libelle).toBe(texte);
    expect(bouton.desactive).toBe(true);
    expect(bouton.contenu).toMatch(/lucide-loader-circle[^"]*animate-spin/);
    expect(bouton.attributs).toContain('aria-busy="true"');
  });
});

describe("suite d'une désactivation ou d'une réactivation", () => {
  const MODIFIE = { id: ID, active: false, change: true };

  it("réussie : toast « Catégorie désactivée » ou « Catégorie réactivée »", () => {
    expect(suiteApresReponseEtatCategorie(succes(MODIFIE), false)).toEqual({ type: "succes", message: "Catégorie désactivée" });
    expect(suiteApresReponseEtatCategorie(succes({ ...MODIFIE, active: true }), true)).toEqual({
      type: "succes",
      message: "Catégorie réactivée",
    });
  });

  it("déjà dans l'état voulu : rien (pas d'erreur, la liste recalculée suffit)", () => {
    expect(suiteApresReponseEtatCategorie(succes({ ...MODIFIE, change: false }), false)).toEqual({ type: "rien" });
  });

  it("catégorie supprimée entre-temps, ou aucune réponse : rien", () => {
    expect(suiteApresReponseEtatCategorie(echec("INTROUVABLE", PANNE), false)).toEqual({ type: "rien" });
    expect(suiteApresReponseEtatCategorie(undefined, false)).toEqual({ type: "rien" });
  });

  it.each([
    ["dernière catégorie active", echec("CONFLIT", DERNIERE), DERNIERE],
    ["nom déjà pris", echec("CONFLIT", DEJA_PRIS), DEJA_PRIS],
    ["accès refusé", echec("ACCES_REFUSE", "x"), "Accès refusé."],
    ["conflit au message imprévu", echec("CONFLIT", "message technique"), PANNE],
    ["panne", echec("ERREUR_INTERNE", "x", { codeSupport: "AB12" }), PANNE],
    ["validation", echec("VALIDATION", "x"), PANNE],
  ])("%s : erreur avec le texte de l'UX", (_, reponse, message) => {
    expect(suiteApresReponseEtatCategorie(reponse, false)).toEqual({ type: "erreur", message });
  });

  it("messageEchecCategorie : refus de suppression aussi reconnu", () => {
    expect(messageEchecCategorie(echec("CONFLIT", UTILISEE))).toBe(UTILISEE);
  });
});

describe("envoi d'une désactivation ou d'une réactivation", () => {
  const envoyer = (active: boolean, verrou = { current: false }) => {
    const suites: SuiteEtatCategorie[] = [];
    const promesse = envoyerEtatCategorie({
      categorieId: ID,
      active,
      changer,
      envoiVerrouille: verrou,
      apresReponse: (suite) => suites.push(suite),
    });
    return { promesse, suites, verrou };
  };

  it("envoie l'identifiant et l'état voulu, puis donne la suite", async () => {
    changer.mockResolvedValueOnce(succes({ id: ID, active: false, change: true }));
    const { promesse, suites } = envoyer(false);
    await promesse;
    expect(changer).toHaveBeenCalledExactlyOnceWith({ categorieId: ID, active: false });
    expect(suites).toEqual([{ type: "succes", message: "Catégorie désactivée" }]);
  });

  it("double clic : un seul envoi, verrou fermé pendant l'envoi puis rouvert", async () => {
    let terminer: (valeur: unknown) => void = () => {};
    changer.mockReturnValueOnce(new Promise((resolve) => (terminer = resolve)));
    const premier = envoyer(true);
    expect(premier.verrou.current).toBe(true);
    const second = envoyer(true, premier.verrou);
    await second.promesse;
    expect(second.suites).toEqual([]);
    terminer(succes({ id: ID, active: true, change: true }));
    await premier.promesse;
    expect(changer).toHaveBeenCalledTimes(1);
    expect(premier.verrou.current).toBe(false);
  });

  it("réseau coupé : même suite qu'une panne, verrou rouvert", async () => {
    changer.mockRejectedValueOnce(new Error("Failed to fetch"));
    const { promesse, suites, verrou } = envoyer(false);
    await promesse;
    expect(suites).toEqual([{ type: "erreur", message: PANNE }]);
    expect(verrou.current).toBe(false);
  });

  it("redirection du serveur (session terminée) : relancée, verrou rouvert, aucune suite", async () => {
    const erreur = redirection();
    changer.mockRejectedValueOnce(erreur);
    const { promesse, suites, verrou } = envoyer(false);
    await expect(promesse).rejects.toBe(erreur);
    expect(suites).toEqual([]);
    expect(verrou.current).toBe(false);
  });

  it("suite appliquée : toast de succès ; toast d'erreur (jusqu'à fermeture) ; rien — la sélection est rendue après chacune", () => {
    const deps = { afficherSucces: vi.fn(), afficherErreur: vi.fn(), rendreSelection: { current: false } };
    appliquerSuiteEtatCategorie({ type: "succes", message: "Catégorie désactivée" }, deps);
    expect(deps.afficherSucces).toHaveBeenCalledExactlyOnceWith("Catégorie désactivée");
    expect(deps.rendreSelection.current).toBe(true);

    deps.rendreSelection.current = false;
    appliquerSuiteEtatCategorie({ type: "erreur", message: DERNIERE }, deps);
    expect(deps.afficherErreur).toHaveBeenCalledExactlyOnceWith(DERNIERE);
    expect(deps.rendreSelection.current).toBe(true);

    deps.rendreSelection.current = false;
    appliquerSuiteEtatCategorie({ type: "rien" }, deps);
    expect(deps.afficherSucces).toHaveBeenCalledTimes(1);
    expect(deps.afficherErreur).toHaveBeenCalledTimes(1);
    expect(deps.rendreSelection.current).toBe(true);
  });

  it("la sélection est rendue une fois l'envoi terminé, quelle que soit la réponse (le code)", () => {
    const source = readFileSync(join(process.cwd(), "src/components/interne/etat-categorie.tsx"), "utf8");
    expect(source).toMatch(
      /useEffect\(\(\) => \{\s*if \(envoiEnCours \|\| !rendreSelection\.current\) return;\s*rendreSelection\.current = false;\s*refBouton\.current\?\.focus\(\);\s*\}, \[categorie\.active, envoiEnCours\]\);/,
    );
  });
});

// ---------------------------------------------------------------------------
// Supprimer
// ---------------------------------------------------------------------------

describe("bouton « Supprimer »", () => {
  it("catégorie jamais utilisée : « Supprimer », secondaire, nommé avec la catégorie, qui ouvre une fenêtre", () => {
    expect(suppressionProposee(FACTURATION)).toBe(true);
    const [bouton] = boutons(vueSupprimer());
    expect(bouton.libelle).toBe("Supprimer");
    expect(bouton.variante).toBe("secondaire");
    expect(bouton.attributs).toContain('aria-label="Supprimer la catégorie Facturation"');
    expect(bouton.attributs).toContain('aria-haspopup="dialog"');
    expect(bouton.contenu).toMatch(/^<svg[^>]*lucide-trash/);
  });

  it("catégorie utilisée par au moins une demande : rien n'est proposé", () => {
    expect(suppressionProposee(AUTRE)).toBe(false);
    expect(vueSupprimer(AUTRE)).toBe("");
  });

  it("catégorie devenue utilisée pendant que la fenêtre était ouverte : la fenêtre reste, avec son message, sans bouton", () => {
    const html = vueSupprimer({ ...FACTURATION, nombreDemandes: 1 }, { fenetreOuverte: true, erreur: UTILISEE });
    expect(html).not.toContain('data-slot="supprimer-categorie"');
    expect(texteDe(fenetre(html)).replace(/&#x27;/g, "'")).toContain(UTILISEE);
    // Plus rien à confirmer : « Supprimer » est inactif, « Annuler » reste.
    const [annuler, confirmer] = boutons(fenetre(html));
    expect([annuler.libelle, annuler.desactive]).toEqual(["Annuler", false]);
    expect([confirmer.libelle, confirmer.desactive]).toEqual(["Supprimer", true]);
  });

  it("catégorie encore jamais utilisée : « Supprimer » de la fenêtre actif", () => {
    const [, confirmer] = boutons(fenetre(vueSupprimer(FACTURATION, { fenetreOuverte: true })));
    expect(confirmer.desactive).toBe(false);
  });

  it("fenêtre fermée : rien d'autre n'est affiché", () => {
    expect(vueSupprimer()).not.toContain("alertdialog");
  });
});

describe("fenêtre « Supprimer la catégorie … ? »", () => {
  const html = () => vueSupprimer(FACTURATION, { fenetreOuverte: true });

  it("pastille, titre avec le nom, texte de l'UX, « Annuler » puis « Supprimer »", () => {
    expect(texteDe(fenetre(html())).replace(/&#x27;/g, "'")).toBe(`${TITRE} ${TEXTE} Annuler Supprimer`);
    const f = fenetre(html());
    expect(f).toMatch(/data-slot="pastille-supprimer" class="[^"]*rounded-full[^"]*bg-danger-soft[^"]*text-danger/);
    expect(f.indexOf("pastille-supprimer")).toBeLessThan(f.indexOf("alert-dialog-title"));
  });

  it("« Annuler » secondaire, « Supprimer » danger (rouge), alignés à droite", () => {
    const [annuler, confirmer] = boutons(fenetre(html()));
    expect([annuler.libelle, annuler.variante]).toEqual(["Annuler", "secondaire"]);
    expect([confirmer.libelle, confirmer.variante]).toEqual(["Supprimer", "danger"]);
    expect(fenetre(html())).toMatch(/data-slot="alert-dialog-footer" class="[^"]*sm:justify-end/);
    expect(fenetre(html())).toMatch(/class="[^"]*max-w-\[440px\]/);
  });

  it("sélection sur « Annuler » et Échap qui ferme : comportement de Radix, non modifié", () => {
    const source = readFileSync(join(process.cwd(), "src/components/interne/supprimer-categorie.tsx"), "utf8");
    expect(source).not.toMatch(/onOpenAutoFocus|onEscapeKeyDown|autoFocus/);
  });

  it("refus : message exact dans la fenêtre, annoncé (role=alert)", () => {
    const f = fenetre(vueSupprimer(FACTURATION, { fenetreOuverte: true, erreur: DERNIERE }));
    expect(f).toMatch(/data-slot="refus-suppression"[^>]*role="alert"|role="alert"[^>]*data-slot="refus-suppression"/);
    expect(texteDe(f)).toContain(DERNIERE);
  });

  it("pendant l'envoi : « Suppression… » avec l'indicateur, deux boutons inactifs, fenêtre occupée", () => {
    const f = fenetre(vueSupprimer(FACTURATION, { fenetreOuverte: true, envoiEnCours: true }));
    const [annuler, confirmer] = boutons(f);
    expect(annuler.desactive).toBe(true);
    expect(confirmer.desactive).toBe(true);
    expect(confirmer.libelle).toBe("Suppression…");
    expect(confirmer.contenu).toMatch(/lucide-loader-circle[^"]*animate-spin/);
    expect(f).toContain('aria-busy="true"');
  });
});

describe("suite d'une suppression", () => {
  it("réussie : toast « Catégorie supprimée »", () => {
    expect(suiteApresSuppressionCategorie(succes({ id: ID, nom: "Facturation" }))).toEqual({
      type: "succes",
      message: "Catégorie supprimée",
    });
  });

  it.each([
    ["dernière catégorie active", echec("CONFLIT", DERNIERE), DERNIERE],
    ["catégorie utilisée", echec("CONFLIT", UTILISEE), UTILISEE],
    ["accès refusé", echec("ACCES_REFUSE", "x"), "Accès refusé."],
    ["panne", echec("ERREUR_INTERNE", "x"), PANNE],
  ])("%s : erreur avec le texte de l'UX", (_, reponse, message) => {
    expect(suiteApresSuppressionCategorie(reponse)).toEqual({ type: "erreur", message });
  });

  it("déjà supprimée, ou aucune réponse : rien", () => {
    expect(suiteApresSuppressionCategorie(echec("INTROUVABLE", PANNE))).toEqual({ type: "rien" });
    expect(suiteApresSuppressionCategorie(undefined)).toEqual({ type: "rien" });
  });

  it("suite appliquée : réussite → fenêtre fermée et toast ; erreur → message dans la fenêtre, qui reste ouverte ; rien → fermée", () => {
    const deps = () => ({ setFenetreOuverte: vi.fn(), setErreur: vi.fn(), afficherSucces: vi.fn() });

    const reussite = deps();
    appliquerSuiteSuppressionCategorie({ type: "succes", message: "Catégorie supprimée" }, reussite);
    expect(reussite.setFenetreOuverte).toHaveBeenCalledExactlyOnceWith(false);
    expect(reussite.afficherSucces).toHaveBeenCalledExactlyOnceWith("Catégorie supprimée");

    const erreur = deps();
    appliquerSuiteSuppressionCategorie({ type: "erreur", message: UTILISEE }, erreur);
    expect(erreur.setErreur).toHaveBeenCalledExactlyOnceWith(UTILISEE);
    expect(erreur.setFenetreOuverte).not.toHaveBeenCalled();
    expect(erreur.afficherSucces).not.toHaveBeenCalled();

    const rien = deps();
    appliquerSuiteSuppressionCategorie({ type: "rien" }, rien);
    expect(rien.setFenetreOuverte).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("ouverture et fermeture : ignorées pendant l'envoi ; sinon le message est retiré", () => {
    const deps = { setFenetreOuverte: vi.fn(), setErreur: vi.fn() };
    changerOuvertureSuppressionCategorie(false, { current: true }, deps);
    expect(deps.setFenetreOuverte).not.toHaveBeenCalled();
    changerOuvertureSuppressionCategorie(false, { current: false }, deps);
    expect(deps.setErreur).toHaveBeenCalledExactlyOnceWith(null);
    expect(deps.setFenetreOuverte).toHaveBeenCalledExactlyOnceWith(false);
  });
});

describe("envoi d'une suppression", () => {
  const envoyer = (verrou = { current: false }) => {
    const suites: SuiteSuppressionCategorie[] = [];
    const promesse = envoyerSuppressionCategorie({
      categorieId: ID,
      supprimer,
      envoiVerrouille: verrou,
      apresReponse: (suite) => suites.push(suite),
    });
    return { promesse, suites, verrou };
  };

  it("envoie l'identifiant, puis donne la suite", async () => {
    supprimer.mockResolvedValueOnce(succes({ id: ID, nom: "Facturation" }));
    const { promesse, suites } = envoyer();
    await promesse;
    expect(supprimer).toHaveBeenCalledExactlyOnceWith({ categorieId: ID });
    expect(suites).toEqual([{ type: "succes", message: "Catégorie supprimée" }]);
  });

  it("double clic : un seul envoi", async () => {
    let terminer: (valeur: unknown) => void = () => {};
    supprimer.mockReturnValueOnce(new Promise((resolve) => (terminer = resolve)));
    const premier = envoyer();
    await envoyer(premier.verrou).promesse;
    terminer(echec("CONFLIT", UTILISEE));
    await premier.promesse;
    expect(supprimer).toHaveBeenCalledTimes(1);
    expect(premier.suites).toEqual([{ type: "erreur", message: UTILISEE }]);
    expect(premier.verrou.current).toBe(false);
  });

  it("réseau coupé : panne ; redirection : relancée, aucune suite", async () => {
    supprimer.mockRejectedValueOnce(new Error("Failed to fetch"));
    const coupe = envoyer();
    await coupe.promesse;
    expect(coupe.suites).toEqual([{ type: "erreur", message: PANNE }]);

    const erreur = redirection();
    supprimer.mockRejectedValueOnce(erreur);
    const redirige = envoyer();
    await expect(redirige.promesse).rejects.toBe(erreur);
    expect(redirige.suites).toEqual([]);
    expect(redirige.verrou.current).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Place dans la ligne
// ---------------------------------------------------------------------------

describe("colonne Actions de la ligne", () => {
  const ligne = (categorie: CategorieLigne) =>
    renderToStaticMarkup(
      <table>
        <tbody>
          <LigneCategorie categorie={categorie} etatCategorie={categorie.active ? "Active" : "Désactivée"} />
        </tbody>
      </table>,
    );

  it("catégorie jamais utilisée : « Renommer », « Désactiver », « Supprimer », dans cet ordre", () => {
    expect(boutons(ligne(FACTURATION)).map((b) => b.libelle)).toEqual(["Renommer", "Désactiver", "Supprimer"]);
  });

  it("catégorie utilisée : « Renommer », « Désactiver », sans « Supprimer »", () => {
    expect(boutons(ligne(AUTRE)).map((b) => b.libelle)).toEqual(["Renommer", "Désactiver"]);
  });

  it("catégorie désactivée : « Réactiver »", () => {
    expect(boutons(ligne({ ...AUTRE, active: false })).map((b) => b.libelle)).toEqual(["Renommer", "Réactiver"]);
  });

  it("une catégorie active (même la dernière : la base refuse) montre toujours « Désactiver », actif", () => {
    const desactiver = boutons(ligne(AUTRE)).find((b) => b.libelle === "Désactiver");
    expect(desactiver).toBeDefined();
    expect(desactiver?.desactive).toBe(false);
  });

  /** La ligne en cours de renommage. */
  const enRenommage = () =>
    renderToStaticMarkup(
      <table>
        <tbody>
          <VueLigneCategorie
            categorie={FACTURATION}
            etatCategorie="Active"
            autresActions={<button type="button">Autre action</button>}
            etat={{ ...ETAT_RENOMMAGE_INITIAL, edition: true, valeur: "Facturation" }}
          />
        </tbody>
      </table>,
    );

  it("pendant le renommage : « Enregistrer » et « Annuler » visibles ; les autres actions restent montées, cachées", () => {
    const html = enRenommage();
    const [, avant = "", cachees = ""] =
      html.match(/^([\s\S]*)<div data-slot="autres-actions" hidden="">([\s\S]*?)<\/div>/) ?? [];
    expect(boutons(avant).map((b) => b.libelle)).toEqual(["Enregistrer", "Annuler"]);
    expect(boutons(cachees).map((b) => b.libelle)).toEqual(["Autre action"]);
  });

  it("en lecture : les autres actions sont affichées (wrapper sans boîte, pas caché)", () => {
    const html = renderToStaticMarkup(
      <table>
        <tbody>
          <VueLigneCategorie
            categorie={FACTURATION}
            etatCategorie="Active"
            autresActions={<button type="button">Autre action</button>}
            etat={ETAT_RENOMMAGE_INITIAL}
          />
        </tbody>
      </table>,
    );
    expect(html).toContain('<div data-slot="autres-actions" class="contents">');
    expect(boutons(html).map((b) => b.libelle)).toEqual(["Renommer", "Autre action"]);
  });

  it("les actions de la ligne ont des clés distinctes (le code)", () => {
    const source = readFileSync(join(process.cwd(), "src/components/interne/renommer-categorie.tsx"), "utf8");
    expect(source).toMatch(/<div\s+key="autres"\s+data-slot="autres-actions"/);
    expect(source).toContain('<EtatCategorie key="etat" categorie={categorie} />');
    expect(source).toContain('<SupprimerCategorie key="supprimer" categorie={categorie} />');
  });
});

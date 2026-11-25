import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// « Désactiver » et « Réactiver » de l'écran A1 (story 3.4 ; EXPERIENCE.md,
// A1, Fenêtre de confirmation, Toast ; FR-22, FR-25, RM-9, RM-10), rendus en
// HTML sans navigateur : boutons de la colonne Actions, fenêtre de
// confirmation, refus et pannes dans la fenêtre, indicateurs pendant
// l'envoi, suite donnée à chaque réponse, verrou du double clic. La Server
// Function est simulée.

const changer = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/changer-etat-compte", () => ({ actionChangerEtatCompte: changer }));
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
  appliquerSuiteEtat,
  changerOuvertureEtat,
  EtatCompte,
  envoyerEtatCompte,
  premierMot,
  suiteApresReponseEtat,
  VueEtatCompte,
  type CompteLigne,
  type SuiteEtatCompte,
} from "@/components/interne/etat-compte";
import { echec, succes } from "@/shared/reponse";

import { texteDe } from "../aides/formulaire-depot";

const LUCAS: CompteLigne = { id: "7e2a9c41-3b5d-4f68-9a0c-2d4e6f8a1b3c", nom: "Lucas Bernard", actif: true };
const LUCAS_DESACTIVE: CompteLigne = { ...LUCAS, actif: false };
const MODIFIE = {
  id: LUCAS.id,
  nom: "Lucas Bernard",
  email: "lucas.bernard@nova-services.example",
  actif: false,
  change: true,
};
const DERNIER_ADMINISTRATEUR = "Impossible : il doit rester au moins un administrateur actif.";
const PANNE_DESACTIVATION = "Le compte n'a pas pu être désactivé. Réessayez.";
const PANNE_REACTIVATION = "Le compte n'a pas pu être réactivé. Réessayez.";

const vue = (compte: CompteLigne, options: Partial<Parameters<typeof VueEtatCompte>[0]> = {}) =>
  renderToStaticMarkup(<VueEtatCompte compte={compte} {...options} />);

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

afterEach(() => {
  changer.mockReset();
});

describe("colonne Actions", () => {
  it("compte actif : « Désactiver », bouton secondaire, nommé avec le compte, qui ouvre une fenêtre", () => {
    const [bouton] = boutons(vue(LUCAS));
    expect(bouton.libelle).toBe("Désactiver");
    expect(bouton.variante).toBe("secondaire");
    expect(bouton.attributs).toContain('aria-label="Désactiver le compte de Lucas Bernard"');
    expect(bouton.attributs).toContain('aria-haspopup="dialog"');
    expect(bouton.desactive).toBe(false);
  });

  it("compte désactivé : « Réactiver », d'un clic, sans fenêtre (décision d'Aurel, 25 nov. 2026)", () => {
    const html = vue(LUCAS_DESACTIVE, { fenetreOuverte: true });
    const [bouton] = boutons(html);
    expect(bouton.libelle).toBe("Réactiver");
    expect(bouton.variante).toBe("secondaire");
    expect(bouton.attributs).toContain('aria-label="Réactiver le compte de Lucas Bernard"');
    expect(html).not.toMatch(/alertdialog|aria-haspopup/);
  });

  it("réactivation en cours : « Réactivation… » avec l'indicateur, bouton désactivé", () => {
    const [bouton] = boutons(vue(LUCAS_DESACTIVE, { envoiEnCours: true }));
    expect(bouton.libelle).toBe("Réactivation…");
    expect(bouton.contenu).toContain("animate-spin");
    expect(bouton.desactive).toBe(true);
  });

  it("jamais « Modifier » ni « Réinitialiser le mot de passe » (stories 3.3, 3.5)", () => {
    expect(texteDe(vue(LUCAS) + vue(LUCAS_DESACTIVE))).not.toMatch(/Modifier|Réinitialiser/);
  });

  it("le tableau des comptes relie chaque ligne à son bouton (`EtatCompte`)", () => {
    const html = renderToStaticMarkup(<EtatCompte compte={LUCAS} />);
    expect(boutons(html).map((b) => b.libelle)).toEqual(["Désactiver"]);
  });
});

describe("fenêtre « Désactiver »", () => {
  const ouverte = (options: Partial<Parameters<typeof VueEtatCompte>[0]> = {}) =>
    fenetre(vue(LUCAS, { fenetreOuverte: true, ...options }));

  it("titre avec le nom, texte de l'UX avec le premier mot du nom, « Annuler » puis « Désactiver »", () => {
    expect(texteDe(ouverte())).toBe(
      "Désactiver le compte de Lucas Bernard ? Lucas ne pourra plus se connecter. Son nom restera dans l'historique des demandes. Annuler Désactiver",
    );
    expect(ouverte()).toContain('data-slot="fenetre-desactiver"');
  });

  it("« Annuler » secondaire (sélectionné à l'ouverture), « Désactiver » principal, jamais danger", () => {
    const [annuler, desactiver] = boutons(ouverte());
    expect([annuler.libelle, annuler.variante]).toEqual(["Annuler", "secondaire"]);
    expect(annuler.attributs).toContain('data-slot="alert-dialog-cancel"');
    expect([desactiver.libelle, desactiver.variante]).toEqual(["Désactiver", "principal"]);
    expect(ouverte()).not.toContain('data-variant="danger"');
  });

  it("habillage de DESIGN.md : 440 px au plus", () => {
    expect(ouverte()).toMatch(/class="[^"]*max-w-\[440px\]/);
  });

  it("refus du dernier administrateur : message exact dans la fenêtre, annoncé (role=alert), boutons gardés", () => {
    const html = ouverte({ erreur: DERNIER_ADMINISTRATEUR });
    const encadre = html.match(/<div[^>]*data-slot="refus-desactivation".*?<\/div>/)?.[0] ?? "";
    expect(texteDe(encadre)).toBe(DERNIER_ADMINISTRATEUR);
    expect(encadre).toContain('role="alert"');
    expect(boutons(html).map((b) => b.libelle)).toEqual(["Annuler", "Désactiver"]);
  });

  it("panne : « Le compte n'a pas pu être désactivé. Réessayez. » dans la fenêtre", () => {
    expect(texteDe(ouverte({ erreur: PANNE_DESACTIVATION }))).toContain(PANNE_DESACTIVATION);
  });

  it("sans erreur : aucun encadré", () => {
    expect(ouverte()).not.toContain("refus-desactivation");
  });

  it("envoi en cours : « Désactivation… » avec l'indicateur, les deux boutons désactivés", () => {
    const [annuler, desactiver] = boutons(ouverte({ envoiEnCours: true }));
    expect(desactiver.libelle).toBe("Désactivation…");
    expect(desactiver.contenu).toContain("animate-spin");
    expect(desactiver.desactive).toBe(true);
    expect(annuler.desactive).toBe(true);
  });

  it("premier mot du nom, espaces de bord ignorés", () => {
    expect(premierMot("Lucas Bernard")).toBe("Lucas");
    expect(premierMot("  Marie-Hélène   Dupont ")).toBe("Marie-Hélène");
    expect(premierMot("Karim")).toBe("Karim");
  });
});

describe("suite donnée à la réponse", () => {
  it("désactivation réussie : toast « Compte désactivé »", () => {
    expect(suiteApresReponseEtat(succes(MODIFIE), false)).toEqual({ type: "succes", message: "Compte désactivé" });
  });

  it("réactivation réussie : toast « Compte réactivé »", () => {
    expect(suiteApresReponseEtat(succes({ ...MODIFIE, actif: true }), true)).toEqual({
      type: "succes",
      message: "Compte réactivé",
    });
  });

  it("dernier administrateur : le message exact", () => {
    expect(suiteApresReponseEtat(echec("CONFLIT", DERNIER_ADMINISTRATEUR), false)).toEqual({
      type: "erreur",
      message: DERNIER_ADMINISTRATEUR,
    });
  });

  it("accès refusé : « Accès refusé. »", () => {
    expect(suiteApresReponseEtat(echec("ACCES_REFUSE", "x"), false)).toEqual({ type: "erreur", message: "Accès refusé." });
  });

  it.each([
    ["ERREUR_INTERNE", false, PANNE_DESACTIVATION],
    ["INTROUVABLE", false, PANNE_DESACTIVATION],
    ["VALIDATION", true, PANNE_REACTIVATION],
    ["ERREUR_INTERNE", true, PANNE_REACTIVATION],
  ] as const)("%s (actif voulu : %s) : message de l'écran, jamais le message technique", (code, actif, message) => {
    expect(suiteApresReponseEtat(echec(code, "détail technique"), actif)).toEqual({ type: "erreur", message });
  });

  it("aucune réponse (le serveur a changé de page : son propre compte désactivé) : rien", () => {
    expect(suiteApresReponseEtat(undefined, false)).toEqual({ type: "rien" });
  });
});

describe("envoi", () => {
  const envoyer = (actif: boolean, verrou = { current: false }) => {
    const suites: SuiteEtatCompte[] = [];
    const promesse = envoyerEtatCompte({
      compteId: LUCAS.id,
      actif,
      changer,
      envoiVerrouille: verrou,
      apresReponse: (suite) => suites.push(suite),
    });
    return { promesse, suites, verrou };
  };

  it("envoie l'identifiant et l'état voulu, puis donne la suite", async () => {
    changer.mockResolvedValueOnce(succes(MODIFIE));
    const { promesse, suites } = envoyer(false);
    await promesse;
    expect(changer).toHaveBeenCalledExactlyOnceWith({ compteId: LUCAS.id, actif: false });
    expect(suites).toEqual([{ type: "succes", message: "Compte désactivé" }]);
  });

  it("double clic : un seul envoi, verrou fermé pendant l'envoi puis rouvert", async () => {
    let terminer: (valeur: unknown) => void = () => {};
    changer.mockReturnValueOnce(new Promise((resolve) => (terminer = resolve)));
    const premier = envoyer(true);
    expect(premier.verrou.current).toBe(true);
    const second = envoyer(true, premier.verrou);
    await second.promesse;
    expect(second.suites).toEqual([]);
    terminer(succes({ ...MODIFIE, actif: true }));
    await premier.promesse;
    expect(changer).toHaveBeenCalledTimes(1);
    expect(premier.verrou.current).toBe(false);
    expect(premier.suites).toEqual([{ type: "succes", message: "Compte réactivé" }]);
  });

  it("réseau coupé : même suite qu'une panne, verrou rouvert", async () => {
    changer.mockRejectedValueOnce(new Error("Failed to fetch"));
    const { promesse, suites, verrou } = envoyer(false);
    await promesse;
    expect(suites).toEqual([{ type: "erreur", message: PANNE_DESACTIVATION }]);
    expect(verrou.current).toBe(false);
  });

  it("redirection du serveur (son propre compte désactivé) : relancée pour Next.js, verrou rouvert, aucune suite", async () => {
    let redirection: unknown;
    try {
      redirect("/connexion");
    } catch (erreur) {
      redirection = erreur;
    }
    changer.mockRejectedValueOnce(redirection);
    const { promesse, suites, verrou } = envoyer(false);
    await expect(promesse).rejects.toBe(redirection);
    expect(suites).toEqual([]);
    expect(verrou.current).toBe(false);
  });
});

describe("suite appliquée à la ligne", () => {
  const dependances = () => ({
    setFenetreOuverte: vi.fn<(ouverte: boolean) => void>(),
    setErreur: vi.fn<(message: string | null) => void>(),
    afficherSucces: vi.fn<(message: string) => void>(),
    afficherErreur: vi.fn<(message: string) => void>(),
    rendreSelection: { current: false },
  });

  it.each([false, true])("réussite (actif voulu : %s) : fenêtre fermée, toast de succès, sélection rendue au bouton", (actif) => {
    const deps = dependances();
    appliquerSuiteEtat({ type: "succes", message: "Compte désactivé" }, actif, deps);
    expect(deps.setFenetreOuverte).toHaveBeenCalledExactlyOnceWith(false);
    expect(deps.afficherSucces).toHaveBeenCalledExactlyOnceWith("Compte désactivé");
    expect(deps.rendreSelection.current).toBe(true);
    expect(deps.setErreur).not.toHaveBeenCalled();
    expect(deps.afficherErreur).not.toHaveBeenCalled();
  });

  it("erreur d'une désactivation : message dans la fenêtre, qui reste ouverte, sans toast", () => {
    const deps = dependances();
    appliquerSuiteEtat({ type: "erreur", message: DERNIER_ADMINISTRATEUR }, false, deps);
    expect(deps.setErreur).toHaveBeenCalledExactlyOnceWith(DERNIER_ADMINISTRATEUR);
    expect(deps.setFenetreOuverte).not.toHaveBeenCalled();
    expect(deps.afficherErreur).not.toHaveBeenCalled();
    expect(deps.afficherSucces).not.toHaveBeenCalled();
    expect(deps.rendreSelection.current).toBe(false);
  });

  it("erreur d'une réactivation : toast d'erreur, rien dans une fenêtre", () => {
    const deps = dependances();
    appliquerSuiteEtat({ type: "erreur", message: PANNE_REACTIVATION }, true, deps);
    expect(deps.afficherErreur).toHaveBeenCalledExactlyOnceWith(PANNE_REACTIVATION);
    expect(deps.setErreur).not.toHaveBeenCalled();
    expect(deps.setFenetreOuverte).not.toHaveBeenCalled();
  });

  it("rien (le serveur a changé de page) : rien", () => {
    const deps = dependances();
    appliquerSuiteEtat({ type: "rien" }, false, deps);
    for (const fn of [deps.setFenetreOuverte, deps.setErreur, deps.afficherSucces, deps.afficherErreur]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("fermeture pendant l'envoi (Échap, « Annuler ») : ignorée", () => {
    const deps = dependances();
    changerOuvertureEtat(false, { current: true }, deps);
    expect(deps.setFenetreOuverte).not.toHaveBeenCalled();
    expect(deps.setErreur).not.toHaveBeenCalled();
  });

  it.each([true, false])("ouverture ou fermeture hors envoi (ouvrir : %s) : message retiré, fenêtre suit", (ouvrir) => {
    const deps = dependances();
    changerOuvertureEtat(ouvrir, { current: false }, deps);
    expect(deps.setErreur).toHaveBeenCalledExactlyOnceWith(null);
    expect(deps.setFenetreOuverte).toHaveBeenCalledExactlyOnceWith(ouvrir);
  });

  it("ouverture pendant l'envoi : permise (seule la fermeture est bloquée)", () => {
    const deps = dependances();
    changerOuvertureEtat(true, { current: true }, deps);
    expect(deps.setFenetreOuverte).toHaveBeenCalledExactlyOnceWith(true);
  });
});

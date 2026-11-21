import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { compile } from "@tailwindcss/node";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Panneau « Statut » de l'écran I4 (story 1.11 ; FR-16, FR-17, EXPERIENCE.md,
// DESIGN.md), rendu en HTML avec Supabase simulé : boutons selon le statut
// (un seul principal, jamais de retour à Nouvelle), indicateur pendant
// l'action, fenêtre « Rouvrir », encadré « modifiée par … », historique
// « Statut : … », date de clôture, suite donnée à chaque réponse, toasts.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
// La fenêtre s'ouvre dans un portail, que le rendu serveur n'affiche pas :
// ici, elle s'affiche à sa place.
vi.mock("radix-ui", async (original) => {
  const radix = await original<typeof import("radix-ui")>();
  return {
    ...radix,
    AlertDialog: { ...radix.AlertDialog, Portal: ({ children }: { children: React.ReactNode }) => children },
  };
});
vi.mock("sonner", async (original) => ({
  ...(await original<typeof import("sonner")>()),
  toast: Object.assign(vi.fn(), toasts),
}));

import { ContenuDemande } from "@/app/(interne)/demandes/[reference]/contenu-demande";
import {
  ActionsStatut,
  envoyerChangementStatut,
  suiteApresReponse,
  VueActionsStatut,
} from "@/components/interne/actions-statut";
import { afficherErreur, afficherSucces } from "@/components/ui/sonner";
import type { Statut } from "@/shared/constantes";
import { formaterHeure } from "@/shared/dates";
import { libelleChangementStatut, libelleTransition } from "@/shared/libelles";
import { echec, succes } from "@/shared/reponse";

import { texteDe } from "../aides/formulaire-depot";
import { fabriquerDemandes, ID_KARIM, type DemandeSimulee } from "../aides/supabase-connexion";

const REFERENCE = "NOVA-2026-0042";
const CLAIRE: DemandeSimulee = {
  ...fabriquerDemandes(42)[0],
  nom: "Claire Martin",
  email: "claire.martin@cabinet-martin.fr",
  objet: "Accès impossible à l'outil de facturation",
  statut: "nouvelle",
};
const MODIFIEE = "Cette demande a été modifiée par Lucas Bernard à 9 h 11. L'affichage a été mis à jour.";

const vue = (statut: Statut, options: Partial<Parameters<typeof VueActionsStatut>[0]> = {}) =>
  renderToStaticMarkup(<VueActionsStatut reference={REFERENCE} statut={statut} {...options} />);

/** Les boutons : libellé, variante, désactivé. */
function boutons(html: string) {
  return [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(([, attributs, contenu]) => ({
    libelle: texteDe(contenu),
    variante: attributs.match(/data-variant="(\w+)"/)?.[1],
    desactive: /\sdisabled=""/.test(attributs),
    attributs,
    contenu,
  }));
}

async function ecran(): Promise<string> {
  return renderToStaticMarkup(
    await ContenuDemande({ params: Promise.resolve({ reference: REFERENCE }), searchParams: Promise.resolve({}) }),
  );
}

/** Un bloc de la colonne principale, par son titre. */
function bloc(html: string, titre: string): string {
  return html.match(new RegExp(`<section[^>]*><h2[^>]*>(?:(?!</h2>).)*${titre}</h2>[\\s\\S]*?</section>`))?.[0] ?? "";
}

beforeEach(() => {
  simulation.reinitialiser();
  simulation.session.id = ID_KARIM;
  simulation.demandes.push({ ...CLAIRE }, ...fabriquerDemandes(41));
  toasts.success.mockClear();
  toasts.error.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("boutons selon le statut (FR-16 ; EXPERIENCE.md, I4)", () => {
  it("Nouvelle : « Passer En cours » principal, « Marquer Traitée » secondaire", () => {
    expect(boutons(vue("nouvelle")).map(({ libelle, variante }) => [libelle, variante])).toEqual([
      ["Passer En cours", "principal"],
      ["Marquer Traitée", "secondaire"],
    ]);
  });

  it("En cours : seule « Marquer Traitée », principal", () => {
    expect(boutons(vue("en_cours")).map(({ libelle, variante }) => [libelle, variante])).toEqual([
      ["Marquer Traitée", "principal"],
    ]);
  });

  it("Traitée : seule « Rouvrir (En cours) », secondaire, qui ouvre une fenêtre", () => {
    const [rouvrir, ...autres] = boutons(vue("traitee"));
    expect(autres).toEqual([]);
    expect([rouvrir.libelle, rouvrir.variante]).toEqual(["Rouvrir (En cours)", "secondaire"]);
    expect(rouvrir.attributs).toContain('aria-haspopup="dialog"');
    // Fermée tant qu'on n'a pas cliqué.
    expect(vue("traitee")).not.toContain("Rouvrir la demande");
  });

  it.each(["nouvelle", "en_cours", "traitee"] as const)("%s : jamais de retour à Nouvelle", (statut) => {
    const html = vue(statut);
    expect(texteDe(html)).not.toMatch(/Nouvelle/);
    expect(html).not.toContain('data-transition="nouvelle"');
  });

  it("icônes lucide, chacune avec son mot", () => {
    const [passer, marquer] = boutons(vue("nouvelle"));
    expect(passer.contenu).toMatch(/^<svg[^>]*lucide-circle-play[^>]*aria-hidden="true"/);
    expect(marquer.contenu).toMatch(/^<svg[^>]*lucide-circle-check/);
    expect(boutons(vue("traitee"))[0].contenu).toMatch(/^<svg[^>]*lucide-rotate-ccw/);
  });

  it("groupe nommé pour les lecteurs d'écran", () => {
    expect(vue("nouvelle")).toContain('role="group" aria-label="Changer le statut"');
  });

  it("libellés : un par passage permis", () => {
    expect(libelleTransition("nouvelle", "en_cours")).toBe("Passer En cours");
    expect(libelleTransition("nouvelle", "traitee")).toBe("Marquer Traitée");
    expect(libelleTransition("en_cours", "traitee")).toBe("Marquer Traitée");
    expect(libelleTransition("traitee", "en_cours")).toBe("Rouvrir (En cours)");
  });
});

describe("pendant l'action (AD-20)", () => {
  it("le bouton cliqué montre un indicateur ; tous les boutons de statut sont désactivés", () => {
    const html = vue("nouvelle", { cibleEnCours: "traitee" });
    const [passer, marquer] = boutons(html);
    expect(passer.desactive && marquer.desactive).toBe(true);
    expect(marquer.contenu).toMatch(/^<svg[^>]*lucide-loader-circle[^>]*animate-spin/);
    expect(passer.contenu).not.toContain("lucide-loader-circle");
    expect(marquer.libelle).toBe("Marquer Traitée");
    expect(html).toContain('data-slot="actions-statut" aria-busy="true"');
  });

  it("au repos : rien de désactivé, pas d'indicateur", () => {
    const html = vue("nouvelle");
    expect(boutons(html).some((b) => b.desactive)).toBe(false);
    expect(html).not.toContain("lucide-loader-circle");
    expect(html).not.toContain("aria-busy");
  });

  it("le composant avec état s'affiche comme l'écran au repos", () => {
    expect(renderToStaticMarkup(<ActionsStatut reference={REFERENCE} statut="nouvelle" />)).toBe(vue("nouvelle"));
  });
});

describe("fenêtre « Rouvrir » (décision d'Aurel, 21 nov. 2026)", () => {
  const html = () => vue("traitee", { fenetreOuverte: true });
  const fenetre = () => html().match(/<div[^>]*role="alertdialog".*?<\/div><\/div>/)?.[0] ?? "";

  it("titre avec la référence en chasse fixe, texte, « Annuler » puis « Rouvrir la demande »", () => {
    expect(texteDe(fenetre())).toBe(
      "Rouvrir la demande NOVA-2026-0042 ? Elle repassera En cours et sa date de clôture sera effacée. Annuler Rouvrir la demande",
    );
    expect(fenetre()).toContain('<span class="font-mono">NOVA-2026-0042</span>');
    expect(fenetre()).toMatch(/data-slot="fenetre-rouvrir"/);
  });

  it("« Annuler » secondaire, « Rouvrir la demande » principal, alignés à droite", () => {
    const [annuler, rouvrir] = boutons(fenetre());
    expect([annuler.libelle, annuler.variante]).toEqual(["Annuler", "secondaire"]);
    expect([rouvrir.libelle, rouvrir.variante]).toEqual(["Rouvrir la demande", "principal"]);
    expect(fenetre()).toMatch(/data-slot="alert-dialog-footer" class="[^"]*sm:justify-end/);
  });

  it("habillage de DESIGN.md : 440 px au plus, coins de 14 px, ombre de fenêtre, voile sombre", () => {
    expect(fenetre()).toMatch(/class="[^"]*max-w-\[440px\][^"]*rounded-lg[^"]*shadow-dialog/);
    expect(html()).toMatch(/data-slot="alert-dialog-overlay"[^>]*class="[^"]*bg-text\/45/);
  });

  it("fenêtre d'alerte (role alertdialog), titre en h2 et texte identifiés (lecteurs d'écran)", () => {
    expect(fenetre()).toMatch(/^<div role="alertdialog"/);
    expect(fenetre()).toMatch(/<h2 id="[^"]+" data-slot="alert-dialog-title"/);
    expect(fenetre()).toMatch(/<p id="[^"]+" data-slot="alert-dialog-description"/);
  });

  it("sélection sur « Annuler » et Échap qui ferme : comportement de Radix, non modifié", () => {
    // Radix AlertDialog place la sélection sur Cancel à l'ouverture et
    // ferme la fenêtre avec Échap ; ni l'un ni l'autre n'est remplacé ici.
    for (const fichier of ["src/components/ui/alert-dialog.tsx", "src/components/interne/actions-statut.tsx"]) {
      const source = readFileSync(join(process.cwd(), fichier), "utf8");
      expect(source).not.toMatch(/onOpenAutoFocus|onEscapeKeyDown|autoFocus/);
    }
    expect(readFileSync(join(process.cwd(), "src/components/ui/alert-dialog.tsx"), "utf8")).toContain(
      "<AlertDialogPrimitive.Cancel",
    );
  });

  it("aucune confirmation pour « Passer En cours » ni « Marquer Traitée »", () => {
    for (const statut of ["nouvelle", "en_cours"] as const) {
      expect(vue(statut, { fenetreOuverte: true })).not.toMatch(/alertdialog|aria-haspopup/);
    }
  });
});

describe("encadré « modifiée par … » (EXPERIENCE.md, I4)", () => {
  it("encadré d'information, icône « i », texte de l'UX, au-dessus des boutons", () => {
    const html = vue("en_cours", { encadre: MODIFIEE });
    const encadre = html.match(/<div[^>]*data-slot="modifiee-entre-temps".*?<\/div>/)?.[0] ?? "";
    expect(encadre).toContain('data-variant="information"');
    expect(encadre).toContain('role="status"');
    expect(encadre).toContain("lucide-info");
    expect(texteDe(encadre)).toBe(MODIFIEE);
    expect(html.indexOf("modifiee-entre-temps")).toBeLessThan(html.indexOf("<button"));
  });

  it("sans conflit : aucun encadré", () => {
    expect(vue("en_cours")).not.toContain("modifiee-entre-temps");
  });

  it("heure seule, en heure de Paris", () => {
    expect(formaterHeure(new Date("2026-11-21T08:11:00Z"))).toBe("9 h 11");
    expect(formaterHeure(new Date("2026-07-01T07:05:00Z"))).toBe("9 h 05");
    expect(formaterHeure(new Date("2026-12-31T23:00:00Z"))).toBe("0 h 00");
  });
});

describe("suite donnée à chaque réponse", () => {
  it.each([
    ["appliqué", succes({ statut: "en_cours" as const, modifiee: null }), { toast: { type: "succes", message: "Statut mis à jour" }, encadre: null }],
    ["appliqué après un collègue", succes({ statut: "traitee" as const, modifiee: MODIFIEE }), { toast: { type: "succes", message: "Statut mis à jour" }, encadre: MODIFIEE }],
    ["conflit", echec("CONFLIT", MODIFIEE), { toast: null, encadre: MODIFIEE }],
    ["introuvable", echec("INTROUVABLE", "Cette demande n'existe pas ou a été supprimée."), { toast: null, encadre: null }],
    ["panne", echec("ERREUR_INTERNE", "Une erreur inattendue s'est produite.", { codeSupport: "7F3A" }), { toast: { type: "erreur", message: "Le statut n'a pas pu être modifié. Réessayez." }, encadre: null }],
    ["saisie refusée", echec("VALIDATION", "Le statut n'a pas pu être modifié. Réessayez."), { toast: { type: "erreur", message: "Le statut n'a pas pu être modifié. Réessayez." }, encadre: null }],
    ["aucune réponse (renvoi vers la connexion)", undefined, { toast: null, encadre: null }],
  ])("%s", (_, reponse, suite) => {
    expect(suiteApresReponse(reponse)).toEqual(suite);
  });

});

describe("envoi (envoyerChangementStatut) : verrou, toasts, encadré", () => {
  type Reponse = Awaited<ReturnType<Parameters<typeof envoyerChangementStatut>[0]["changer"]>>;

  /** Dépendances de l'envoi, avec la réponse (ou l'échec) de la Server Function. */
  function dependances(reponse: () => Promise<Reponse>) {
    const envoiVerrouille = { current: false };
    // Encadré et verrou vus par la Server Function au moment de l'appel.
    const pendantAppel: { encadre: (string | null)[]; verrou: boolean[] } = { encadre: [], verrou: [] };
    const afficherEncadre = vi.fn<(texte: string | null) => void>();
    const changer = vi.fn(async () => {
      pendantAppel.encadre.push(...afficherEncadre.mock.calls.map(([t]) => t));
      pendantAppel.verrou.push(envoiVerrouille.current);
      return reponse();
    });
    return {
      deps: {
        reference: REFERENCE,
        statutVu: "nouvelle" as const,
        nouveauStatut: "en_cours" as const,
        changer,
        envoiVerrouille,
        afficherEncadre,
        afficherSucces: vi.fn<(message: string) => void>(),
        afficherErreur: vi.fn<(message: string) => void>(),
      },
      pendantAppel,
    };
  }

  it("la Server Function reçoit la référence, le statut vu et le statut demandé", async () => {
    const { deps } = dependances(async () => succes({ statut: "en_cours" as const, modifiee: null }));
    await envoyerChangementStatut(deps);
    expect(deps.changer).toHaveBeenCalledWith({ reference: REFERENCE, statutVu: "nouvelle", nouveauStatut: "en_cours" });
  });

  it("réussite : toast de succès, encadré retiré au départ puis laissé vide, verrou fermé pendant l'envoi et rouvert", async () => {
    const { deps, pendantAppel } = dependances(async () => succes({ statut: "en_cours" as const, modifiee: null }));
    await envoyerChangementStatut(deps);
    expect(pendantAppel).toEqual({ encadre: [null], verrou: [true] });
    expect(deps.afficherSucces).toHaveBeenCalledWith("Statut mis à jour");
    expect(deps.afficherErreur).not.toHaveBeenCalled();
    expect(deps.afficherEncadre.mock.calls).toEqual([[null], [null]]);
    expect(deps.envoiVerrouille.current).toBe(false);
  });

  it("réussite après un collègue : toast de succès et encadré", async () => {
    const { deps } = dependances(async () => succes({ statut: "traitee" as const, modifiee: MODIFIEE }));
    await envoyerChangementStatut(deps);
    expect(deps.afficherSucces).toHaveBeenCalledWith("Statut mis à jour");
    expect(deps.afficherEncadre.mock.calls).toEqual([[null], [MODIFIEE]]);
  });

  it("conflit : encadré seul, aucun toast, verrou rouvert", async () => {
    const { deps } = dependances(async () => echec("CONFLIT", MODIFIEE));
    await envoyerChangementStatut(deps);
    expect(deps.afficherSucces).not.toHaveBeenCalled();
    expect(deps.afficherErreur).not.toHaveBeenCalled();
    expect(deps.afficherEncadre.mock.calls).toEqual([[null], [MODIFIEE]]);
    expect(deps.envoiVerrouille.current).toBe(false);
  });

  it("panne : toast d'erreur, pas d'encadré", async () => {
    const { deps } = dependances(async () => echec("ERREUR_INTERNE", "Une erreur inattendue s'est produite."));
    await envoyerChangementStatut(deps);
    expect(deps.afficherErreur).toHaveBeenCalledWith("Le statut n'a pas pu être modifié. Réessayez.");
    expect(deps.afficherSucces).not.toHaveBeenCalled();
    expect(deps.afficherEncadre.mock.calls).toEqual([[null], [null]]);
  });

  it("réseau coupé : toast d'erreur, comme une panne, verrou rouvert", async () => {
    const { deps } = dependances(async () => {
      throw new TypeError("fetch failed");
    });
    await envoyerChangementStatut(deps);
    expect(deps.afficherErreur).toHaveBeenCalledWith("Le statut n'a pas pu être modifié. Réessayez.");
    expect(deps.envoiVerrouille.current).toBe(false);
  });

  it("second envoi pendant le premier : la Server Function n'est appelée qu'une fois", async () => {
    let repondre: (reponse: Reponse) => void = () => {};
    let appels = 0;
    // Le premier appel attend `repondre` ; les suivants répondent aussitôt.
    const { deps } = dependances(() =>
      appels++ === 0
        ? new Promise<Reponse>((resolve) => (repondre = resolve))
        : Promise.resolve(succes({ statut: "en_cours" as const, modifiee: null })),
    );
    const premier = envoyerChangementStatut(deps);
    await envoyerChangementStatut({ ...deps, nouveauStatut: "traitee" });
    expect(deps.changer).toHaveBeenCalledTimes(1);
    expect(deps.envoiVerrouille.current).toBe(true);
    repondre(succes({ statut: "en_cours" as const, modifiee: null }));
    await premier;
    expect(deps.envoiVerrouille.current).toBe(false);
    // Une fois rouvert, un nouvel envoi part.
    await envoyerChangementStatut(deps);
    expect(deps.changer).toHaveBeenCalledTimes(2);
  });

  it("verrou déjà fermé : rien n'est envoyé ni affiché", async () => {
    const { deps } = dependances(async () => succes({ statut: "en_cours" as const, modifiee: null }));
    deps.envoiVerrouille.current = true;
    await envoyerChangementStatut(deps);
    expect(deps.changer).not.toHaveBeenCalled();
    expect(deps.afficherEncadre).not.toHaveBeenCalled();
    expect(deps.afficherSucces).not.toHaveBeenCalled();
  });
});

describe("toasts (EXPERIENCE.md : succès 5 s, erreur jusqu'à fermeture)", () => {
  it("succès : durée par défaut du Toaster (5 s)", () => {
    afficherSucces("Statut mis à jour");
    expect(toasts.success).toHaveBeenCalledWith("Statut mis à jour");
  });

  it("erreur : reste jusqu'à fermeture, avec un bouton pour la fermer", () => {
    afficherErreur("Le statut n'a pas pu être modifié. Réessayez.");
    expect(toasts.error).toHaveBeenCalledWith("Le statut n'a pas pu être modifié. Réessayez.", {
      id: "Le statut n'a pas pu être modifié. Réessayez.",
      duration: Infinity,
      closeButton: true,
    });
  });

  it("erreur répétée : même identifiant, le toast affiché est remplacé au lieu d'en empiler un autre", () => {
    afficherErreur("Le statut n'a pas pu être modifié. Réessayez.");
    afficherErreur("Le statut n'a pas pu être modifié. Réessayez.");
    const ids = toasts.error.mock.calls.map(([, options]) => (options as { id?: unknown }).id);
    expect(ids).toEqual(["Le statut n'a pas pu être modifié. Réessayez.", "Le statut n'a pas pu être modifié. Réessayez."]);
  });

  it("bouton de fermeture : nommé en français, croix lucide, habillé avec les tokens", () => {
    const source = readFileSync(join(process.cwd(), "src/components/ui/sonner.tsx"), "utf8");
    expect(source).toContain("closeButtonAriaLabel: MESSAGE_FERMER_NOTIFICATION");
    expect(source).toMatch(/close: <X aria-hidden="true"/);
    expect(source).toMatch(/closeButton:\s*\n?\s*"order-last/);
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

});

describe("écran I4 complet", () => {
  it.each([
    ["nouvelle", ["Passer En cours", "Marquer Traitée"]],
    ["en_cours", ["Marquer Traitée"]],
    ["traitee", ["Rouvrir (En cours)"]],
  ] as const)("%s : panneau avec ses boutons, un seul bouton principal au plus", async (statut, libelles) => {
    simulation.demandes[0] = { ...CLAIRE, statut, date_cloture: statut === "traitee" ? "2026-11-20T09:00:00+00:00" : null };
    const html = await ecran();
    const panneau = html.match(/<aside[^>]*data-slot="panneau-statut".*?<\/aside>/)?.[0] ?? "";
    expect(boutons(panneau).map((b) => b.libelle)).toEqual(libelles);
    expect(html.match(/data-variant="principal"/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it("Traitée : « Clôturée le » dans Informations, en heure de Paris", async () => {
    simulation.demandes[0] = { ...CLAIRE, statut: "traitee", date_cloture: "2026-11-20T09:00:00+00:00" };
    const informations = bloc(await ecran(), "Informations");
    expect(texteDe(informations)).toBe(
      "Informations Catégorie Problème technique Canal Formulaire Déposée le 8 nov. 2026, 8 h 47 Clôturée le 20 nov. 2026, 10 h 00",
    );
    expect(informations).toContain('<time dateTime="2026-11-20T09:00:00.000Z">');
  });

  it.each(["nouvelle", "en_cours"] as const)("%s : pas de date de clôture", async (statut) => {
    simulation.demandes[0] = { ...CLAIRE, statut };
    expect(texteDe(await ecran())).not.toContain("Clôturée");
  });

  it("historique : « Statut : ancien → nouveau », nom de l'auteur interne, heure", async () => {
    simulation.demandes[0] = {
      ...CLAIRE,
      statut: "traitee",
      date_cloture: "2026-11-08T08:12:00+00:00",
      evenements: [
        { type: "creation", auteur: "demandeur", date: "2026-11-08T07:47:00+00:00" },
        { type: "statut", auteur: null, auteur_nom: "Lucas Bernard", ancien_statut: "nouvelle", nouveau_statut: "en_cours", date: "2026-11-08T08:11:00+00:00" },
        { type: "statut", auteur: null, auteur_nom: "Karim Benali", ancien_statut: "en_cours", nouveau_statut: "traitee", date: "2026-11-08T08:12:00+00:00" },
      ],
    };
    const lignes = [...bloc(await ecran(), "Historique").matchAll(/<li data-slot="evenement".*?<\/li>/g)].map(([l]) => texteDe(l));
    expect(lignes).toEqual([
      "Demande créée Demandeur · 8 nov. 2026, 8 h 47",
      "Statut : Nouvelle → En cours Lucas Bernard · 8 nov. 2026, 9 h 11",
      "Statut : En cours → Traitée Karim Benali · 8 nov. 2026, 9 h 12",
    ]);
    expect(libelleChangementStatut("traitee", "en_cours")).toBe("Statut : Traitée → En cours");
  });

  it("après « Passer En cours » : badge, historique et boutons relus depuis la base", async () => {
    const { actionChangerStatut } = await import("@/server/actions/changer-statut");
    await actionChangerStatut({ reference: REFERENCE, statutVu: "nouvelle", nouveauStatut: "en_cours" });
    const html = await ecran();
    expect(html).toMatch(/<h1[^>]*>[^<]*<\/h1><span data-slot="badge-statut" data-statut="en_cours"/);
    expect(texteDe(bloc(html, "Historique"))).toBe(
      "Historique Demande créée Demandeur · 8 nov. 2026, 8 h 47 Statut : Nouvelle → En cours Karim Benali · 20 nov. 2026, 10 h 00",
    );
    const panneau = html.match(/<aside[^>]*data-slot="panneau-statut".*?<\/aside>/)?.[0] ?? "";
    expect(boutons(panneau).map((b) => b.libelle)).toEqual(["Marquer Traitée"]);
  });
});

describe("thème compilé (AD-19) : chaque classe du panneau et de la fenêtre existe", () => {
  let css = "";
  const fichierCss = join(process.cwd(), "src", "app", "globals.css");

  beforeAll(async () => {
    const compilateur = await compile(readFileSync(fichierCss, "utf8"), {
      base: dirname(fichierCss),
      from: fichierCss,
      onDependency: () => {},
    });
    css = compilateur.build([
      "bg-text/45",
      "shadow-dialog",
      "max-w-[440px]",
      "order-last",
      "hover:bg-background/15",
      "text-section-title",
      "animate-spin",
    ]);
  });

  it.each(["bg-text/45", "shadow-dialog", "max-w-[440px]", "order-last", "hover:bg-background/15", "text-section-title", "animate-spin"])(
    "%s",
    (classe) => {
      // La classe telle qu'elle s'écrit dans un sélecteur CSS.
      expect(css).toContain(`.${classe.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)}`);
    },
  );
});

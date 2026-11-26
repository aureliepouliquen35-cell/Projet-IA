import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// « Réinitialiser le mot de passe » de l'écran A1 (story 3.5 ; EXPERIENCE.md,
// A1 ; FR-23), rendu en HTML sans navigateur : le bouton de la ligne, la
// fenêtre (titre, texte, champ avec « Générer », « Annuler » et
// « Réinitialiser »), « 12 caractères minimum », la panne, l'envoi en cours,
// l'affichage unique du mot de passe avec « Copier », le réducteur et
// l'envoi (verrou, toast). La Server Function est simulée.

const reinitialiserAction = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/reinitialiser-mot-de-passe", () => ({
  actionReinitialiserMotDePasse: reinitialiserAction,
}));
// Les autres actions de la ligne ne sont pas appelées ici.
vi.mock("@/server/actions/changer-etat-compte", () => ({ actionChangerEtatCompte: vi.fn() }));
vi.mock("@/server/actions/modifier-compte", () => ({ actionModifierCompte: vi.fn() }));

import {
  actionApresReponseReinitialisation,
  actionFermetureReinitialisation,
  changerOuvertureReinitialisation,
  envoyerReinitialisation,
  ETAT_REINITIALISATION_INITIAL,
  idChampReinitialisation,
  preparerEnvoiReinitialisation,
  reduireReinitialisation,
  ReinitialiserMotDePasse,
  VueReinitialiserMotDePasse,
  type ActionReinitialisation,
  type EtatReinitialisation,
} from "@/components/interne/reinitialiser-mot-de-passe";
import { TableauComptes } from "@/components/interne/tableau-comptes";
import { Dialog } from "@/components/ui/dialog";
import { MESSAGE_ERREUR_INATTENDUE, MESSAGES_COMPTE } from "@/shared/messages";
import { echec, succes } from "@/shared/reponse";

import { texteDe } from "../aides/formulaire-depot";

const MOT_DE_PASSE = "Kp7mWq2xTz9aBc4d";
const LUCAS = { id: "7e2a9c41-3b5d-4f68-9a0c-2d4e6f8a1b3c", nom: "Lucas Bernard" };
const REPONSE_LUCAS = { ...LUCAS, email: "lucas.bernard@nova-services.example" };
const TITRE = "Réinitialiser le mot de passe de Lucas Bernard";
const TEXTE =
  "L'ancien mot de passe ne fonctionnera plus. Lucas devra choisir un nouveau mot de passe à sa prochaine connexion.";
const PANNE = "Le mot de passe n'a pas pu être réinitialisé. Réessayez.";
const ID_CHAMP = idChampReinitialisation(LUCAS.id);

/** Contenu de la fenêtre : `Dialog` ouvert fournit le contexte du titre (sans portail). */
const rendre = (etat: Partial<EtatReinitialisation> = {}, envoiEnCours = false) =>
  renderToStaticMarkup(
    <Dialog open>
      <VueReinitialiserMotDePasse
        compte={LUCAS}
        etat={{ ...ETAT_REINITIALISATION_INITIAL, ...etat }}
        envoiEnCours={envoiEnCours}
      />
    </Dialog>,
  );

const controle = (html: string, id: string) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";

const appliquer = (actions: ActionReinitialisation[], depart: EtatReinitialisation = ETAT_REINITIALISATION_INITIAL) =>
  actions.reduce(reduireReinitialisation, depart);

afterEach(() => {
  vi.restoreAllMocks();
  reinitialiserAction.mockReset();
});

describe("bouton de la ligne", () => {
  it("« Réinitialiser le mot de passe », secondaire, nom accessible avec le nom du compte ; fenêtre fermée d'avance", () => {
    const html = renderToStaticMarkup(<ReinitialiserMotDePasse compte={LUCAS} />);
    expect(html).toMatch(/^<button[^>]*data-slot="reinitialiser-mot-de-passe"[^>]*>/);
    expect(html).toContain('data-variant="secondaire"');
    expect(html).toContain(`aria-label="${TITRE}"`);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(texteDe(html)).toBe("Réinitialiser le mot de passe");
    expect(html).not.toMatch(/<form|<input/);
  });

  it("sur chaque ligne d'A1, compte actif ou désactivé, avant « Désactiver » ou « Réactiver »", () => {
    const html = renderToStaticMarkup(
      <TableauComptes
        comptes={[
          { ...REPONSE_LUCAS, role: "collaborateur", actif: true },
          { id: "5d1e2f3a-4b5c-4d6e-8f70-819203a4b5c6", nom: "Sophie Martin", email: "s@exemple.fr", role: "administrateur", actif: false },
        ]}
      />,
    );
    const lignes = html.split('data-slot="ligne-compte"').slice(1);
    expect(lignes).toHaveLength(2);
    for (const ligne of lignes) {
      expect(ligne).toContain('data-slot="reinitialiser-mot-de-passe"');
      expect(ligne.indexOf("reinitialiser-mot-de-passe")).toBeLessThan(ligne.search(/data-slot="(desactiver|reactiver)"/));
    }
    expect(html).toContain('aria-label="Réinitialiser le mot de passe de Sophie Martin"');
    // « Modifier » (story 3.3) vient avant, en premier.
    for (const ligne of lignes) {
      expect(ligne).toContain('data-slot="modifier-compte"');
      expect(ligne.indexOf('data-slot="modifier-compte"')).toBeLessThan(ligne.indexOf("reinitialiser-mot-de-passe"));
    }
  });
});

describe("fenêtre : formulaire", () => {
  it("titre, texte de l'UX avec le prénom, champ « Nouveau mot de passe temporaire * » avec « Générer »", () => {
    const html = rendre();
    expect(html).toMatch(new RegExp(`<h2[^>]*>${TITRE}</h2>`));
    expect(html).toMatch(new RegExp(`<p[^>]*data-slot="dialog-description"[^>]*>${TEXTE.replace("'", "&#x27;")}</p>`));
    expect(texteDe(html)).toContain(TEXTE);
    expect(html).toMatch(new RegExp(`<label[^>]*for="${ID_CHAMP}"[^>]*>Nouveau mot de passe temporaire<span aria-hidden="true" class="text-danger"> \\*</span></label>`));
    const champ = controle(html, ID_CHAMP);
    expect(champ).toContain('type="text"');
    expect(champ).toContain('required=""');
    expect(champ).toContain('autoComplete="off"');
    expect(html).toMatch(/<button[^>]*data-slot="generer"[^>]*aria-label="Générer un mot de passe temporaire"[^>]*>[\s\S]*?Générer<\/button>/);
  });

  it("prénom : premier mot du nom", () => {
    const html = renderToStaticMarkup(
      <Dialog open>
        <VueReinitialiserMotDePasse compte={{ id: LUCAS.id, nom: "  Anne-Marie  Dupont " }} etat={ETAT_REINITIALISATION_INITIAL} />
      </Dialog>,
    );
    expect(texteDe(html)).toContain("Anne-Marie devra choisir un nouveau mot de passe");
  });

  it("boutons : « Annuler » (secondaire) puis « Réinitialiser » (principal, envoi)", () => {
    const html = rendre();
    const pied = html.match(/<div data-slot="dialog-footer"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
    const boutons = [...pied.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)];
    expect(boutons.map(([, , texte]) => texte)).toEqual(["Annuler", "Réinitialiser"]);
    expect(boutons[0][1]).toMatch(/data-variant="secondaire"/);
    expect(boutons[0][1]).toMatch(/type="button"/);
    expect(boutons[1][1]).toMatch(/data-variant="principal"/);
    expect(boutons[1][1]).toMatch(/type="submit"/);
    expect(html).toContain("noValidate");
  });

  it("aucun mot de passe affiché ni « Copier » avant l'envoi", () => {
    const html = rendre();
    expect(html).not.toContain('data-slot="mot-de-passe-reinitialise"');
    expect(html).not.toContain("Copier");
  });

  it("identifiant du champ unique par ligne", () => {
    expect(idChampReinitialisation("a")).not.toBe(idChampReinitialisation("b"));
  });
});

describe("fenêtre : erreur, panne, envoi", () => {
  it("« 12 caractères minimum » sous le champ, relié (aria-invalid, aria-describedby)", () => {
    const html = rendre({ motDePasse: "court", erreur: "12 caractères minimum" });
    const champ = controle(html, ID_CHAMP);
    expect(champ).toContain('aria-invalid="true"');
    expect(champ).toContain(`aria-describedby="${ID_CHAMP}-erreur"`);
    expect(html).toMatch(new RegExp(`<p id="${ID_CHAMP}-erreur"[^>]*>[\\s\\S]*?12 caractères minimum</p>`));
    expect(champ).toContain('value="court"');
  });

  it("panne : encadré « Le mot de passe n'a pas pu être réinitialisé. Réessayez. », saisie gardée", () => {
    const html = rendre({ motDePasse: MOT_DE_PASSE, panne: PANNE });
    expect(html).toContain('data-slot="panne-reinitialisation"');
    expect(html).toMatch(/role="alert"/);
    expect(texteDe(html)).toContain(PANNE);
    expect(MESSAGES_COMPTE.reinitialisationImpossible).toBe(PANNE);
    expect(controle(html, ID_CHAMP)).toContain(`value="${MOT_DE_PASSE}"`);
  });

  it("accès refusé : « Accès refusé. » dans l'encadré, sans « Réessayez »", () => {
    const html = rendre({ motDePasse: MOT_DE_PASSE, panne: "Accès refusé." });
    expect(texteDe(html)).toContain("Accès refusé.");
    expect(texteDe(html)).not.toContain("Réessayez");
  });

  it("envoi en cours : saisie figée, « Annuler » et l'envoi désactivés, « Réinitialisation… »", () => {
    const html = rendre({ motDePasse: MOT_DE_PASSE }, true);
    expect(html).toMatch(/<fieldset disabled=""/);
    const boutons = [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)];
    const annuler = boutons.find(([, attributs]) => attributs.includes('data-slot="annuler"'))!;
    const envoi = boutons.find(([, attributs]) => attributs.includes('type="submit"'))!;
    expect(annuler[1]).toContain('disabled=""');
    expect(envoi[1]).toContain('disabled=""');
    expect(texteDe(envoi[2])).toBe("Réinitialisation…");
    expect(html).toContain('aria-busy="true"');
  });
});

describe("fenêtre : mot de passe affiché une seule fois", () => {
  it("mot de passe en lecture seule avec « Copier », un seul bouton « Fermer »", () => {
    const html = rendre({ reinitialise: MOT_DE_PASSE });
    expect(html).not.toContain("<form");
    expect(texteDe(html)).toBe(`${TITRE} ${TEXTE} Mot de passe réinitialisé Nouveau mot de passe temporaire Copier Fermer`);
    const champ = controle(html, `${ID_CHAMP}-affiche`);
    expect(champ).toContain("readOnly");
    expect(champ).toContain(`value="${MOT_DE_PASSE}"`);
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toMatch(/data-slot="copier"[^>]*>[\s\S]*?Copier<\/button>/);
    expect(html).toMatch(/data-slot="fermer"[^>]*>Fermer<\/button>/);
    expect(html).not.toMatch(/Annuler|Générer|>Réinitialiser</);
    // Affiché une seule fois : il n'apparaît qu'à un seul endroit.
    expect(html.split(MOT_DE_PASSE)).toHaveLength(2);
  });

  it("« Mot de passe réinitialisé » annoncé dans la fenêtre ; « Copié » après une copie", () => {
    expect(rendre({ reinitialise: MOT_DE_PASSE })).toMatch(
      /<p role="status" aria-live="polite" data-slot="annonce-reinitialisation" class="sr-only">Mot de passe réinitialisé<\/p>/,
    );
    const copie = rendre({ reinitialise: MOT_DE_PASSE, copie: true });
    expect(copie).toMatch(/data-slot="copier"[^>]*>[\s\S]*?Copié<\/button>/);
    expect(copie).toMatch(/<span aria-live="polite" class="sr-only">Copié<\/span>/);
  });
});

describe("réducteur", () => {
  it("« Générer » remplace la saisie et efface son erreur", () => {
    const refuse = appliquer([
      { type: "saisie", valeur: "court" },
      { type: "refus", message: "12 caractères minimum" },
    ]);
    expect(refuse).toMatchObject({ erreur: "12 caractères minimum", appelsChamp: 1 });
    const genere = appliquer([{ type: "generation", motDePasse: MOT_DE_PASSE }], refuse);
    expect(genere).toMatchObject({ motDePasse: MOT_DE_PASSE, erreur: null });
  });

  it("un message reste tant que le champ n'est pas corrigé, puis disparaît", () => {
    const refuse = appliquer([{ type: "refus", message: "12 caractères minimum" }]);
    expect(appliquer([{ type: "saisie", valeur: "toujours" }], refuse).erreur).toBe("12 caractères minimum");
    expect(appliquer([{ type: "saisie", valeur: "assez long maintenant" }], refuse).erreur).toBeNull();
    // Avant tout refus, la saisie n'affiche rien.
    expect(appliquer([{ type: "saisie", valeur: "x" }]).erreur).toBeNull();
  });

  it("panne : encadré, saisie gardée ; un nouvel envoi l'efface", () => {
    const panne = appliquer([{ type: "saisie", valeur: MOT_DE_PASSE }, { type: "panne", message: PANNE }]);
    expect(panne).toMatchObject({ panne: PANNE, motDePasse: MOT_DE_PASSE, appelsEncadre: 1 });
    expect(appliquer([{ type: "envoi" }], panne).panne).toBeNull();
  });

  it("réussite : la saisie est oubliée, seul le mot de passe affiché reste ; « Copier » → « Copié »", () => {
    const fait = appliquer([{ type: "saisie", valeur: "autre chose" }, { type: "reussite", motDePasse: MOT_DE_PASSE }]);
    expect(fait).toEqual({ ...ETAT_REINITIALISATION_INITIAL, reinitialise: MOT_DE_PASSE });
    expect(appliquer([{ type: "copie" }], fait).copie).toBe(true);
    expect(appliquer([{ type: "copie" }]).copie).toBe(false);
  });

  it("fermeture : tout est oublié, mot de passe compris", () => {
    const ferme = appliquer([
      { type: "reussite", motDePasse: MOT_DE_PASSE },
      { type: "copie" },
      { type: "reinitialisation" },
    ]);
    expect(ferme).toEqual(ETAT_REINITIALISATION_INITIAL);
    expect(JSON.stringify(ferme)).not.toContain(MOT_DE_PASSE);
  });
});

describe("réponse de la Server Function", () => {
  it("réussite : affichage du mot de passe saisi (la réponse ne le contient pas)", () => {
    expect(actionApresReponseReinitialisation(succes(REPONSE_LUCAS), MOT_DE_PASSE)).toEqual({
      type: "reussite",
      motDePasse: MOT_DE_PASSE,
    });
  });

  it("VALIDATION sur le mot de passe : message sous le champ", () => {
    expect(
      actionApresReponseReinitialisation(
        echec("VALIDATION", "1 champ est à corriger", { champs: { motDePasseTemporaire: "12 caractères minimum" } }),
        MOT_DE_PASSE,
      ),
    ).toEqual({ type: "refus", message: "12 caractères minimum" });
  });

  it("ACCES_REFUSE : « Accès refusé. » dans l'encadré, pas le message de panne", () => {
    expect(actionApresReponseReinitialisation(echec("ACCES_REFUSE", "autre texte"), MOT_DE_PASSE)).toEqual({
      type: "panne",
      message: "Accès refusé.",
    });
  });

  it.each([
    echec("ERREUR_INTERNE", "message technique", { codeSupport: "ABC123" }),
    echec("INTROUVABLE", "Introuvable"),
    echec("VALIDATION", "1 champ est à corriger", { champs: { compteId: "Le compte demandé n'est pas valide." } }),
    echec("CONFLIT", "Conflit"),
  ])("toute autre réponse : panne avec le message de l'UX (%j)", (reponse) => {
    expect(actionApresReponseReinitialisation(reponse, MOT_DE_PASSE)).toEqual({ type: "panne", message: PANNE });
  });
});

describe("envoi", () => {
  it("moins de 12 caractères : « 12 caractères minimum », rien n'est envoyé, verrou ouvert", () => {
    const verrou = { current: false };
    expect(preparerEnvoiReinitialisation("onze caract", verrou)).toEqual({
      type: "refus",
      message: "12 caractères minimum",
    });
    expect(preparerEnvoiReinitialisation("", verrou)).toMatchObject({ type: "refus" });
    expect(verrou.current).toBe(false);
  });

  it("double clic : un seul envoi", async () => {
    const verrou = { current: false };
    const reinitialiser = vi.fn(async () => succes(REPONSE_LUCAS));
    const cliquer = () => {
      const debut = preparerEnvoiReinitialisation(MOT_DE_PASSE, verrou);
      if (debut.type === "envoi") {
        void envoyerReinitialisation({
          compteId: LUCAS.id,
          motDePasse: MOT_DE_PASSE,
          reinitialiser,
          agir: () => {},
          apresReussite: () => {},
          envoiVerrouille: verrou,
        });
      }
      return debut;
    };
    expect(cliquer()).toEqual({ type: "envoi" });
    expect(cliquer()).toEqual({ type: "ignore" });
    await vi.waitFor(() => expect(verrou.current).toBe(false));
    expect(reinitialiser).toHaveBeenCalledExactlyOnceWith({ compteId: LUCAS.id, motDePasseTemporaire: MOT_DE_PASSE });
  });

  it("réussite : mot de passe affiché, puis toast ; verrou rouvert", async () => {
    const verrou = { current: true };
    const agir = vi.fn();
    const apresReussite = vi.fn();
    await envoyerReinitialisation({
      compteId: LUCAS.id,
      motDePasse: MOT_DE_PASSE,
      reinitialiser: async () => succes(REPONSE_LUCAS),
      agir,
      apresReussite,
      envoiVerrouille: verrou,
    });
    expect(agir).toHaveBeenCalledExactlyOnceWith({ type: "reussite", motDePasse: MOT_DE_PASSE });
    expect(apresReussite).toHaveBeenCalledTimes(1);
    expect(verrou.current).toBe(false);
  });

  it("réseau coupé : panne, pas de toast, verrou rouvert", async () => {
    const verrou = { current: true };
    const agir = vi.fn();
    const apresReussite = vi.fn();
    await envoyerReinitialisation({
      compteId: LUCAS.id,
      motDePasse: MOT_DE_PASSE,
      reinitialiser: async () => {
        throw new TypeError("Failed to fetch");
      },
      agir,
      apresReussite,
      envoiVerrouille: verrou,
    });
    expect(agir).toHaveBeenCalledExactlyOnceWith({ type: "panne", message: PANNE });
    expect(apresReussite).not.toHaveBeenCalled();
    expect(verrou.current).toBe(false);
    expect(MESSAGE_ERREUR_INATTENDUE).not.toBe(PANNE);
  });

  it("redirection du serveur (session terminée) : relancée, verrou rouvert, rien d'autre", async () => {
    const verrou = { current: true };
    const agir = vi.fn();
    const redirection = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/connexion;307;" });
    await expect(
      envoyerReinitialisation({
        compteId: LUCAS.id,
        motDePasse: MOT_DE_PASSE,
        reinitialiser: async () => {
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

  it("fermeture refusée pendant l'envoi ; sinon tout est oublié", () => {
    expect(actionFermetureReinitialisation({ current: true })).toBeNull();
    expect(actionFermetureReinitialisation({ current: false })).toEqual({ type: "reinitialisation" });
  });
});

describe("ouverture et fermeture de la fenêtre", () => {
  const dependances = () => ({ agir: vi.fn(), setOuverte: vi.fn() });

  it("fermeture hors envoi : saisie et mot de passe oubliés, puis fenêtre fermée", () => {
    const deps = dependances();
    changerOuvertureReinitialisation(false, { current: false }, deps);
    expect(deps.agir).toHaveBeenCalledExactlyOnceWith({ type: "reinitialisation" });
    expect(deps.setOuverte).toHaveBeenCalledExactlyOnceWith(false);
    expect(deps.agir.mock.invocationCallOrder[0]).toBeLessThan(deps.setOuverte.mock.invocationCallOrder[0]);
  });

  it("fermeture pendant l'envoi (Échap, « Annuler ») : ignorée", () => {
    const deps = dependances();
    changerOuvertureReinitialisation(false, { current: true }, deps);
    expect(deps.agir).not.toHaveBeenCalled();
    expect(deps.setOuverte).not.toHaveBeenCalled();
  });

  it("ouverture : la fenêtre s'ouvre, rien d'autre", () => {
    const deps = dependances();
    changerOuvertureReinitialisation(true, { current: false }, deps);
    expect(deps.agir).not.toHaveBeenCalled();
    expect(deps.setOuverte).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("après fermeture, le mot de passe affiché ne revient pas à la réouverture", () => {
    let etat = appliquer([{ type: "reussite", motDePasse: MOT_DE_PASSE }]);
    const deps = { agir: (action: ActionReinitialisation) => (etat = reduireReinitialisation(etat, action)), setOuverte: vi.fn() };
    changerOuvertureReinitialisation(false, { current: false }, deps);
    changerOuvertureReinitialisation(true, { current: false }, deps);
    expect(etat).toEqual(ETAT_REINITIALISATION_INITIAL);
    expect(rendre(etat)).not.toContain(MOT_DE_PASSE);
  });
});

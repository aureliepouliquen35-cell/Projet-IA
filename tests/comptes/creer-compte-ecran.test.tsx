import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Fenêtre « Créer un compte » de l'écran A1 (story 3.2 ; EXPERIENCE.md, A1 ;
// FR-21, RM-8), rendue en HTML sans navigateur : le bouton, le formulaire
// (Nom, Email, Rôle « Collaborateur » d'avance, Mot de passe temporaire avec
// « Générer », aide), les erreurs sous les champs, la panne, l'envoi en
// cours, l'affichage unique du mot de passe avec « Copier », le réducteur
// (Générer, correction, refus, réussite, fermeture) et l'envoi (verrou,
// toast). La Server Function est simulée.

const creerCompte = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/creer-compte", () => ({ actionCreerCompte: creerCompte }));

import {
  actionApresReponseCreation,
  actionFermeture,
  CreerCompte,
  envoyerCreation,
  ETAT_CREATION_INITIAL,
  idChampCompte,
  listerErreursCompte,
  preparerEnvoiCreation,
  reduireCreation,
  VALEURS_COMPTE_VIDES,
  VueCreerCompte,
  type ActionCreation,
  type EtatCreation,
  type ValeursCompte,
} from "@/components/interne/creer-compte";
import { Dialog } from "@/components/ui/dialog";
import { ALPHABET_MOT_DE_PASSE, genererMotDePasseTemporaire } from "@/shared/mot-de-passe-temporaire";
import { MESSAGE_ERREUR_INATTENDUE, MESSAGES_COMPTE } from "@/shared/messages";
import { echec, succes } from "@/shared/reponse";

import { texteDe } from "../aides/formulaire-depot";

const MOT_DE_PASSE = "Kp7mWq2xTz9aBc4d";
const LUCAS: ValeursCompte = {
  nom: "Lucas Bernard",
  email: "lucas.bernard@nova-services.example",
  role: "collaborateur",
  motDePasseTemporaire: MOT_DE_PASSE,
};
const COMPTE_LUCAS = {
  id: "7e2a9c41-3b5d-4f68-9a0c-2d4e6f8a1b3c",
  nom: "Lucas Bernard",
  email: "lucas.bernard@nova-services.example",
  role: "collaborateur" as const,
};
const AIDE = "Transmettez ce mot de passe vous-même à la personne. Elle devra le changer à sa première connexion.";
const DEJA_UTILISE = "Cet email est déjà utilisé par un autre compte.";

/** Contenu de la fenêtre : `Dialog` ouvert fournit le contexte du titre (sans portail). */
const rendre = (etat: Partial<EtatCreation> = {}, envoiEnCours = false) =>
  renderToStaticMarkup(
    <Dialog open>
      <VueCreerCompte etat={{ ...ETAT_CREATION_INITIAL, ...etat }} envoiEnCours={envoiEnCours} />
    </Dialog>,
  );

/** Le contrôle d'identifiant `id`, en HTML. */
const controle = (html: string, id: string) =>
  html.match(new RegExp(`<(?:input|select)[^>]*id="${id}"[^>]*>`))?.[0] ?? "";

const appliquer = (actions: ActionCreation[], depart: EtatCreation = ETAT_CREATION_INITIAL) =>
  actions.reduce(reduireCreation, depart);

afterEach(() => {
  vi.restoreAllMocks();
  creerCompte.mockReset();
});

describe("bouton « Créer un compte »", () => {
  it("bouton principal qui ouvre une fenêtre, fermée d'avance (rien de la fenêtre dans la page)", () => {
    const html = renderToStaticMarkup(<CreerCompte />);
    expect(html).toMatch(/^<button[^>]*data-slot="bouton-creer-compte"[^>]*>/);
    expect(html).toContain('data-variant="principal"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(texteDe(html)).toBe("Créer un compte");
    expect(html).not.toMatch(/<form|<input/);
  });
});

describe("fenêtre : formulaire", () => {
  it("titre « Créer un compte », puis Nom *, Email *, Rôle *, Mot de passe temporaire *, dans cet ordre", () => {
    const html = rendre();
    expect(html).toMatch(/<h2[^>]*>Créer un compte<\/h2>/);
    const etiquettes = [...html.matchAll(/<label[^>]*for="(compte-[^"]+)"[^>]*>([^<]*)/g)].map(([, pour, texte]) => [
      pour,
      texte,
    ]);
    expect(etiquettes).toEqual([
      ["compte-nom", "Nom"],
      ["compte-email", "Email"],
      ["compte-role", "Rôle"],
      ["compte-motDePasseTemporaire", "Mot de passe temporaire"],
    ]);
    // Astérisque rouge après chaque étiquette, et `required` sur chaque contrôle.
    expect(html.match(/<span aria-hidden="true" class="text-danger"> \*<\/span>/g)).toHaveLength(4);
    for (const champ of ["nom", "email", "role", "motDePasseTemporaire"] as const) {
      expect(controle(html, idChampCompte(champ))).toContain('required=""');
    }
  });

  it("rôle « Collaborateur » choisi d'avance ; deux rôles proposés", () => {
    const html = rendre();
    const options = [...html.matchAll(/<option[^>]*value="(\w+)"[^>]*>([^<]*)<\/option>/g)].map(([balise, valeur, texte]) => [
      valeur,
      texte,
      balise.includes("selected"),
    ]);
    expect(options).toEqual([
      ["collaborateur", "Collaborateur", true],
      ["administrateur", "Administrateur", false],
    ]);
  });

  it("mot de passe en clair, avec « Générer » à côté et l'aide reliée au champ", () => {
    const html = rendre({ valeurs: { ...VALEURS_COMPTE_VIDES, motDePasseTemporaire: MOT_DE_PASSE } });
    const champ = controle(html, "compte-motDePasseTemporaire");
    expect(champ).toContain('type="text"');
    expect(champ).toContain(`value="${MOT_DE_PASSE}"`);
    expect(champ).toContain('autoComplete="off"');
    expect(champ).toContain('aria-describedby="compte-motDePasseTemporaire-aide"');
    expect(html).toMatch(new RegExp(`<span id="compte-motDePasseTemporaire-aide">${AIDE}</span>`));
    expect(html).toMatch(/<button[^>]*data-slot="generer"[^>]*aria-label="Générer un mot de passe temporaire"[^>]*>[\s\S]*?Générer<\/button>/);
  });

  it("boutons : « Annuler » (secondaire) puis « Créer le compte » (principal, envoi)", () => {
    const html = rendre();
    const pied = html.match(/<div data-slot="dialog-footer"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
    const boutons = [...pied.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)];
    expect(boutons.map(([, , texte]) => texte)).toEqual(["Annuler", "Créer le compte"]);
    expect(boutons[0][1]).toMatch(/data-variant="secondaire"/);
    expect(boutons[0][1]).toMatch(/type="button"/);
    expect(boutons[1][1]).toMatch(/data-variant="principal"/);
    expect(boutons[1][1]).toMatch(/type="submit"/);
    expect(html).toContain("noValidate");
  });

  it("aucun mot de passe ni compte créé avant l'envoi", () => {
    const html = rendre();
    expect(html).not.toContain('data-slot="compte-cree"');
    expect(html).not.toContain("Copier");
  });
});

describe("fenêtre : erreurs sous les champs", () => {
  const erreurs = {
    nom: MESSAGES_COMPTE.nomObligatoire,
    email: DEJA_UTILISE,
    motDePasseTemporaire: "12 caractères minimum",
  };

  it("chaque message sous son champ, relié (aria-invalid, aria-describedby)", () => {
    const html = rendre({ erreurs, resumeVisible: true });
    for (const [champ, message] of Object.entries(erreurs)) {
      const id = idChampCompte(champ as keyof typeof erreurs);
      expect(controle(html, id)).toContain('aria-invalid="true"');
      expect(controle(html, id)).toMatch(new RegExp(`aria-describedby="[^"]*${id}-erreur`));
      expect(html).toMatch(new RegExp(`<p id="${id}-erreur"[^>]*>[\\s\\S]*?${message}</p>`));
    }
    expect(controle(html, "compte-role")).not.toContain('aria-invalid="true"');
  });

  it("« Cet email est déjà utilisé par un autre compte. » sous Email, saisie gardée", () => {
    const html = rendre({ valeurs: LUCAS, erreurs: { email: DEJA_UTILISE }, resumeVisible: true });
    expect(html).toMatch(/<p id="compte-email-erreur"[^>]*>[\s\S]*?Cet email est déjà utilisé par un autre compte\.<\/p>/);
    expect(controle(html, "compte-email")).toContain(`value="${LUCAS.email}"`);
    expect(controle(html, "compte-nom")).toContain(`value="${LUCAS.nom}"`);
    expect(controle(html, "compte-motDePasseTemporaire")).toContain(`value="${MOT_DE_PASSE}"`);
  });

  it("résumé en haut après un envoi refusé, avec un lien vers chaque champ, dans l'ordre de l'écran", () => {
    const html = rendre({ erreurs, resumeVisible: true });
    expect(html).toContain('data-slot="resume-erreurs"');
    expect(texteDe(html)).toContain("3 champs sont à corriger");
    expect([...html.matchAll(/<a[^>]*href="#([^"]+)"/g)].map(([, cible]) => cible)).toEqual([
      "compte-nom",
      "compte-email",
      "compte-motDePasseTemporaire",
    ]);
    expect(listerErreursCompte({ motDePasseTemporaire: "x", nom: "y" })).toEqual([
      { champ: "compte-nom", message: "y" },
      { champ: "compte-motDePasseTemporaire", message: "x" },
    ]);
  });

  it("panne : encadré « Le compte n'a pas pu être créé. Réessayez. », saisie gardée", () => {
    const html = rendre({ valeurs: LUCAS, panne: true });
    expect(html).toMatch(/data-slot="panne-creation"/);
    expect(html).toMatch(/role="alert"/);
    expect(texteDe(html)).toContain("Le compte n'a pas pu être créé. Réessayez.");
    expect(controle(html, "compte-nom")).toContain(`value="${LUCAS.nom}"`);
  });
});

describe("fenêtre : envoi en cours", () => {
  it("saisie figée, « Annuler » et l'envoi désactivés, indicateur sur le bouton", () => {
    const html = rendre({ valeurs: LUCAS }, true);
    expect(html).toMatch(/<fieldset disabled=""/);
    const boutons = [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)];
    const annuler = boutons.find(([, attributs]) => attributs.includes('data-slot="annuler"'))!;
    const envoi = boutons.find(([, attributs]) => attributs.includes('type="submit"'))!;
    expect(annuler[1]).toContain('disabled=""');
    expect(envoi[1]).toContain('disabled=""');
    expect(texteDe(envoi[2])).toBe("Création…");
    expect(html).toContain('aria-busy="true"');
  });
});

describe("fenêtre : compte créé, mot de passe affiché une seule fois", () => {
  const cree = { ...COMPTE_LUCAS, motDePasseTemporaire: MOT_DE_PASSE };

  it("nom, email, rôle, mot de passe en lecture seule avec « Copier », aide, un seul bouton « Fermer »", () => {
    const html = rendre({ cree });
    expect(html).not.toContain("<form");
    expect(texteDe(html)).toBe(
      `Créer un compte Compte créé Nom Lucas Bernard Email ${COMPTE_LUCAS.email} Rôle Collaborateur Mot de passe temporaire Copier ${AIDE} Fermer`,
    );
    const champ = controle(html, "compte-mot-de-passe-cree");
    expect(champ).toContain("readOnly");
    expect(champ).toContain(`value="${MOT_DE_PASSE}"`);
    expect(html).toMatch(/<label[^>]*for="compte-mot-de-passe-cree"[^>]*>Mot de passe temporaire<\/label>/);
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toMatch(/data-slot="copier"[^>]*>[\s\S]*?Copier<\/button>/);
    expect(html).toMatch(/data-slot="fermer"[^>]*>Fermer<\/button>/);
    expect(html).not.toMatch(/Annuler|Créer le compte|Générer/);
    // Affiché une seule fois : il n'apparaît qu'à un seul endroit.
    expect(html.split(MOT_DE_PASSE)).toHaveLength(2);
  });

  it("« Compte créé » annoncé dans la fenêtre (le toast, hors de la fenêtre, est caché aux lecteurs d'écran)", () => {
    expect(rendre({ cree })).toMatch(
      /<p role="status" aria-live="polite" data-slot="annonce-compte-cree" class="sr-only">Compte créé<\/p>/,
    );
    expect(rendre()).not.toContain("annonce-compte-cree");
  });

  it("après une copie réussie : « Copié », annoncé aux lecteurs d'écran", () => {
    const html = rendre({ cree, copie: true });
    expect(html).toMatch(/data-slot="copier"[^>]*>[\s\S]*?Copié<\/button>/);
    expect(html).toMatch(/<span aria-live="polite" class="sr-only">Copié<\/span>/);
  });
});

describe("réducteur", () => {
  it("état de départ : formulaire vierge, rôle Collaborateur, aucun mot de passe", () => {
    expect(ETAT_CREATION_INITIAL).toMatchObject({
      valeurs: { nom: "", email: "", role: "collaborateur", motDePasseTemporaire: "" },
      erreurs: {},
      cree: null,
      panne: false,
    });
  });

  it("« Générer » : un nouveau mot de passe de 16 caractères à chaque clic, et son erreur disparaît", () => {
    const premier = genererMotDePasseTemporaire();
    const second = genererMotDePasseTemporaire();
    expect(premier).toHaveLength(16);
    expect(premier).not.toBe(second);
    expect([...premier].every((c) => ALPHABET_MOT_DE_PASSE.includes(c))).toBe(true);

    const refuse = appliquer([
      { type: "saisie", champ: "motDePasseTemporaire", valeur: "court" },
      { type: "refus", champs: { motDePasseTemporaire: "12 caractères minimum" } },
    ]);
    const genere = appliquer([{ type: "generation", motDePasse: premier }], refuse);
    expect(genere.valeurs.motDePasseTemporaire).toBe(premier);
    expect(genere.erreurs).toEqual({});
    expect(genere.resumeVisible).toBe(false);
    expect(appliquer([{ type: "generation", motDePasse: second }], genere).valeurs.motDePasseTemporaire).toBe(second);
  });

  it("un message disparaît dès que le champ est corrigé ; sinon il dit ce qui reste à corriger", () => {
    const refuse = appliquer([
      { type: "refus", champs: { nom: MESSAGES_COMPTE.nomObligatoire, email: MESSAGES_COMPTE.emailObligatoire } },
    ]);
    const enCours = appliquer([{ type: "saisie", champ: "email", valeur: "lucas@" }], refuse);
    expect(enCours.erreurs.email).toBe(MESSAGES_COMPTE.emailForme);
    expect(enCours.resumeVisible).toBe(true);
    const corrige = appliquer(
      [
        { type: "saisie", champ: "email", valeur: "lucas@exemple.fr" },
        { type: "saisie", champ: "nom", valeur: "Lucas" },
      ],
      enCours,
    );
    expect(corrige.erreurs).toEqual({});
    expect(corrige.resumeVisible).toBe(false);
  });

  it("email déjà pris : le message disparaît dès que l'email est changé", () => {
    const refuse = appliquer([{ type: "refus", champs: { email: DEJA_UTILISE } }], { ...ETAT_CREATION_INITIAL, valeurs: LUCAS });
    expect(refuse.erreurs.email).toBe(DEJA_UTILISE);
    expect(refuse.valeurs).toEqual(LUCAS);
    expect(appliquer([{ type: "saisie", champ: "email", valeur: "lucas.b@nova-services.example" }], refuse).erreurs).toEqual({});
  });

  it("sortie de l'email : seul le format est vérifié (vide, rien)", () => {
    const mal = appliquer([{ type: "saisie", champ: "email", valeur: "lucas" }, { type: "sortie", champ: "email" }]);
    expect(mal.erreurs).toEqual({ email: MESSAGES_COMPTE.emailForme });
    expect(appliquer([{ type: "sortie", champ: "email" }]).erreurs).toEqual({});
    expect(appliquer([{ type: "sortie", champ: "nom" }]).erreurs).toEqual({});
  });

  it("panne : encadré, saisie gardée ; un nouvel envoi efface l'encadré", () => {
    const panne = appliquer([{ type: "panne" }], { ...ETAT_CREATION_INITIAL, valeurs: LUCAS });
    expect(panne).toMatchObject({ panne: true, valeurs: LUCAS, appelsEncadre: 1 });
    expect(appliquer([{ type: "envoi" }], panne).panne).toBe(false);
  });

  it("nouvel envoi : les erreurs du serveur (email déjà pris) disparaissent, et ne reviennent pas après une panne", () => {
    const refuse = appliquer([{ type: "refus", champs: { email: DEJA_UTILISE } }], { ...ETAT_CREATION_INITIAL, valeurs: LUCAS });
    const envoi = appliquer([{ type: "envoi" }], refuse);
    expect(envoi).toMatchObject({ erreurs: {}, resumeVisible: false, panne: false, valeurs: LUCAS });
    const panne = appliquer([{ type: "panne" }], envoi);
    expect(panne).toMatchObject({ erreurs: {}, resumeVisible: false, panne: true });
    expect(rendre(panne)).not.toContain(DEJA_UTILISE);
  });

  it("réussite : la saisie est oubliée, seuls le compte et son mot de passe restent ; « Copier » → « Copié »", () => {
    const cree = appliquer([{ type: "reussite", compte: COMPTE_LUCAS, motDePasseTemporaire: MOT_DE_PASSE }], {
      ...ETAT_CREATION_INITIAL,
      valeurs: LUCAS,
    });
    expect(cree.cree).toEqual({ ...COMPTE_LUCAS, motDePasseTemporaire: MOT_DE_PASSE });
    expect(cree.valeurs).toEqual(VALEURS_COMPTE_VIDES);
    expect(cree.copie).toBe(false);
    expect(appliquer([{ type: "copie" }], cree).copie).toBe(true);
    // Rien à copier avant la création.
    expect(appliquer([{ type: "copie" }]).copie).toBe(false);
  });

  it("fermeture (Échap, « Annuler », « Fermer ») : formulaire vierge, mot de passe oublié", () => {
    const cree = appliquer([
      { type: "saisie", champ: "nom", valeur: "Lucas" },
      { type: "reussite", compte: COMPTE_LUCAS, motDePasseTemporaire: MOT_DE_PASSE },
      { type: "copie" },
    ]);
    const ferme = appliquer([{ type: "reinitialisation" }], cree);
    expect(ferme).toEqual(ETAT_CREATION_INITIAL);
    expect(JSON.stringify(ferme)).not.toContain(MOT_DE_PASSE);
    const annule = appliquer([{ type: "saisie", champ: "nom", valeur: "Lucas" }, { type: "panne" }, { type: "reinitialisation" }]);
    expect(annule).toEqual(ETAT_CREATION_INITIAL);
  });
});

describe("réponse de la Server Function", () => {
  it("réussite : affichage du mot de passe saisi (la réponse ne le contient pas)", () => {
    expect(actionApresReponseCreation(succes(COMPTE_LUCAS), MOT_DE_PASSE)).toEqual({
      type: "reussite",
      compte: COMPTE_LUCAS,
      motDePasseTemporaire: MOT_DE_PASSE,
    });
  });

  it("CONFLIT (email déjà pris) ou VALIDATION avec champs : messages sous les champs", () => {
    expect(
      actionApresReponseCreation(
        echec("CONFLIT", MESSAGES_COMPTE.compteExistant, { champs: { email: DEJA_UTILISE } }),
        MOT_DE_PASSE,
      ),
    ).toEqual({ type: "refus", champs: { email: DEJA_UTILISE } });
    expect(
      actionApresReponseCreation(echec("VALIDATION", "1 champ est à corriger", { champs: { nom: "x" } }), MOT_DE_PASSE),
    ).toEqual({ type: "refus", champs: { nom: "x" } });
  });

  it.each([
    echec("ERREUR_INTERNE", MESSAGES_COMPTE.creationImpossible, { codeSupport: "ABC123" }),
    echec("ACCES_REFUSE", "Accès refusé."),
    echec("VALIDATION", "Formulaire incomplet"),
    echec("CONFLIT", "Conflit"),
  ])("toute autre réponse : panne (%j)", (reponse) => {
    expect(actionApresReponseCreation(reponse, MOT_DE_PASSE)).toEqual({ type: "panne" });
  });
});

describe("début de l'envoi et fermeture", () => {
  it("saisie valide, verrou ouvert : envoi, et le verrou est fermé", () => {
    const verrou = { current: false };
    expect(preparerEnvoiCreation(LUCAS, verrou)).toEqual({ type: "envoi" });
    expect(verrou.current).toBe(true);
  });

  it("double clic : le second appel, verrou fermé, est ignoré et n'appelle jamais l'action", async () => {
    const verrou = { current: false };
    const creer = vi.fn(async () => succes(COMPTE_LUCAS));
    const cliquer = () => {
      const debut = preparerEnvoiCreation(LUCAS, verrou);
      if (debut.type === "envoi") {
        void envoyerCreation({ valeurs: LUCAS, creer, agir: () => {}, apresReussite: () => {}, envoiVerrouille: verrou });
      }
      return debut;
    };
    expect(cliquer()).toEqual({ type: "envoi" });
    expect(cliquer()).toEqual({ type: "ignore" });
    expect(creer).toHaveBeenCalledTimes(1);
    expect(creerCompte).not.toHaveBeenCalled();
  });

  it("saisie invalide : refus avec les champs, rien n'est envoyé, verrou laissé ouvert", () => {
    const verrou = { current: false };
    expect(preparerEnvoiCreation({ ...LUCAS, nom: " ", motDePasseTemporaire: "court" }, verrou)).toEqual({
      type: "refus",
      champs: { nom: MESSAGES_COMPTE.nomObligatoire, motDePasseTemporaire: "12 caractères minimum" },
    });
    expect(verrou.current).toBe(false);
  });

  it("fermeture pendant l'envoi : refusée ; sinon formulaire remis à neuf", () => {
    expect(actionFermeture({ current: true })).toBeNull();
    expect(actionFermeture({ current: false })).toEqual({ type: "reinitialisation" });
  });
});

describe("envoi", () => {
  const preparer = (creer: (v: ValeursCompte) => Promise<never> | Promise<unknown>) => {
    const actions: ActionCreation[] = [];
    const apresReussite = vi.fn();
    const envoiVerrouille = { current: true };
    const envoi = envoyerCreation({
      valeurs: LUCAS,
      creer: creer as never,
      agir: (action) => actions.push(action),
      apresReussite,
      envoiVerrouille,
    });
    return { actions, apresReussite, envoiVerrouille, envoi };
  };

  it("réussite : compte affiché avec le mot de passe, toast « Compte créé », verrou rouvert", async () => {
    const creer = vi.fn(async () => succes(COMPTE_LUCAS));
    const { actions, apresReussite, envoiVerrouille, envoi } = preparer(creer);
    await envoi;
    expect(creer).toHaveBeenCalledExactlyOnceWith(LUCAS);
    expect(actions).toEqual([{ type: "reussite", compte: COMPTE_LUCAS, motDePasseTemporaire: MOT_DE_PASSE }]);
    expect(apresReussite).toHaveBeenCalledTimes(1);
    expect(envoiVerrouille.current).toBe(false);
  });

  it("double clic : le verrou reste fermé pendant tout l'envoi", async () => {
    let repondre: (valeur: unknown) => void = () => {};
    const { envoiVerrouille, envoi } = preparer(() => new Promise((resolve) => (repondre = resolve)));
    await Promise.resolve();
    expect(envoiVerrouille.current).toBe(true);
    repondre(succes(COMPTE_LUCAS));
    await envoi;
    expect(envoiVerrouille.current).toBe(false);
  });

  it("email déjà pris : refus, pas de toast, verrou rouvert", async () => {
    const { actions, apresReussite, envoiVerrouille, envoi } = preparer(async () =>
      echec("CONFLIT", MESSAGES_COMPTE.compteExistant, { champs: { email: DEJA_UTILISE } }),
    );
    await envoi;
    expect(actions).toEqual([{ type: "refus", champs: { email: DEJA_UTILISE } }]);
    expect(apresReussite).not.toHaveBeenCalled();
    expect(envoiVerrouille.current).toBe(false);
  });

  it("appel qui lève (réseau coupé) : panne, pas de toast, verrou rouvert", async () => {
    const { actions, apresReussite, envoiVerrouille, envoi } = preparer(async () => {
      throw new Error(MESSAGE_ERREUR_INATTENDUE);
    });
    await envoi;
    expect(actions).toEqual([{ type: "panne" }]);
    expect(apresReussite).not.toHaveBeenCalled();
    expect(envoiVerrouille.current).toBe(false);
  });
});

describe("le composant (texte du code)", () => {
  const racine = process.cwd();
  const source = readFileSync(join(racine, "src", "components", "interne", "creer-compte.tsx"), "utf8");
  const fenetre = readFileSync(join(racine, "src", "components", "ui", "dialog.tsx"), "utf8");

  it("fenêtre de 440 px au plus, Radix Dialog (Échap ferme, une seule fenêtre, sélection gardée)", () => {
    expect(fenetre).toContain("max-w-[440px]");
    expect(fenetre).toMatch(/import \{ Dialog as DialogPrimitive \} from "radix-ui"/);
  });

  it("sélection sur « Nom » à l'ouverture, sur « Copier » après la création", () => {
    expect(source).toMatch(/onOpenAutoFocus=\{\(evenement\) => \{\s*evenement\.preventDefault\(\);\s*refNom\.current\?\.focus\(\);/);
    expect(source).toMatch(/if \(compteCree\) refCopier\.current\?\.focus\(\);/);
  });

  it("toast « Compte créé » après la réussite ; mot de passe tiré dans le navigateur", () => {
    expect(source).toContain("afficherSucces(textes.compteCree)");
    expect(source).toContain('from "@/shared/mot-de-passe-temporaire"');
  });

  it("le mot de passe n'est gardé nulle part ailleurs que dans l'état (ni stockage, ni adresse)", () => {
    expect(source).not.toMatch(/localStorage|sessionStorage|useSearchParams|router\.push|history\./);
  });
});

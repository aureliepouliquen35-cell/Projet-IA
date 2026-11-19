import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/deposer-demande", () => ({
  actionDeposerDemande: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import {
  actionApresReponse,
  ADRESSE_CONFIRMATION,
  envoyerDepot,
  ETAT_DEPOT_INITIAL,
  FormulaireDepot,
  numeroApresReponse,
  reduireDepot,
  type ActionDepot,
  type EtatDepot,
} from "@/app/(public)/formulaire-depot";
import { messagePanneDepot, MESSAGES_DEPOT } from "@/shared/messages";
import { estNumeroEnvoi, nouveauNumeroEnvoi } from "@/shared/numero-envoi";
import { validerDepot } from "@/shared/schemas/depot";

import {
  CATEGORIES,
  CONTACT_DONNEES,
  CONTACTS_NOVA,
  etatAvec,
  NUMERO_ENVOI,
  rendreVue,
  SAISIE_DE_CLAIRE,
  texteDe,
} from "../aides/formulaire-depot";

// P1 — Formulaire de dépôt (EXPERIENCE.md), matrices des stories 1.3
// (affichage, champ manquant, format et limites, envoi, panne) et 1.4
// (message de panne avec le téléphone de Nova, passage à P2, numéro d'envoi).
// L'écran est rendu sans navigateur ; les gestes passent par `reduireDepot`.

/** Texte visible, sans l'espace que le rendu laisse avant un point qui suit un lien. */
const phrase = (html: string) => texteDe(html).replace(/ \./g, ".");

/** Balise ouvrante du contrôle qui porte cet identifiant. */
const controle = (html: string, id: string) =>
  html.match(new RegExp(`<(?:input|textarea|select|button)[^>]* id="${id}"[^>]*>`))?.[0] ?? "";

const etiquette = (html: string, id: string) =>
  texteDe(html.match(new RegExp(`<label[^>]* for="${id}"[^>]*>([\\s\\S]*?)</label>`))?.[1] ?? "");

const jouer = (actions: ActionDepot[], depart: EtatDepot = ETAT_DEPOT_INITIAL) =>
  actions.reduce(reduireDepot, depart);

/** Saisit chaque champ, comme le ferait une personne. */
const saisir = (valeurs: Partial<typeof SAISIE_DE_CLAIRE>): ActionDepot[] =>
  Object.entries(valeurs).map(
    ([champ, valeur]) => ({ type: "saisie", champ, valeur }) as ActionDepot,
  );

/** Appuie sur « Envoyer ma demande » : vérification du navigateur. */
function envoyer(etat: EtatDepot): EtatDepot {
  const validation = validerDepot(etat.valeurs);
  return validation.ok ? etat : reduireDepot(etat, { type: "refus", champs: validation.champs });
}

describe("affichage (formulaire vierge)", () => {
  const html = rendreVue();

  it("montre les 7 champs, chacun avec son étiquette visible reliée au champ", () => {
    const attendus = {
      nom: "Nom et prénom *",
      email: "Email *",
      telephone: "Téléphone",
      entreprise: "Entreprise",
      categorieId: "Catégorie *",
      objet: "Objet *",
      description: "Description *",
    };
    for (const [id, texte] of Object.entries(attendus)) {
      expect(etiquette(html, id), id).toBe(texte);
      expect(controle(html, id), id).not.toBe("");
    }
    expect(html.match(/<label/g)).toHaveLength(8); // 7 champs + la case
    expect(controle(html, "description")).toMatch(/^<textarea/);
    expect(controle(html, "categorieId")).toMatch(/^<select/);
  });

  it("signale les champs obligatoires par un astérisque et par l'attribut `required`", () => {
    expect(texteDe(html)).toContain("Les champs marqués * sont obligatoires.");
    for (const id of ["nom", "email", "categorieId", "objet", "description"]) {
      expect(controle(html, id), id).toContain("required");
    }
    for (const id of ["telephone", "entreprise"]) {
      expect(controle(html, id), id).not.toContain("required");
      expect(controle(html, id), id).toContain('placeholder="Facultatif"');
    }
  });

  it("propose les 5 catégories dans l'ordre, aucune présélectionnée", () => {
    const options = [...html.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)].map(([, attributs, texte]) => ({
      texte: texteDe(texte),
      valeur: attributs.match(/value="([^"]*)"/)?.[1],
      choisie: attributs.includes("selected"),
    }));
    expect(options).toEqual([
      { texte: "Choisissez une catégorie", valeur: "", choisie: true },
      ...CATEGORIES.map(({ id, nom }) => ({ texte: nom, valeur: id, choisie: false })),
    ]);
  });

  it("affiche la mention sur les données : 3 ans, et le contact données personnelles", () => {
    const mention = html.match(/<p[^>]*data-slot="mention-donnees"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "";
    expect(texteDe(mention)).toBe(
      "Vos données (nom, coordonnées et contenu de votre demande) sont utilisées par Nova Services uniquement pour traiter votre demande. Elles sont conservées 3 ans après sa clôture. Pour les consulter ou les faire supprimer : donnees@nova-services.example .",
    );
    expect(mention).toContain(`<a href="mailto:${CONTACT_DONNEES}"`);
  });

  it("affiche le contact tel quel s'il n'est pas un email", () => {
    const autre = renderToStaticMarkup(
      <FormulaireDepot
        categories={CATEGORIES}
        contactDonnees="Nova Services, 1 rue de l'Exemple, Rennes"
        contacts={CONTACTS_NOVA}
      />,
    );
    expect(texteDe(autre)).toContain("faire supprimer : Nova Services, 1 rue de l'Exemple, Rennes.");
    expect(autre).not.toContain("mailto:");
  });

  it("affiche la case obligatoire, non cochée, avec son libellé cliquable", () => {
    const laCase = controle(html, "personneInformee");
    expect(laCase).toContain('role="checkbox"');
    expect(laCase).toContain('aria-checked="false"');
    expect(laCase).toContain('aria-required="true"');
    expect(etiquette(html, "personneInformee")).toBe("J'ai pris connaissance de l'usage de mes données. *");
  });

  it("a un seul bouton principal, « Envoyer ma demande », actif d'emblée", () => {
    const boutons: string[] = html.match(/<button[^>]*data-slot="button"[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(boutons).toHaveLength(1);
    const [bouton = ""] = boutons;
    expect(bouton).toContain('type="submit"');
    expect(bouton).toContain('data-variant="principal"');
    expect(bouton).not.toMatch(/ disabled=""/);
    expect(texteDe(bouton)).toBe("Envoyer ma demande");
  });

  it("affiche les compteurs « 0 / 150 » et « 0 / 5 000 », et l'aide de la description", () => {
    const compteurs = [...html.matchAll(/<span[^>]*id="(\w+)-compteur"[^>]*>([^<]*(?:<!-- -->[^<]*)*)<\/span>/g)].map(
      ([, id, texte]) => [id, texteDe(texte.replace(/<!-- -->/g, ""))],
    );
    expect(compteurs).toEqual([
      ["objet", "0 / 150"],
      ["description", "0 / 5 000"],
    ]);
    expect(html).toMatch(/<span id="description-aide">10 caractères minimum<\/span>/);
    expect(controle(html, "description")).toContain('aria-describedby="description-aide description-compteur"');
  });

  it("ne montre aucune erreur avant le premier envoi", () => {
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('aria-invalid="true"');
    expect(html).not.toContain("à corriger");
  });

  it("laisse le navigateur hors de la vérification, et ne coupe jamais un texte", () => {
    expect(html).toMatch(/<form[^>]* noValidate=""/i);
    expect(html).not.toMatch(/maxlength/i);
  });

  it("formulaire vierge : ni téléphone de Nova (montré seulement en cas de panne), ni champ caché", () => {
    expect(html).not.toContain("tel:");
    expect(html).not.toMatch(/type="hidden"/);
    expect(html).not.toMatch(/Votre demande n&#x27;a pas pu être envoyée/);
  });

  it("n'utilise que des icônes lucide-react, ignorées par les lecteurs d'écran, et aucune couleur en dur", () => {
    const icones = html.match(/<svg[^>]*>/g) ?? [];
    expect(icones.length).toBeGreaterThanOrEqual(5);
    for (const icone of icones) {
      expect(icone).toContain("lucide");
      expect(icone).toContain('aria-hidden="true"');
    }
    expect(html).not.toMatch(/#[0-9a-f]{6}\b|rgba?\(/i);
  });

  it("le composant avec état démarre sur ce même formulaire vierge", () => {
    expect(
      renderToStaticMarkup(
        <FormulaireDepot categories={CATEGORIES} contactDonnees={CONTACT_DONNEES} contacts={CONTACTS_NOVA} />,
      ),
    ).toBe(html);
  });
});

describe("champ manquant", () => {
  it("email oublié : « 1 champ est à corriger », lien vers le champ, message sous le champ, saisie intacte", () => {
    const etat = envoyer(jouer(saisir({ ...SAISIE_DE_CLAIRE, email: "" })));
    const html = rendreVue(etat);

    // Encadré du haut : il peut recevoir la sélection et renvoie au champ.
    const resume = html.match(/<div[^>]*data-slot="resume-erreurs"[^>]*>[\s\S]*?<\/ul>/)?.[0] ?? "";
    expect(resume).toContain('role="alert"');
    expect(resume).toContain('tabindex="-1"');
    expect(resume).toContain('data-variant="erreur"');
    expect(texteDe(resume)).toBe("1 champ est à corriger L'email est obligatoire");
    expect(resume).toMatch(/<a [^>]*href="#email"[^>]*>L&#x27;email est obligatoire<\/a>/);
    expect(etat.appelsEncadre).toBe(1);

    // Sous le champ : message relié au champ, bordure d'erreur.
    expect(html).toMatch(/<p id="email-erreur"[^>]*>.*L&#x27;email est obligatoire<\/p>/);
    expect(controle(html, "email")).toContain('aria-invalid="true"');
    expect(controle(html, "email")).toContain('aria-describedby="email-erreur"');
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(1);

    // Rien n'est effacé.
    expect(etat.valeurs).toEqual({ ...SAISIE_DE_CLAIRE, email: "" });
    expect(controle(html, "nom")).toContain('value="Claire Martin"');
    expect(controle(html, "entreprise")).toContain('value="Cabinet Martin Expertise"');
    expect(controle(html, "objet")).toContain('value="Accès impossible à l&#x27;outil de facturation"');
    expect(html).toContain("J&#x27;ai redémarré le poste, sans effet.</textarea>");
    expect(html).toMatch(new RegExp(`<option[^>]*value="${CATEGORIES[1].id}"[^>]*selected=""`));
    expect(controle(html, "personneInformee")).toContain('aria-checked="true"');
  });

  it("case oubliée : « 1 champ est à corriger », le message de l'UX sous la case", () => {
    const etat = envoyer(jouer(saisir({ ...SAISIE_DE_CLAIRE, personneInformee: false })));
    const html = rendreVue(etat);

    expect(texteDe(html)).toContain("1 champ est à corriger");
    expect(html).toMatch(
      /<a [^>]*href="#personneInformee"[^>]*>Cochez la case pour confirmer avoir lu l&#x27;usage de vos données<\/a>/,
    );
    expect(html).toMatch(/<p id="personneInformee-erreur"[^>]*>.*Cochez la case pour confirmer avoir lu/);
    expect(controle(html, "personneInformee")).toContain('aria-describedby="personneInformee-erreur"');
    expect(etat.valeurs).toEqual({ ...SAISIE_DE_CLAIRE, personneInformee: false });
  });

  it("formulaire vierge envoyé : « 6 champs sont à corriger », dans l'ordre de l'écran", () => {
    const html = rendreVue(envoyer(ETAT_DEPOT_INITIAL));
    expect(texteDe(html)).toContain("6 champs sont à corriger");
    expect([...html.matchAll(/<a [^>]*href="#(\w+)"/g)].map(([, champ]) => champ)).toEqual([
      "nom",
      "email",
      "categorieId",
      "objet",
      "description",
      "personneInformee",
    ]);
  });

  it("un message disparaît dès que le champ est corrigé, et le résumé avec le dernier", () => {
    let etat = envoyer(jouer(saisir({ ...SAISIE_DE_CLAIRE, email: "", personneInformee: false })));
    expect(Object.keys(etat.erreurs)).toEqual(["email", "personneInformee"]);

    etat = jouer(saisir({ email: "claire.martin@cabinet-martin.fr" }), etat);
    expect(etat.erreurs).toEqual({ personneInformee: MESSAGES_DEPOT.caseObligatoire });
    expect(texteDe(rendreVue(etat))).toContain("1 champ est à corriger");

    etat = jouer(saisir({ personneInformee: true }), etat);
    expect(etat.erreurs).toEqual({});
    expect(etat.resumeVisible).toBe(false);
    expect(rendreVue(etat)).not.toContain('role="alert"');
  });

  it("tant que le champ n'est pas corrigé, le message dit ce qui reste à corriger", () => {
    let etat = envoyer(jouer(saisir({ ...SAISIE_DE_CLAIRE, email: "" })));
    etat = jouer(saisir({ email: "claire@" }), etat);
    expect(etat.erreurs).toEqual({ email: MESSAGES_DEPOT.emailForme });
    expect(etat.resumeVisible).toBe(true);
  });

  it("saisir dans un champ sans erreur ne touche ni aux erreurs ni au reste de la saisie", () => {
    const depart = envoyer(jouer(saisir({ ...SAISIE_DE_CLAIRE, email: "" })));
    const etat = jouer(saisir({ nom: "Claire M." }), depart);
    expect(etat.erreurs).toBe(depart.erreurs);
    expect(etat.valeurs).toEqual({ ...SAISIE_DE_CLAIRE, email: "", nom: "Claire M." });
  });
});

describe("format et limites", () => {
  it("vérifie le format de l'email à la sortie du champ, sans résumé en haut", () => {
    const etat = jouer([...saisir({ email: "claire@" }), { type: "sortie", champ: "email" }]);
    expect(etat.erreurs).toEqual({ email: "L'email doit avoir la forme nom@exemple.fr" });
    expect(etat.resumeVisible).toBe(false);
    expect(etat.appelsEncadre).toBe(0);

    const html = rendreVue(etat);
    expect(html).toMatch(/<p id="email-erreur"[^>]*>.*L&#x27;email doit avoir la forme nom@exemple\.fr<\/p>/);
    expect(html).not.toContain('data-slot="resume-erreurs"');
    expect(controle(html, "email")).toContain('value="claire@"');
  });

  it("ne dit rien à la sortie d'un email vide ou correct : le champ vide est vérifié à l'envoi", () => {
    expect(jouer([{ type: "sortie", champ: "email" }]).erreurs).toEqual({});
    expect(
      jouer([...saisir({ email: " claire@cabinet.fr " }), { type: "sortie", champ: "email" }]).erreurs,
    ).toEqual({});
  });

  it("ne vérifie aucun autre champ à sa sortie", () => {
    const etat = jouer([
      ...saisir({ description: "court", objet: "o".repeat(151) }),
      { type: "sortie", champ: "description" },
      { type: "sortie", champ: "objet" },
      { type: "sortie", champ: "nom" },
    ]);
    expect(etat.erreurs).toEqual({});
  });

  it("le message d'email posé à la sortie du champ disparaît dès qu'il est corrigé", () => {
    const etat = jouer([
      ...saisir({ email: "claire@" }),
      { type: "sortie", champ: "email" },
      ...saisir({ email: "claire@cabinet.fr" }),
    ]);
    expect(etat.erreurs).toEqual({});
  });

  it("objet de 151 caractères : compteur en rouge, texte jamais coupé, message exact à l'envoi", () => {
    const objet = "o".repeat(151);
    const saisie = jouer(saisir({ ...SAISIE_DE_CLAIRE, objet }));

    // Pendant la saisie : le compteur prévient, sans message.
    const avant = rendreVue(saisie);
    const compteur = avant.match(/<span[^>]*id="objet-compteur"[^>]*>/)?.[0] ?? "";
    expect(compteur).toContain('data-depasse="true"');
    expect(compteur).toContain("data-depasse:text-danger");
    expect(texteDe(avant)).toContain("151 / 150");
    expect(avant).not.toContain("objet-erreur");
    expect(controle(avant, "objet")).toContain(`value="${objet}"`);

    // À l'envoi : le message exact, et toujours les 151 caractères.
    const etat = envoyer(saisie);
    expect(etat.erreurs).toEqual({ objet: "L'objet ne doit pas dépasser 150 caractères" });
    expect(etat.valeurs.objet).toBe(objet);
    expect(controle(rendreVue(etat), "objet")).toContain(`value="${objet}"`);
  });

  it("à la limite exacte, le compteur n'est pas en rouge", () => {
    const html = rendreVue(etatAvec({ valeurs: { ...SAISIE_DE_CLAIRE, objet: "o".repeat(150) } }));
    expect(texteDe(html)).toContain("150 / 150");
    expect(html.match(/<span[^>]*id="objet-compteur"[^>]*>/)?.[0]).not.toContain("data-depasse=");
  });

  it("description de 9 caractères : message exact à l'envoi ; au-delà de 5 000 : compteur en rouge", () => {
    const courte = envoyer(jouer(saisir({ ...SAISIE_DE_CLAIRE, description: "123456789" })));
    expect(courte.erreurs).toEqual({ description: "La description doit faire au moins 10 caractères" });
    expect(texteDe(rendreVue(courte))).toContain("9 / 5 000");

    const longue = jouer(saisir({ ...SAISIE_DE_CLAIRE, description: "d".repeat(5001) }));
    const html = rendreVue(longue);
    expect(texteDe(html)).toContain("5 001 / 5 000");
    expect(html.match(/<span[^>]*id="description-compteur"[^>]*>/)?.[0]).toContain('data-depasse="true"');
    expect(envoyer(longue).erreurs).toEqual({
      description: "La description ne doit pas dépasser 5 000 caractères",
    });
    expect(envoyer(longue).valeurs.description).toHaveLength(5001);
  });
});

describe("envoi", () => {
  it("pendant l'envoi : bouton désactivé, « Envoi en cours… » avec un indicateur tournant", () => {
    const html = rendreVue(etatAvec({ valeurs: SAISIE_DE_CLAIRE }), { envoiEnCours: true });
    const bouton = html.match(/<button[^>]*data-slot="button"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(bouton).toMatch(/<button[^>]* disabled=""/);
    expect(texteDe(bouton)).toBe("Envoi en cours…");
    expect(bouton).toMatch(/<svg[^>]*class="[^"]*animate-spin/);
    expect(html).toMatch(/<form[^>]* aria-busy="true"/);
    // La saisie reste affichée pendant l'envoi.
    expect(controle(html, "nom")).toContain('value="Claire Martin"');
  });

  it("pendant l'envoi : la saisie est figée (les deux blocs et la case), puis de nouveau modifiable", () => {
    const blocs = (html: string) => html.match(/<fieldset[^>]*>/g) ?? [];

    const pendant = rendreVue(etatAvec({ valeurs: SAISIE_DE_CLAIRE }), { envoiEnCours: true });
    expect(blocs(pendant)).toHaveLength(2);
    for (const bloc of blocs(pendant)) expect(bloc).toMatch(/ disabled=""/);
    expect(controle(pendant, "personneInformee")).toMatch(/ disabled=""/);
    // Les 7 champs sont dans ces deux blocs : aucun n'est modifiable.
    const interieur = (pendant.match(/<fieldset[\s\S]*?<\/fieldset>/g) ?? []).join("");
    for (const id of ["nom", "email", "telephone", "entreprise", "categorieId", "objet", "description"]) {
      expect(controle(interieur, id), id).not.toBe("");
    }

    const apres = rendreVue(etatAvec({ valeurs: SAISIE_DE_CLAIRE }));
    expect(blocs(apres)).toHaveLength(2);
    for (const bloc of blocs(apres)) expect(bloc).not.toMatch(/ disabled=""/);
    expect(controle(apres, "personneInformee")).not.toMatch(/ disabled=""/);
  });

  it("trie la réponse du serveur : réussite, erreur de saisie, ou panne", () => {
    // Réussite : passage à P2 (la référence arrive par le cookie, pas ici).
    expect(actionApresReponse({ ok: true, donnees: { reference: "NOVA-2026-0001" } })).toEqual({
      type: "reussite",
    });

    // Erreur de saisie avec ses champs : le résumé d'erreurs.
    const champs = { email: MESSAGES_DEPOT.emailObligatoire };
    expect(
      actionApresReponse({ ok: false, code: "VALIDATION", message: "1 champ est à corriger", champs }),
    ).toEqual({ type: "refus", champs });

    // Erreur de saisie sans champ à montrer (numéro d'envoi refusé) : panne.
    expect(
      actionApresReponse({ ok: false, code: "VALIDATION", message: "1 champ est à corriger" }),
    ).toEqual({ type: "panne" });

    // Panne : l'encadré de panne, quel que soit le message technique.
    expect(
      actionApresReponse({
        ok: false,
        code: "ERREUR_INTERNE",
        message: "Une erreur inattendue s'est produite.",
        codeSupport: "7F3A",
      }),
    ).toEqual({ type: "panne" });
  });

  it("chaque réponse mène au bon écran : jamais de confirmation sans réussite", () => {
    const depart = jouer([...saisir(SAISIE_DE_CLAIRE), { type: "envoi" }]);
    const suite = (reponse: Parameters<typeof actionApresReponse>[0]) =>
      reduireDepot(depart, actionApresReponse(reponse));

    expect(suite({ ok: true, donnees: { reference: "NOVA-2026-0001" } }).redirection).toBe(true);

    const panne = suite({ ok: false, code: "ERREUR_INTERNE", message: "Une erreur inattendue s'est produite." });
    expect(panne.redirection).toBe(false);
    expect(panne.panne).toBe(true);
    expect(panne.valeurs).toEqual(SAISIE_DE_CLAIRE);

    const refus = suite({
      ok: false,
      code: "VALIDATION",
      message: "1 champ est à corriger",
      champs: { categorieId: MESSAGES_DEPOT.categorieIndisponible },
    });
    expect(refus.redirection).toBe(false);
    expect(refus.panne).toBe(false);
    expect(refus.resumeVisible).toBe(true);
    expect(refus.erreurs).toEqual({ categorieId: MESSAGES_DEPOT.categorieIndisponible });
  });

  it("réussite : la saisie reste affichée et figée (« Envoi en cours… ») jusqu'à P2", () => {
    const etat = jouer([...saisir(SAISIE_DE_CLAIRE), { type: "envoi" }, { type: "reussite" }]);
    expect(etat.redirection).toBe(true);
    expect(etat.valeurs).toEqual(SAISIE_DE_CLAIRE);

    // Même sans envoi en cours, le formulaire reste figé : aucun second envoi.
    const html = rendreVue(etat);
    const bouton = html.match(/<button[^>]*data-slot="button"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(bouton).toMatch(/<button[^>]* disabled=""/);
    expect(texteDe(bouton)).toBe("Envoi en cours…");
    for (const bloc of html.match(/<fieldset[^>]*>/g) ?? []) expect(bloc).toMatch(/ disabled=""/);
    // Le message de réussite provisoire de la story 1.3 a disparu.
    expect(html).not.toMatch(/bien été enregistrée|Votre référence/);
  });

  it("réussite : le formulaire repart vierge en même temps que P2 s'affiche", () => {
    const etat = jouer([
      ...saisir(SAISIE_DE_CLAIRE),
      { type: "envoi" },
      { type: "panne" },
      { type: "envoi" },
      { type: "reussite" },
      { type: "reinitialisation" },
    ]);
    expect(etat).toEqual(ETAT_DEPOT_INITIAL);
    expect(ADRESSE_CONFIRMATION).toBe("/confirmation");
  });

  it("refus du serveur (catégorie désactivée entre-temps) : même présentation qu'une erreur de saisie", () => {
    const etat = jouer([
      ...saisir(SAISIE_DE_CLAIRE),
      { type: "envoi" },
      { type: "refus", champs: { categorieId: MESSAGES_DEPOT.categorieIndisponible } },
    ]);
    const html = rendreVue(etat);
    expect(texteDe(html)).toContain("1 champ est à corriger");
    expect(html).toMatch(/<a [^>]*href="#categorieId"/);
    expect(controle(html, "categorieId")).toContain('aria-invalid="true"');
    expect(etat.valeurs).toEqual(SAISIE_DE_CLAIRE);
  });
});

describe("panne", () => {
  const etat = jouer([...saisir(SAISIE_DE_CLAIRE), { type: "envoi" }, { type: "panne" }]);
  const html = rendreVue(etat);
  const encadreDe = (rendu: string) =>
    rendu.match(/<div[^>]*data-slot="alert"[^>]*>[\s\S]*?<\/div><\/div>/)?.[0] ?? "";
  const encadre = encadreDe(html);

  it("affiche le message exact de l'UX, avec le téléphone de Nova, dans un encadré qui reçoit la sélection", () => {
    expect(encadre).toContain('data-variant="erreur"');
    expect(encadre).toContain('role="alert"');
    expect(encadre).toContain('tabindex="-1"');
    expect(phrase(encadre)).toBe(
      "Votre demande n'a pas pu être envoyée. Vos informations sont conservées : réessayez dans un instant. Si le problème continue, appelez-nous au 01 99 00 00 00.",
    );
    expect(phrase(encadre)).toBe(messagePanneDepot(CONTACTS_NOVA));
    expect(etat.appelsEncadre).toBe(1);
    expect(html).not.toContain("à corriger");
  });

  it("le téléphone est un lien d'appel, jamais coupé", () => {
    expect(encadre).toMatch(/<a href="tel:0199000000" class="[^"]*whitespace-nowrap[^"]*">01 99 00 00 00<\/a>/);
  });

  it("sans téléphone renseigné : « écrivez-nous à » l'email de contact", () => {
    const sansTelephone = { telephone: null, emailContact: "contact@nova-services.example" };
    const encadreSans = encadreDe(rendreVue(etat, { contacts: sansTelephone }));
    expect(phrase(encadreSans)).toBe(
      "Votre demande n'a pas pu être envoyée. Vos informations sont conservées : réessayez dans un instant. Si le problème continue, écrivez-nous à contact@nova-services.example.",
    );
    expect(phrase(encadreSans)).toBe(messagePanneDepot(sansTelephone));
    expect(encadreSans).toContain('href="mailto:contact@nova-services.example"');
    expect(encadreSans).not.toContain("tel:");
    expect(encadreSans).not.toContain("appelez-nous");
  });

  it("n'affiche jamais le message technique de la réponse", () => {
    expect(html).not.toContain("Une erreur inattendue");
  });

  it("garde le formulaire intact, prêt à être renvoyé, sans aucune confirmation", () => {
    expect(etat.valeurs).toEqual(SAISIE_DE_CLAIRE);
    expect(etat.redirection).toBe(false);
    expect(controle(html, "nom")).toContain('value="Claire Martin"');
    expect(controle(html, "email")).toContain('value="claire.martin@cabinet-martin.fr"');
    expect(controle(html, "personneInformee")).toContain('aria-checked="true"');
    expect(html).not.toMatch(/ disabled=""/);
    expect(html).not.toMatch(/bien été enregistrée|Votre référence/);
  });

  it("l'encadré disparaît au nouvel envoi", () => {
    expect(reduireDepot(etat, { type: "envoi" }).panne).toBe(false);
  });
});

describe("numéro d'envoi (AD-20)", () => {
  it("est un UUID version 4, différent à chaque tirage", () => {
    const numeros = Array.from({ length: 50 }, () => nouveauNumeroEnvoi());
    for (const numero of numeros) {
      expect(numero).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(estNumeroEnvoi(numero)).toBe(true);
    }
    expect(new Set(numeros).size).toBe(50);
  });

  it("est tiré sans crypto.randomUUID (indisponible en http:// sur le réseau local)", () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    nouveauNumeroEnvoi();
    expect(randomUUID).not.toHaveBeenCalled();
    randomUUID.mockRestore();
  });

  it("est gardé après une panne ou un refus (nouvel essai), renouvelé après une réussite", () => {
    expect(numeroApresReponse({ type: "panne" }, NUMERO_ENVOI)).toBe(NUMERO_ENVOI);
    expect(numeroApresReponse({ type: "refus", champs: {} }, NUMERO_ENVOI)).toBe(NUMERO_ENVOI);
    const nouveau = numeroApresReponse({ type: "reussite" }, NUMERO_ENVOI);
    expect(nouveau).not.toBe(NUMERO_ENVOI);
    expect(estNumeroEnvoi(nouveau)).toBe(true);
  });

  it("n'apparaît pas dans la page (aucun champ caché)", () => {
    expect(rendreVue(etatAvec({ valeurs: SAISIE_DE_CLAIRE }))).not.toMatch(/type="hidden"|numero/i);
  });

  it("refuse ce qui n'a pas la forme d'un UUID", () => {
    for (const valeur of [undefined, null, "", "123", 42, "NOVA-2026-0001", `${NUMERO_ENVOI}x`]) {
      expect(estNumeroEnvoi(valeur)).toBe(false);
    }
  });
});

describe("envoi et réponse (envoyerDepot)", () => {
  const REUSSITE = { ok: true as const, donnees: { reference: "NOVA-2026-0001" } };
  const PANNE = { ok: false as const, code: "ERREUR_INTERNE" as const, message: "Une erreur inattendue s'est produite." };

  /** Un formulaire affiché : numéro tiré à l'affichage, verrou fermé par le clic. */
  function preparer(reponses: (() => Promise<unknown>)[]) {
    const deposer = vi.fn<(valeurs: unknown, numero: string) => Promise<never>>(
      () => reponses.shift()!() as Promise<never>,
    );
    const actions: ActionDepot[] = [];
    const journal: string[] = [];
    const dependances = {
      valeurs: SAISIE_DE_CLAIRE,
      deposer,
      agir: vi.fn((action: ActionDepot) => {
        actions.push(action);
        journal.push(`agir:${action.type}`);
      }),
      naviguer: vi.fn((adresse: string) => journal.push(`naviguer:${adresse}`)),
      enTransition: vi.fn((miseAJour: () => void) => miseAJour()),
      numeroEnvoi: { current: NUMERO_ENVOI as string | null },
      envoiVerrouille: { current: true },
    };
    return { deposer, actions, journal, dependances };
  }

  it("panne puis nouvel essai : le même numéro d'envoi, verrou ouvert entre les deux", async () => {
    const { deposer, actions, dependances } = preparer([
      () => Promise.resolve(PANNE),
      () => Promise.resolve(REUSSITE),
    ]);

    await envoyerDepot(dependances);
    expect(actions).toEqual([{ type: "panne" }]);
    expect(dependances.envoiVerrouille.current).toBe(false);
    expect(dependances.numeroEnvoi.current).toBe(NUMERO_ENVOI);
    expect(dependances.naviguer).not.toHaveBeenCalled();

    dependances.envoiVerrouille.current = true;
    await envoyerDepot(dependances);
    expect(deposer.mock.calls.map(([, numero]) => numero)).toEqual([NUMERO_ENVOI, NUMERO_ENVOI]);
  });

  it("refus du serveur : le même numéro d'envoi, verrou ouvert", async () => {
    const { actions, dependances } = preparer([
      () =>
        Promise.resolve({
          ok: false,
          code: "VALIDATION",
          message: "1 champ est à corriger",
          champs: { categorieId: MESSAGES_DEPOT.categorieIndisponible },
        }),
    ]);
    await envoyerDepot(dependances);
    expect(actions).toEqual([{ type: "refus", champs: { categorieId: MESSAGES_DEPOT.categorieIndisponible } }]);
    expect(dependances.numeroEnvoi.current).toBe(NUMERO_ENVOI);
    expect(dependances.envoiVerrouille.current).toBe(false);
  });

  it("réussite : un nouveau numéro, puis formulaire vierge (verrou ouvert) et passage à /confirmation", async () => {
    const { deposer, journal, dependances } = preparer([
      () => Promise.resolve(REUSSITE),
      () => Promise.resolve(REUSSITE),
    ]);

    await envoyerDepot(dependances);
    expect(journal).toEqual(["agir:reussite", "agir:reinitialisation", "naviguer:/confirmation"]);
    expect(dependances.enTransition).toHaveBeenCalledTimes(1);
    expect(dependances.envoiVerrouille.current).toBe(false);
    expect(estNumeroEnvoi(dependances.numeroEnvoi.current)).toBe(true);
    expect(dependances.numeroEnvoi.current).not.toBe(NUMERO_ENVOI);

    // La demande suivante part avec ce nouveau numéro.
    dependances.envoiVerrouille.current = true;
    await envoyerDepot(dependances);
    const [premier, second] = deposer.mock.calls.map(([, numero]) => numero);
    expect(premier).toBe(NUMERO_ENVOI);
    expect(second).not.toBe(NUMERO_ENVOI);
    expect(estNumeroEnvoi(second)).toBe(true);
  });

  it("le verrou reste fermé pendant le passage à P2, et s'ouvre avec le formulaire vierge", async () => {
    const { dependances } = preparer([() => Promise.resolve(REUSSITE)]);
    let verrouPendantReussite: boolean | undefined;
    dependances.agir.mockImplementation((action: ActionDepot) => {
      if (action.type === "reussite") verrouPendantReussite = dependances.envoiVerrouille.current;
    });
    await envoyerDepot(dependances);
    expect(verrouPendantReussite).toBe(true);
    expect(dependances.envoiVerrouille.current).toBe(false);
  });

  it("l'action lève une exception (réseau coupé) : panne, verrou ouvert, même numéro, pas de P2", async () => {
    const { actions, dependances } = preparer([() => Promise.reject(new TypeError("Failed to fetch"))]);
    await expect(envoyerDepot(dependances)).resolves.toBeUndefined();
    expect(actions).toEqual([{ type: "panne" }]);
    expect(dependances.envoiVerrouille.current).toBe(false);
    expect(dependances.numeroEnvoi.current).toBe(NUMERO_ENVOI);
    expect(dependances.naviguer).not.toHaveBeenCalled();
  });

  it("envoie la saisie avec le numéro tiré à l'affichage, ou en tire un s'il manque", async () => {
    const { deposer, dependances } = preparer([() => Promise.resolve(PANNE), () => Promise.resolve(PANNE)]);
    await envoyerDepot(dependances);
    expect(deposer).toHaveBeenCalledWith(SAISIE_DE_CLAIRE, NUMERO_ENVOI);

    dependances.numeroEnvoi.current = null;
    await envoyerDepot(dependances);
    const numero = deposer.mock.calls[1][1];
    expect(estNumeroEnvoi(numero)).toBe(true);
    expect(dependances.numeroEnvoi.current).toBe(numero);
  });

  it("le formulaire tire son numéro à l'affichage (effet au montage) et passe par envoyerDepot", () => {
    const source = readFileSync(join(process.cwd(), "src", "app", "(public)", "formulaire-depot.tsx"), "utf8");
    expect(source).toMatch(/useEffect\(\(\) => \{\s+numeroEnvoi\.current \?\?= nouveauNumeroEnvoi\(\);\s+\}, \[\]\);/);
    expect(source).toMatch(/envoyerDepot\(\{[\s\S]*?deposer: actionDeposerDemande,[\s\S]*?naviguer: \(adresse\) => router\.push\(adresse\),/);
  });
});

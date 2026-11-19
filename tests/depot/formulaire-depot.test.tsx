import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/deposer-demande", () => ({
  actionDeposerDemande: vi.fn(),
}));

import {
  actionApresReponse,
  ETAT_DEPOT_INITIAL,
  FormulaireDepot,
  reduireDepot,
  ReussiteDepot,
  type ActionDepot,
  type EtatDepot,
} from "@/app/(public)/formulaire-depot";
import { MESSAGES_DEPOT } from "@/shared/messages";
import { validerDepot } from "@/shared/schemas/depot";

import {
  CATEGORIES,
  CONTACT_DONNEES,
  etatAvec,
  rendreVue,
  SAISIE_DE_CLAIRE,
  texteDe,
} from "../aides/formulaire-depot";

// P1 — Formulaire de dépôt (EXPERIENCE.md), matrice de la story 1.3 :
// affichage, champ manquant, format et limites, envoi, panne.
// L'écran est rendu sans navigateur ; les gestes passent par `reduireDepot`.

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
      <FormulaireDepot categories={CATEGORIES} contactDonnees="Nova Services, 1 rue de l'Exemple, Rennes" />,
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

  it("s'en tient à la story : ni téléphone de Nova, ni champ caché anti-robots", () => {
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
      renderToStaticMarkup(<FormulaireDepot categories={CATEGORIES} contactDonnees={CONTACT_DONNEES} />),
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
    // Réussite : le message de réussite, avec la référence reçue.
    expect(actionApresReponse({ ok: true, donnees: { reference: "NOVA-2026-0001" } })).toEqual({
      type: "reussite",
      reference: "NOVA-2026-0001",
    });

    // Erreur de saisie avec ses champs : le résumé d'erreurs.
    const champs = { email: MESSAGES_DEPOT.emailObligatoire };
    expect(
      actionApresReponse({ ok: false, code: "VALIDATION", message: "1 champ est à corriger", champs }),
    ).toEqual({ type: "refus", champs });

    // Erreur de saisie sans champ à montrer : l'encadré d'erreur, avec son message.
    expect(
      actionApresReponse({ ok: false, code: "VALIDATION", message: "1 champ est à corriger" }),
    ).toEqual({ type: "panne", message: "1 champ est à corriger" });

    // Panne : l'encadré d'erreur, avec le message de la réponse.
    expect(
      actionApresReponse({
        ok: false,
        code: "ERREUR_INTERNE",
        message: "Une erreur inattendue s'est produite.",
        codeSupport: "7F3A",
      }),
    ).toEqual({ type: "panne", message: "Une erreur inattendue s'est produite." });
  });

  it("chaque réponse mène au bon écran : jamais de réussite sans référence", () => {
    const depart = jouer([...saisir(SAISIE_DE_CLAIRE), { type: "envoi" }]);
    const suite = (reponse: Parameters<typeof actionApresReponse>[0]) =>
      reduireDepot(depart, actionApresReponse(reponse));

    expect(suite({ ok: true, donnees: { reference: "NOVA-2026-0001" } }).reference).toBe("NOVA-2026-0001");

    const panne = suite({ ok: false, code: "ERREUR_INTERNE", message: "Une erreur inattendue s'est produite." });
    expect(panne.reference).toBeNull();
    expect(panne.erreurEnvoi).toBe("Une erreur inattendue s'est produite.");
    expect(panne.valeurs).toEqual(SAISIE_DE_CLAIRE);

    const refus = suite({
      ok: false,
      code: "VALIDATION",
      message: "1 champ est à corriger",
      champs: { categorieId: MESSAGES_DEPOT.categorieIndisponible },
    });
    expect(refus.reference).toBeNull();
    expect(refus.erreurEnvoi).toBeNull();
    expect(refus.resumeVisible).toBe(true);
    expect(refus.erreurs).toEqual({ categorieId: MESSAGES_DEPOT.categorieIndisponible });
  });

  it("réussite : message provisoire avec la référence, annoncé sans être une alerte", () => {
    const etat = jouer([...saisir(SAISIE_DE_CLAIRE), { type: "envoi" }, { type: "reussite", reference: "NOVA-2026-0001" }]);
    expect(etat.reference).toBe("NOVA-2026-0001");

    const html = renderToStaticMarkup(<ReussiteDepot reference="NOVA-2026-0001" />);
    expect(html).toContain('data-variant="succes"');
    expect(html).toContain('role="status"');
    expect(html).toContain('tabindex="-1"');
    expect(texteDe(html)).toBe("Votre demande a bien été enregistrée. Votre référence : NOVA-2026-0001");
    // La référence est écrite en chasse fixe, sans coupure.
    expect(html).toMatch(/<span class="[^"]*font-mono[^"]*whitespace-nowrap[^"]*">NOVA-2026-0001<\/span>/);
    // Pas encore l'écran P2 (story 1.4).
    expect(html).not.toMatch(/Notez-la|Une question urgente|Déposer une autre demande/);
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
  const etat = jouer([
    ...saisir(SAISIE_DE_CLAIRE),
    { type: "envoi" },
    { type: "panne", message: "Une erreur inattendue s'est produite." },
  ]);
  const html = rendreVue(etat);

  it("affiche un encadré d'erreur avec le message de la réponse, qui reçoit la sélection", () => {
    const encadre = html.match(/<div[^>]*data-slot="alert"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(encadre).toContain('data-variant="erreur"');
    expect(encadre).toContain('role="alert"');
    expect(encadre).toContain('tabindex="-1"');
    expect(texteDe(encadre)).toBe("Une erreur inattendue s'est produite.");
    expect(etat.appelsEncadre).toBe(1);
    expect(html).not.toContain("à corriger");
  });

  it("garde le formulaire intact, prêt à être renvoyé", () => {
    expect(etat.valeurs).toEqual(SAISIE_DE_CLAIRE);
    expect(etat.reference).toBeNull();
    expect(controle(html, "nom")).toContain('value="Claire Martin"');
    expect(controle(html, "email")).toContain('value="claire.martin@cabinet-martin.fr"');
    expect(controle(html, "personneInformee")).toContain('aria-checked="true"');
    expect(html).not.toMatch(/ disabled=""/);
    expect(html).not.toContain("bien été enregistrée");
  });

  it("l'encadré disparaît au nouvel envoi", () => {
    expect(reduireDepot(etat, { type: "envoi" }).erreurEnvoi).toBeNull();
  });
});

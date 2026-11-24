import { describe, expect, it } from "vitest";

import { CANAUX, CANAUX_SAISIE } from "@/shared/constantes";
import { MESSAGES_DEPOT, MESSAGES_SAISIE } from "@/shared/messages";
import { CHAMPS_DEPOT, validerDepot } from "@/shared/schemas/depot";
import {
  CHAMPS_SAISIE,
  erreurDuChampSaisie,
  listerErreursSaisie,
  validerSaisieInterne,
  VALEURS_SAISIE_VIDES,
} from "@/shared/schemas/saisie";

import { SAISIE_DE_CLAIRE } from "../aides/formulaire-depot";

// Schéma du formulaire I5 (story 2.3 ; FR-30, RM-12, AD-11) : mêmes champs,
// limites et messages que P1, plus le canal (Téléphone ou Email, en premier)
// et la case « La personne a été informée », avec ses propres messages.

const SAISIE_TELEPHONE = { ...SAISIE_DE_CLAIRE, canal: "telephone" };

describe("champs et valeurs de départ", () => {
  it("le canal d'abord, puis les champs de P1 dans leur ordre", () => {
    expect(CHAMPS_SAISIE).toEqual(["canal", ...CHAMPS_DEPOT]);
  });

  it("aucun canal choisi d'avance, case jamais cochée d'avance", () => {
    expect(VALEURS_SAISIE_VIDES.canal).toBe("");
    expect(VALEURS_SAISIE_VIDES.personneInformee).toBe(false);
  });

  it("canaux proposés : Téléphone et Email, jamais Formulaire", () => {
    expect(CANAUX_SAISIE).toEqual(["telephone", "email"]);
    expect(CANAUX_SAISIE).not.toContain("formulaire");
    for (const canal of CANAUX_SAISIE) expect(CANAUX).toContain(canal);
  });
});

describe("saisie complète", () => {
  it.each(CANAUX_SAISIE)("canal %s : acceptée, nettoyée comme en P1", (canal) => {
    const resultat = validerSaisieInterne({ ...SAISIE_DE_CLAIRE, canal, nom: "  Claire Martin  " });
    expect(resultat).toEqual({
      ok: true,
      donnees: { ...(validerDepot(SAISIE_DE_CLAIRE) as { donnees: object }).donnees, canal },
    });
    if (resultat.ok) expect(resultat.donnees.telephone).toBeNull();
  });
});

describe("canal", () => {
  it.each(["", undefined, null])("oublié (%s) : « Le canal est obligatoire »", (canal) => {
    expect(validerSaisieInterne({ ...SAISIE_DE_CLAIRE, canal })).toEqual({
      ok: false,
      champs: { canal: "Le canal est obligatoire" },
    });
  });

  it.each(["formulaire", "fax", "TELEPHONE", 1, true])("interdit (%s) : refusé", (canal) => {
    expect(validerSaisieInterne({ ...SAISIE_DE_CLAIRE, canal })).toEqual({
      ok: false,
      champs: { canal: MESSAGES_SAISIE.canalInconnu },
    });
  });
});

describe("case « La personne a été informée » (RM-12)", () => {
  it("oubliée : le message de l'UX sous la case", () => {
    expect(MESSAGES_SAISIE.caseObligatoire).toBe(
      "Confirmez que la personne a été informée de l'usage de ses données",
    );
    for (const personneInformee of [false, undefined, null, "true", 1, "on"]) {
      expect(validerSaisieInterne({ ...SAISIE_TELEPHONE, personneInformee })).toEqual({
        ok: false,
        champs: { personneInformee: MESSAGES_SAISIE.caseObligatoire },
      });
    }
  });
});

describe("champs de P1 : mêmes messages qu'en P1", () => {
  it.each([
    ["nom", "", MESSAGES_DEPOT.nomObligatoire],
    ["nom", "x".repeat(101), MESSAGES_DEPOT.nomTropLong],
    ["email", "claire", MESSAGES_DEPOT.emailForme],
    ["telephone", "1".repeat(31), MESSAGES_DEPOT.telephoneTropLong],
    ["entreprise", "x".repeat(101), MESSAGES_DEPOT.entrepriseTropLongue],
    ["categorieId", "", MESSAGES_DEPOT.categorieObligatoire],
    ["objet", "x".repeat(151), MESSAGES_DEPOT.objetTropLong],
    ["description", "x".repeat(5001), MESSAGES_DEPOT.descriptionTropLongue],
  ])("%s : même refus qu'en P1", (champ, valeur, message) => {
    const enP1 = validerDepot({ ...SAISIE_DE_CLAIRE, [champ]: valeur });
    const enI5 = validerSaisieInterne({ ...SAISIE_TELEPHONE, [champ]: valeur });
    expect(enI5).toEqual(enP1);
    expect(enI5).toEqual({ ok: false, champs: { [champ]: message } });
  });

  it("description de moins de 10 caractères : message de P1", () => {
    expect(validerSaisieInterne({ ...SAISIE_TELEPHONE, description: "Court" })).toEqual({
      ok: false,
      champs: { description: MESSAGES_DEPOT.descriptionTropCourte },
    });
  });

  it("formulaire vierge : un message par champ obligatoire, dans l'ordre de l'écran", () => {
    const resultat = validerSaisieInterne(VALEURS_SAISIE_VIDES);
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(listerErreursSaisie(resultat.champs).map(({ champ }) => champ)).toEqual([
      "canal",
      "nom",
      "email",
      "categorieId",
      "objet",
      "description",
      "personneInformee",
    ]);
  });

  it("ce qui n'est pas un objet est lu comme un formulaire vierge", () => {
    expect(validerSaisieInterne("n'importe quoi")).toEqual(validerSaisieInterne({}));
  });

  it("erreur d'un seul champ", () => {
    expect(erreurDuChampSaisie("canal", { ...VALEURS_SAISIE_VIDES })).toBe("Le canal est obligatoire");
    expect(erreurDuChampSaisie("canal", { ...VALEURS_SAISIE_VIDES, canal: "email" })).toBeUndefined();
  });
});

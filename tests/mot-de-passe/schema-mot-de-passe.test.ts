import { describe, expect, it } from "vitest";

// Schéma de l'écran I2 (FR-21, NFR-11, AD-11) : 12 caractères au moins,
// 72 octets au plus (limite de Supabase Auth), confirmation identique, avec
// les messages exacts de l'UX.

import { MESSAGE_SESSION_EXPIREE, MESSAGES_MOT_DE_PASSE } from "@/shared/messages";
import { erreurDuChampMotDePasse, validerMotDePasse } from "@/shared/schemas/mot-de-passe";

const VALIDE = "Un nouveau mot de passe 2026";

describe("messages de l'UX", () => {
  it("textes exacts d'I2 et d'I1", () => {
    expect(MESSAGES_MOT_DE_PASSE).toMatchObject({
      texte: "Pour sécuriser votre compte, choisissez votre propre mot de passe.",
      nouveauMotDePasse: "Nouveau mot de passe",
      confirmer: "Confirmer",
      regle: "12 caractères minimum",
      tropCourt: "12 caractères minimum",
      nonIdentiques: "Les deux mots de passe ne sont pas identiques",
      identiqueAuTemporaire: "Choisissez un mot de passe différent du mot de passe temporaire",
      enregistrer: "Enregistrer et continuer",
      enregistrementEnCours: "Enregistrement…",
      enregistrementImpossible: "Votre mot de passe n'a pas pu être enregistré. Réessayez.",
      enregistre: "Mot de passe enregistré",
    });
    expect(MESSAGE_SESSION_EXPIREE).toBe("Votre session a expiré. Reconnectez-vous pour continuer.");
  });
});

describe("validerMotDePasse", () => {
  it("12 caractères ou plus, identiques : accepté, intact (espaces gardées)", () => {
    expect(validerMotDePasse({ motDePasse: VALIDE, confirmation: VALIDE })).toEqual({
      ok: true,
      donnees: { motDePasse: VALIDE, confirmation: VALIDE },
    });
    const avecEspaces = "  douze cars ";
    expect(validerMotDePasse({ motDePasse: avecEspaces, confirmation: avecEspaces })).toEqual({
      ok: true,
      donnees: { motDePasse: avecEspaces, confirmation: avecEspaces },
    });
  });

  it("exactement 12 caractères (accents comptés pour un) : accepté", () => {
    expect(validerMotDePasse({ motDePasse: "éééééééééééé", confirmation: "éééééééééééé" }).ok).toBe(true);
  });

  it.each(["", "a", "onze caract"])("« %s » (moins de 12) : « 12 caractères minimum » sous le 1er champ", (court) => {
    expect(validerMotDePasse({ motDePasse: court, confirmation: court })).toEqual({
      ok: false,
      champs: { motDePasse: "12 caractères minimum" },
    });
  });

  it("confirmation différente : message sous « Confirmer »", () => {
    expect(validerMotDePasse({ motDePasse: VALIDE, confirmation: `${VALIDE}!` })).toEqual({
      ok: false,
      champs: { confirmation: "Les deux mots de passe ne sont pas identiques" },
    });
    expect(validerMotDePasse({ motDePasse: VALIDE, confirmation: "" })).toMatchObject({
      champs: { confirmation: "Les deux mots de passe ne sont pas identiques" },
    });
  });

  it("trop court et différents : les deux messages, dans l'ordre de l'écran", () => {
    const resultat = validerMotDePasse({ motDePasse: "court", confirmation: "autre" });
    expect(resultat).toEqual({
      ok: false,
      champs: {
        motDePasse: "12 caractères minimum",
        confirmation: "Les deux mots de passe ne sont pas identiques",
      },
    });
    expect(Object.keys(resultat.ok ? {} : resultat.champs)).toEqual(["motDePasse", "confirmation"]);
  });

  it("plus de 72 octets : refusé (limite de Supabase Auth)", () => {
    const ascii = "a".repeat(72);
    expect(validerMotDePasse({ motDePasse: ascii, confirmation: ascii }).ok).toBe(true);
    const tropLong = "a".repeat(73);
    expect(validerMotDePasse({ motDePasse: tropLong, confirmation: tropLong })).toEqual({
      ok: false,
      champs: { motDePasse: MESSAGES_MOT_DE_PASSE.tropLong },
    });
    const accents = "é".repeat(37); // 37 caractères, 74 octets
    expect(validerMotDePasse({ motDePasse: accents, confirmation: accents })).toMatchObject({
      champs: { motDePasse: MESSAGES_MOT_DE_PASSE.tropLong },
    });
  });

  it("n'importe quoi envoyé directement : refusé, messages de l'UX", () => {
    for (const saisie of [null, "texte", 42, [VALIDE], {}, { motDePasse: 1, confirmation: true }]) {
      expect(validerMotDePasse(saisie)).toMatchObject({
        ok: false,
        champs: { motDePasse: "12 caractères minimum" },
      });
    }
  });
});

describe("erreurDuChampMotDePasse", () => {
  it("donne le message d'un seul champ", () => {
    expect(erreurDuChampMotDePasse("motDePasse", { motDePasse: "court", confirmation: VALIDE })).toBe(
      "12 caractères minimum",
    );
    expect(erreurDuChampMotDePasse("confirmation", { motDePasse: VALIDE, confirmation: VALIDE })).toBeUndefined();
  });
});

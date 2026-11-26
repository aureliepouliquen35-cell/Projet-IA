import { describe, expect, it } from "vitest";

import { LONGUEURS_MAXIMALES, ROLES } from "@/shared/constantes";
import { MESSAGES_COMPTE, MESSAGES_PARAMETRES } from "@/shared/messages";
import {
  CHAMPS_COMPTE,
  CHAMPS_MODIFICATION,
  schemaCompte,
  schemaModificationCompte,
  validerCompte,
  validerModificationCompte,
} from "@/shared/schemas/compte";
import { CHAMPS_PARAMETRES, validerParametres } from "@/shared/schemas/parametres";

// Schémas de la création d'un compte (A1) et des informations générales (A3),
// AD-11 : une seule définition des champs, des limites et des messages.

const COMPTE = {
  nom: "Lucas Bernard",
  email: "lucas@exemple.fr",
  role: "collaborateur",
  motDePasseTemporaire: "abcdefghijkl",
};

describe("schéma du compte", () => {
  it("accepte une saisie correcte et la nettoie", () => {
    expect(validerCompte({ ...COMPTE, nom: " Lucas Bernard ", email: " lucas@exemple.fr" })).toEqual({
      ok: true,
      donnees: COMPTE,
    });
  });

  it("écrit l'email en minuscules, comme Supabase Auth", () => {
    expect(validerCompte({ ...COMPTE, email: " Lucas.Bernard@Exemple.FR " })).toEqual({
      ok: true,
      donnees: { ...COMPTE, email: "lucas.bernard@exemple.fr" },
    });
  });

  it("n'accepte que les deux rôles de la base", () => {
    expect(ROLES).toEqual(["collaborateur", "administrateur"]);
    for (const role of ROLES) expect(validerCompte({ ...COMPTE, role }).ok).toBe(true);
    for (const role of ["Administrateur", "admin", "", null]) {
      expect(validerCompte({ ...COMPTE, role })).toEqual({
        ok: false,
        champs: { role: MESSAGES_COMPTE.roleInconnu },
      });
    }
  });

  it("accepte 100 caractères pour le nom, refuse 101 (émojis comptés pour un)", () => {
    expect(validerCompte({ ...COMPTE, nom: "é".repeat(LONGUEURS_MAXIMALES.nom) }).ok).toBe(true);
    expect(validerCompte({ ...COMPTE, nom: "😀".repeat(100) }).ok).toBe(true);
    expect(validerCompte({ ...COMPTE, nom: "a".repeat(101) })).toEqual({
      ok: false,
      champs: { nom: "Le nom ne doit pas dépasser 100 caractères" },
    });
  });

  it("refuse un email mal formé ou trop long", () => {
    expect(validerCompte({ ...COMPTE, email: "lucas@exemple" })).toEqual({
      ok: false,
      champs: { email: "L'email doit avoir la forme nom@exemple.fr" },
    });
    expect(validerCompte({ ...COMPTE, email: `${"a".repeat(92)}@exemple.fr` })).toEqual({
      ok: false,
      champs: { email: MESSAGES_COMPTE.emailTropLong },
    });
  });

  it("exige un mot de passe temporaire de 12 caractères au moins, sans le nettoyer", () => {
    expect(validerCompte({ ...COMPTE, motDePasseTemporaire: "a".repeat(11) })).toEqual({
      ok: false,
      champs: { motDePasseTemporaire: "12 caractères minimum" },
    });
    expect(validerCompte({ ...COMPTE, motDePasseTemporaire: " abcdefghij " })).toEqual({
      ok: true,
      donnees: { ...COMPTE, motDePasseTemporaire: " abcdefghij " },
    });
  });

  it("une saisie vide donne un message par champ, dans l'ordre de l'écran", () => {
    const validation = validerCompte(null);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(Object.keys(validation.champs)).toEqual([...CHAMPS_COMPTE]);
    expect(validation.champs.nom).toBe(MESSAGES_COMPTE.nomObligatoire);
    expect(validation.champs.email).toBe(MESSAGES_COMPTE.emailObligatoire);
  });

  it("les messages d'A1 sont repris mot pour mot", () => {
    expect(MESSAGES_COMPTE.emailDejaUtilise).toBe("Cet email est déjà utilisé par un autre compte.");
    expect(MESSAGES_COMPTE.compteExistant).toBe("Un compte existe déjà avec cet email.");
  });
});

describe("schéma des informations générales", () => {
  const PARAMETRES = {
    telephone: "01 23 45 67 89",
    emailContact: "contact@exemple.fr",
    contactDonnees: "donnees@exemple.fr",
  };

  it("accepte une saisie correcte ; le téléphone vide devient null", () => {
    expect(validerParametres(PARAMETRES)).toEqual({ ok: true, donnees: PARAMETRES });
    expect(validerParametres({ ...PARAMETRES, telephone: "" })).toEqual({
      ok: true,
      donnees: { ...PARAMETRES, telephone: null },
    });
  });

  it("le contact données est un texte libre (email ou adresse)", () => {
    expect(validerParametres({ ...PARAMETRES, contactDonnees: "Service RGPD, 12 rue de Paris, 75001 Paris" }).ok).toBe(true);
  });

  it("une saisie vide : les deux champs obligatoires, dans l'ordre de l'écran", () => {
    expect(validerParametres({})).toEqual({
      ok: false,
      champs: {
        emailContact: MESSAGES_PARAMETRES.champObligatoire,
        contactDonnees: MESSAGES_PARAMETRES.champObligatoire,
      },
    });
    expect(CHAMPS_PARAMETRES).toEqual(["telephone", "emailContact", "contactDonnees"]);
    expect(MESSAGES_PARAMETRES.champObligatoire).toBe("Ce champ est obligatoire");
  });

  it("refuse un email de contact mal formé", () => {
    expect(validerParametres({ ...PARAMETRES, emailContact: "contact @exemple.fr" })).toEqual({
      ok: false,
      champs: { emailContact: "L'email doit avoir la forme nom@exemple.fr" },
    });
  });
});

describe("schéma de la modification du nom ou du rôle (story 3.3)", () => {
  const ID = "7E2A9C41-3B5D-4F68-9A0C-2D4E6F8A1B3C";

  it("compte, nom et rôle ; nom nettoyé, identifiant en minuscules ; l'email n'en fait pas partie", () => {
    expect(CHAMPS_MODIFICATION).toEqual(["compteId", "nom", "role"]);
    expect(
      validerModificationCompte({ compteId: ID, nom: "  Lucas Bernard ", role: "administrateur", email: "x@exemple.fr" }),
    ).toEqual({ ok: true, donnees: { compteId: ID.toLowerCase(), nom: "Lucas Bernard", role: "administrateur" } });
  });

  it("mêmes règles et mêmes messages du nom et du rôle qu'à la création (schéma partagé)", () => {
    expect(schemaModificationCompte.shape.nom).toBe(schemaCompte.shape.nom);
    expect(schemaModificationCompte.shape.role).toBe(schemaCompte.shape.role);
    expect(validerModificationCompte({ compteId: ID, nom: " ", role: "collaborateur" })).toEqual({
      ok: false,
      champs: { nom: MESSAGES_COMPTE.nomObligatoire },
    });
    expect(validerModificationCompte({ compteId: ID, nom: "a".repeat(LONGUEURS_MAXIMALES.nom + 1), role: "x" })).toEqual({
      ok: false,
      champs: { nom: MESSAGES_COMPTE.nomTropLong, role: MESSAGES_COMPTE.roleInconnu },
    });
  });

  it("compte mal désigné : refusé", () => {
    expect(validerModificationCompte({ compteId: "pas-un-uuid", nom: "Lucas", role: "collaborateur" })).toEqual({
      ok: false,
      champs: { compteId: MESSAGES_COMPTE.compteInvalide },
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  compterCaracteres,
  FORME_EMAIL,
  formaterNombre,
  LONGUEUR_MINIMALE_DESCRIPTION,
  LONGUEURS_MAXIMALES,
} from "@/shared/constantes";
import { MESSAGES_DEPOT, resumeErreurs } from "@/shared/messages";
import {
  CHAMPS_DEPOT,
  erreurDuChamp,
  listerErreurs,
  validerDepot,
  VALEURS_DEPOT_VIDES,
  type ValeursDepot,
} from "@/shared/schemas/depot";

import { SAISIE_DE_CLAIRE } from "../aides/formulaire-depot";

// AD-11 : un seul schéma pour le formulaire de dépôt, avec les limites du PRD
// (FR-1) et les messages exacts d'EXPERIENCE.md (P1, « Erreur de saisie »).

const avec = (modifications: Partial<ValeursDepot>): ValeursDepot => ({
  ...SAISIE_DE_CLAIRE,
  ...modifications,
});

const erreursDe = (saisie: unknown) => {
  const validation = validerDepot(saisie);
  return validation.ok ? {} : validation.champs;
};

describe("limites du PRD (FR-1)", () => {
  it("fixe les longueurs maximales et le minimum de la description", () => {
    expect(LONGUEURS_MAXIMALES).toEqual({
      nom: 100,
      email: 100,
      telephone: 30,
      entreprise: 100,
      objet: 150,
      description: 5000,
    });
    expect(LONGUEUR_MINIMALE_DESCRIPTION).toBe(10);
  });
});

describe("messages exacts d'EXPERIENCE.md", () => {
  it("reprend mot pour mot les messages cités par l'UX", () => {
    expect(MESSAGES_DEPOT.emailObligatoire).toBe("L'email est obligatoire");
    expect(MESSAGES_DEPOT.emailForme).toBe("L'email doit avoir la forme nom@exemple.fr");
    expect(MESSAGES_DEPOT.descriptionTropCourte).toBe(
      "La description doit faire au moins 10 caractères",
    );
    expect(MESSAGES_DEPOT.objetTropLong).toBe("L'objet ne doit pas dépasser 150 caractères");
    expect(MESSAGES_DEPOT.descriptionTropLongue).toBe(
      "La description ne doit pas dépasser 5 000 caractères",
    );
    expect(MESSAGES_DEPOT.caseObligatoire).toBe(
      "Cochez la case pour confirmer avoir lu l'usage de vos données",
    );
    expect(MESSAGES_DEPOT.nomTropLong).toBe("Le nom ne doit pas dépasser 100 caractères");
  });

  it("donne la même forme aux autres limites", () => {
    expect(MESSAGES_DEPOT.emailTropLong).toBe("L'email ne doit pas dépasser 100 caractères");
    expect(MESSAGES_DEPOT.telephoneTropLong).toBe(
      "Le téléphone ne doit pas dépasser 30 caractères",
    );
    expect(MESSAGES_DEPOT.entrepriseTropLongue).toBe(
      "L'entreprise ne doit pas dépasser 100 caractères",
    );
  });

  it("accorde le résumé : « 1 champ est », « 2 champs sont »", () => {
    expect(resumeErreurs(1)).toBe("1 champ est à corriger");
    expect(resumeErreurs(2)).toBe("2 champs sont à corriger");
    expect(resumeErreurs(7)).toBe("7 champs sont à corriger");
  });
});

describe("validerDepot", () => {
  it("accepte la saisie de Claire et la nettoie", () => {
    const validation = validerDepot(
      avec({ nom: "  Claire Martin ", email: " claire.martin@cabinet-martin.fr  " }),
    );
    expect(validation).toEqual({
      ok: true,
      donnees: {
        ...SAISIE_DE_CLAIRE,
        // Un champ facultatif laissé vide est enregistré « vide » (null).
        telephone: null,
      },
    });
  });

  it("garde les retours à la ligne et les espaces à l'intérieur de la description", () => {
    const description = "Première ligne.\n\n  Deuxième ligne,  avec des espaces.";
    const validation = validerDepot(avec({ description: `\n${description}\n ` }));
    expect(validation.ok && validation.donnees.description).toBe(description);
  });

  it("formulaire vierge : un message par champ obligatoire, dans l'ordre de l'écran", () => {
    const champs = erreursDe(VALEURS_DEPOT_VIDES);
    expect(champs).toEqual({
      nom: "Le nom est obligatoire",
      email: "L'email est obligatoire",
      categorieId: "La catégorie est obligatoire",
      objet: "L'objet est obligatoire",
      description: "La description est obligatoire",
      personneInformee: "Cochez la case pour confirmer avoir lu l'usage de vos données",
    });
    expect(Object.keys(champs)).toEqual([
      "nom",
      "email",
      "categorieId",
      "objet",
      "description",
      "personneInformee",
    ]);
  });

  it("traite un champ rempli d'espaces comme un champ vide", () => {
    expect(erreursDe(avec({ nom: "   ", objet: "\t", description: " \n " }))).toEqual({
      nom: MESSAGES_DEPOT.nomObligatoire,
      objet: MESSAGES_DEPOT.objetObligatoire,
      description: MESSAGES_DEPOT.descriptionObligatoire,
    });
  });

  it("email oublié : un seul champ à corriger, « L'email est obligatoire »", () => {
    expect(erreursDe(avec({ email: "" }))).toEqual({ email: "L'email est obligatoire" });
  });

  it("case non cochée : un seul champ à corriger, le message de l'UX", () => {
    expect(erreursDe(avec({ personneInformee: false }))).toEqual({
      personneInformee: "Cochez la case pour confirmer avoir lu l'usage de vos données",
    });
  });

  it.each(["claire@", "claire", "@cabinet.fr", "claire@cabinet", "claire martin@cabinet.fr", "a@b@c.fr"])(
    "refuse l'email « %s » : il n'a pas la forme nom@exemple.fr",
    (email) => {
      expect(erreursDe(avec({ email }))).toEqual({
        email: "L'email doit avoir la forme nom@exemple.fr",
      });
    },
  );

  it.each(["claire@cabinet.fr", "c.martin+nova@cabinet-martin.co.uk", "hélène@société.fr"])(
    "accepte l'email « %s »",
    (email) => {
      expect(validerDepot(avec({ email })).ok).toBe(true);
      expect(FORME_EMAIL.test(email)).toBe(true);
    },
  );

  it("refuse au-delà de chaque limite, accepte à la limite exacte", () => {
    const aLaLimite = avec({
      nom: "n".repeat(100),
      email: `${"e".repeat(89)}@exemple.fr`,
      telephone: "1".repeat(30),
      entreprise: "s".repeat(100),
      objet: "o".repeat(150),
      description: "d".repeat(5000),
    });
    expect(aLaLimite.email).toHaveLength(100);
    expect(validerDepot(aLaLimite).ok).toBe(true);

    expect(
      erreursDe(
        avec({
          nom: "n".repeat(101),
          email: `${"e".repeat(90)}@exemple.fr`,
          telephone: "1".repeat(31),
          entreprise: "s".repeat(101),
          objet: "o".repeat(151),
          description: "d".repeat(5001),
        }),
      ),
    ).toEqual({
      nom: "Le nom ne doit pas dépasser 100 caractères",
      email: "L'email ne doit pas dépasser 100 caractères",
      telephone: "Le téléphone ne doit pas dépasser 30 caractères",
      entreprise: "L'entreprise ne doit pas dépasser 100 caractères",
      objet: "L'objet ne doit pas dépasser 150 caractères",
      description: "La description ne doit pas dépasser 5 000 caractères",
    });
  });

  it("description de 9 caractères refusée, de 10 acceptée", () => {
    expect(erreursDe(avec({ description: "123456789" }))).toEqual({
      description: "La description doit faire au moins 10 caractères",
    });
    expect(validerDepot(avec({ description: "1234567890" })).ok).toBe(true);
    // Les espaces autour ne comptent pas.
    expect(erreursDe(avec({ description: "  123456789  " }))).toEqual({
      description: MESSAGES_DEPOT.descriptionTropCourte,
    });
  });

  it("compte les caractères comme la base : un émoji ou un accent compte pour un", () => {
    expect("🙂".length).toBe(2);
    expect(compterCaracteres("🙂")).toBe(1);
    expect(compterCaracteres("été")).toBe(3);
    // 150 émojis : 300 unités pour JavaScript, 150 caractères pour la base.
    expect(validerDepot(avec({ objet: "🙂".repeat(150) })).ok).toBe(true);
    expect(erreursDe(avec({ objet: "🙂".repeat(151) }))).toEqual({
      objet: MESSAGES_DEPOT.objetTropLong,
    });
    // 5 émojis : 10 unités pour JavaScript, mais 5 caractères seulement.
    expect(erreursDe(avec({ description: "🙂".repeat(5) }))).toEqual({
      description: MESSAGES_DEPOT.descriptionTropCourte,
    });
  });

  it("ne coupe jamais un texte trop long : il est refusé tel quel", () => {
    const objet = "o".repeat(151);
    const validation = validerDepot(avec({ objet }));
    expect(validation.ok).toBe(false);
  });

  it("refuse une catégorie qui n'est pas un identifiant", () => {
    expect(erreursDe(avec({ categorieId: "'; drop table demandes; --" }))).toEqual({
      categorieId: MESSAGES_DEPOT.categorieIndisponible,
    });
  });

  it("appel direct avec n'importe quoi : des erreurs de saisie, jamais d'exception", () => {
    for (const saisie of [null, undefined, "texte", 42, [], { nom: 12, email: {}, personneInformee: "oui" }]) {
      const validation = validerDepot(saisie);
      expect(validation.ok).toBe(false);
      const champs = erreursDe(saisie);
      expect(champs.nom).toBe(MESSAGES_DEPOT.nomObligatoire);
      expect(champs.personneInformee).toBe(MESSAGES_DEPOT.caseObligatoire);
      // Tous les messages sont en français.
      for (const message of Object.values(champs)) {
        expect(Object.values(MESSAGES_DEPOT)).toContain(message);
      }
    }
  });

  it("ignore tout champ qui n'est pas dans le formulaire (statut, priorité, référence…)", () => {
    const validation = validerDepot({
      ...SAISIE_DE_CLAIRE,
      statut: "traitee",
      priorite: "urgente",
      canal: "telephone",
      reference: "NOVA-2026-9999",
    });
    expect(validation.ok && Object.keys(validation.donnees).sort()).toEqual([...CHAMPS_DEPOT].sort());
  });
});

describe("aides du formulaire", () => {
  it("erreurDuChamp ne renvoie que le message du champ demandé", () => {
    const valeurs = avec({ email: "claire@", personneInformee: false });
    expect(erreurDuChamp("email", valeurs)).toBe(MESSAGES_DEPOT.emailForme);
    expect(erreurDuChamp("nom", valeurs)).toBeUndefined();
    expect(erreurDuChamp("email", SAISIE_DE_CLAIRE)).toBeUndefined();
  });

  it("listerErreurs range les erreurs dans l'ordre de l'écran", () => {
    expect(
      listerErreurs({
        personneInformee: MESSAGES_DEPOT.caseObligatoire,
        email: MESSAGES_DEPOT.emailObligatoire,
      }),
    ).toEqual([
      { champ: "email", message: MESSAGES_DEPOT.emailObligatoire },
      { champ: "personneInformee", message: MESSAGES_DEPOT.caseObligatoire },
    ]);
  });

  it("formaterNombre sépare les milliers par une espace", () => {
    expect(formaterNombre(0)).toBe("0");
    expect(formaterNombre(150)).toBe("150");
    expect(formaterNombre(5000)).toBe("5 000");
    expect(formaterNombre(1234567)).toBe("1 234 567");
  });
});

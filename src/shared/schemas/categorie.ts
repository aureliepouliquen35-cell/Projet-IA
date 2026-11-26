import { z } from "zod";

import { compterCaracteres, LONGUEUR_MAXIMALE_CATEGORIE } from "@/shared/constantes";
import { MESSAGES_CATEGORIES } from "@/shared/messages";
import { FORME_IDENTIFIANT } from "@/shared/schemas/depot";

import { validerSaisie, type Validation } from "./validation";

// Saisies de l'écran A2 (FR-26) : le nom d'une catégorie, pour l'ajout et
// le renommage (story 4.1), puis la catégorie visée par « Désactiver »,
// « Réactiver » ou « Supprimer » (story 4.2). Une seule définition des
// limites et des messages (AD-11), lue par l'écran et revérifiée par les
// Server Functions. La base porte la même limite
// (`categories_nom_longueur_check`) et retire aussi les espaces de bord.

/** Nom nettoyé (espaces de bord retirés), obligatoire, 50 caractères au plus. */
export const schemaNomCategorie = z
  .string({ error: MESSAGES_CATEGORIES.nomObligatoire })
  .trim()
  .min(1, MESSAGES_CATEGORIES.nomObligatoire)
  .refine((texte) => compterCaracteres(texte) <= LONGUEUR_MAXIMALE_CATEGORIE, MESSAGES_CATEGORIES.nomTropLong);

// ---------------------------------------------------------------------------
// Ajout
// ---------------------------------------------------------------------------

/** Champ de l'ajout : « Nouvelle catégorie ». */
export const CHAMPS_NOUVELLE_CATEGORIE = ["nom"] as const;

export const schemaNouvelleCategorie = z.object({ nom: schemaNomCategorie });

export type DonneesNouvelleCategorie = z.infer<typeof schemaNouvelleCategorie>;

export function validerNouvelleCategorie(saisie: unknown): Validation<DonneesNouvelleCategorie> {
  return validerSaisie(schemaNouvelleCategorie, CHAMPS_NOUVELLE_CATEGORIE, saisie);
}

// ---------------------------------------------------------------------------
// Renommage
// ---------------------------------------------------------------------------

/** Champs du renommage : la catégorie visée, puis son nouveau nom. */
export const CHAMPS_RENOMMAGE_CATEGORIE = ["categorieId", "nom"] as const;

/**
 * Identifiant d'une catégorie (UUID), mis en minuscules comme dans la base.
 * Mal formé : seul un appel direct peut l'envoyer ; `message` est celui de
 * la panne de l'action concernée.
 */
const schemaIdentifiantCategorie = (message: string) =>
  z
    .string({ error: message })
    .regex(FORME_IDENTIFIANT, message)
    .transform((texte) => texte.toLowerCase());

export const schemaRenommageCategorie = z.object({
  categorieId: schemaIdentifiantCategorie(MESSAGES_CATEGORIES.enregistrementImpossible),
  nom: schemaNomCategorie,
});

export type DonneesRenommageCategorie = z.infer<typeof schemaRenommageCategorie>;

export function validerRenommageCategorie(saisie: unknown): Validation<DonneesRenommageCategorie> {
  return validerSaisie(schemaRenommageCategorie, CHAMPS_RENOMMAGE_CATEGORIE, saisie);
}

// ---------------------------------------------------------------------------
// Désactivation, réactivation, suppression (story 4.2)
// ---------------------------------------------------------------------------

/** Champs de « Désactiver » et « Réactiver » : la catégorie visée, puis l'état voulu. */
export const CHAMPS_ETAT_CATEGORIE = ["categorieId", "active"] as const;

export const schemaEtatCategorie = z.object({
  categorieId: schemaIdentifiantCategorie(MESSAGES_CATEGORIES.modificationImpossible),
  /** Faux : désactiver ; vrai : réactiver. Seul un appel direct peut envoyer autre chose. */
  active: z.boolean({ error: MESSAGES_CATEGORIES.modificationImpossible }),
});

export type DonneesEtatCategorie = z.infer<typeof schemaEtatCategorie>;

export function validerEtatCategorie(saisie: unknown): Validation<DonneesEtatCategorie> {
  return validerSaisie(schemaEtatCategorie, CHAMPS_ETAT_CATEGORIE, saisie);
}

/** Champ de « Supprimer » : la catégorie visée. */
export const CHAMPS_SUPPRESSION_CATEGORIE = ["categorieId"] as const;

export const schemaSuppressionCategorie = z.object({
  categorieId: schemaIdentifiantCategorie(MESSAGES_CATEGORIES.modificationImpossible),
});

export type DonneesSuppressionCategorie = z.infer<typeof schemaSuppressionCategorie>;

export function validerSuppressionCategorie(saisie: unknown): Validation<DonneesSuppressionCategorie> {
  return validerSaisie(schemaSuppressionCategorie, CHAMPS_SUPPRESSION_CATEGORIE, saisie);
}

/**
 * Erreur du nom seul, telle que l'écran l'affiche sous le champ, ou `null`
 * si le nom est accepté. Même schéma que les Server Functions.
 */
export function erreurNomCategorie(nom: string): string | null {
  const resultat = schemaNomCategorie.safeParse(nom);
  return resultat.success ? null : (resultat.error.issues[0]?.message ?? MESSAGES_CATEGORIES.nomObligatoire);
}

/**
 * Message à garder pendant la frappe, quand un message est déjà affiché
 * (EXPERIENCE.md, Champ de formulaire : un message disparaît dès que le champ
 * est corrigé, et l'obligation n'est vérifiée qu'à l'envoi). Un champ vidé
 * n'affiche donc rien : « Ce champ est obligatoire » ne revient qu'au
 * prochain envoi. Un nom encore trop long garde son message.
 */
export function erreurPendantSaisie(nom: string): string | null {
  return nom.trim() === "" ? null : erreurNomCategorie(nom);
}

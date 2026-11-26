import { z } from "zod";

import { compterCaracteres, LONGUEUR_MAXIMALE_CATEGORIE } from "@/shared/constantes";
import { MESSAGES_CATEGORIES } from "@/shared/messages";
import { FORME_IDENTIFIANT } from "@/shared/schemas/depot";

import { validerSaisie, type Validation } from "./validation";

// Nom d'une catégorie (FR-26) : ajout et renommage de l'écran A2 (story
// 4.1). Une seule définition des limites et des messages (AD-11), lue par
// l'écran et revérifiée par les Server Functions. La base porte la même
// limite (`categories_nom_longueur_check`) et retire aussi les espaces de
// bord.

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

export const schemaRenommageCategorie = z.object({
  // Identifiant de la catégorie (UUID), en minuscules comme dans la base.
  // Mal formé : seul un appel direct peut l'envoyer.
  categorieId: z
    .string({ error: MESSAGES_CATEGORIES.enregistrementImpossible })
    .regex(FORME_IDENTIFIANT, MESSAGES_CATEGORIES.enregistrementImpossible)
    .transform((texte) => texte.toLowerCase()),
  nom: schemaNomCategorie,
});

export type DonneesRenommageCategorie = z.infer<typeof schemaRenommageCategorie>;

export function validerRenommageCategorie(saisie: unknown): Validation<DonneesRenommageCategorie> {
  return validerSaisie(schemaRenommageCategorie, CHAMPS_RENOMMAGE_CATEGORIE, saisie);
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

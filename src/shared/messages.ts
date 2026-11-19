// Textes des écrans d'erreur, des réponses d'erreur et des erreurs de saisie
// (EXPERIENCE.md). Repris mot pour mot : ne pas reformuler ici sans changer
// l'UX.

import {
  formaterNombre,
  LONGUEUR_MINIMALE_DESCRIPTION,
  LONGUEURS_MAXIMALES,
} from "@/shared/constantes";

/** S3 et réponse `ERREUR_INTERNE`. */
export const MESSAGE_ERREUR_INATTENDUE = "Une erreur inattendue s'est produite.";

/** S2 et réponse `INTROUVABLE`. */
export const MESSAGE_PAGE_INTROUVABLE =
  "Cette page n'existe pas ou a été supprimée.";

/**
 * Titre du résumé d'erreurs en haut d'un formulaire, et message d'une réponse
 * `VALIDATION` : « 1 champ est à corriger », « 2 champs sont à corriger ».
 */
export function resumeErreurs(nombre: number): string {
  return nombre <= 1
    ? "1 champ est à corriger"
    : `${nombre} champs sont à corriger`;
}

const depasse = (sujet: string, maximum: number) =>
  `${sujet} ne doit pas dépasser ${formaterNombre(maximum)} caractères`;

/**
 * Messages du formulaire de dépôt (P1, « Erreur de saisie »). Ceux qui ne
 * sont pas cités par EXPERIENCE.md suivent la même forme, comme il le
 * demande (« Le nom ne doit pas dépasser 100 caractères »…).
 */
export const MESSAGES_DEPOT = {
  nomObligatoire: "Le nom est obligatoire",
  nomTropLong: depasse("Le nom", LONGUEURS_MAXIMALES.nom),
  emailObligatoire: "L'email est obligatoire",
  emailForme: "L'email doit avoir la forme nom@exemple.fr",
  emailTropLong: depasse("L'email", LONGUEURS_MAXIMALES.email),
  telephoneTropLong: depasse("Le téléphone", LONGUEURS_MAXIMALES.telephone),
  entrepriseTropLongue: depasse("L'entreprise", LONGUEURS_MAXIMALES.entreprise),
  categorieObligatoire: "La catégorie est obligatoire",
  /** Catégorie désactivée entre l'affichage du formulaire et l'envoi. */
  categorieIndisponible:
    "Cette catégorie n'est plus proposée. Choisissez-en une autre.",
  objetObligatoire: "L'objet est obligatoire",
  objetTropLong: depasse("L'objet", LONGUEURS_MAXIMALES.objet),
  descriptionObligatoire: "La description est obligatoire",
  descriptionTropCourte: `La description doit faire au moins ${LONGUEUR_MINIMALE_DESCRIPTION} caractères`,
  descriptionTropLongue: depasse("La description", LONGUEURS_MAXIMALES.description),
  caseObligatoire:
    "Cochez la case pour confirmer avoir lu l'usage de vos données",
} as const;

/**
 * Réussite provisoire du dépôt : l'écran de confirmation P2 arrive avec la
 * story 1.4.
 */
export const MESSAGE_DEMANDE_ENREGISTREE =
  "Votre demande a bien été enregistrée.";

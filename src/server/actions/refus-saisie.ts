import "server-only";

import { MESSAGES_DEPOT, MESSAGES_SAISIE } from "@/shared/messages";
import type { ErreursChamps } from "@/shared/reponse";

// Refus prévus de la fonction SQL `saisir_demande` (story 2.3), traduits en
// erreurs de saisie par `actionSaisirDemande`. À part du fichier de la
// Server Function : un fichier « use server » n'exporte que des actions.

/** Refus prévus de `saisir_demande` (codes SQL propres à l'application). */
export const REFUS_PREVUS_SAISIE: ReadonlyMap<string, ErreursChamps> = new Map<string, ErreursChamps>([
  // Canal absent, ou autre que Téléphone et Email.
  ["NV401", { canal: MESSAGES_SAISIE.canalInconnu }],
  // Case « La personne a été informée » non cochée (RM-12).
  ["NV001", { personneInformee: MESSAGES_SAISIE.caseObligatoire }],
  // Catégorie inconnue, ou désactivée depuis l'affichage du formulaire.
  ["NV002", { categorieId: MESSAGES_DEPOT.categorieIndisponible }],
]);

/**
 * Codes des refus prévus : ceux que `saisir_demande` lève (`errcode`), en
 * majuscules comme dans la migration. Un test compare les deux listes.
 */
export const CODES_REFUS_PREVUS_SAISIE: readonly string[] = [...REFUS_PREVUS_SAISIE.keys()];

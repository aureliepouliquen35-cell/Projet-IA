import { z } from "zod";

import { CANAUX_SAISIE, type CanalSaisie } from "@/shared/constantes";
import { MESSAGES_SAISIE } from "@/shared/messages";
import type { ErreursChamps } from "@/shared/reponse";
import {
  CHAMPS_DEPOT,
  schemaDepot,
  VALEURS_DEPOT_VIDES,
  type ValeursDepot,
} from "@/shared/schemas/depot";
import { validerSaisie, type Validation } from "@/shared/schemas/validation";

// Formulaire de saisie interne (I5, FR-30) : la seule définition de ses
// champs, de ses limites et de ses messages (AD-11). Le navigateur s'en sert
// pour les messages immédiats, la Server Function pour la vérification qui
// fait foi ; la base répète les refus (`saisir_demande`).
//
// Mêmes champs, limites et messages que le formulaire public (P1,
// `schemaDepot`), avec en plus le canal (en premier) et, à la place de la
// case du demandeur, celle de l'utilisateur interne : « La personne a été
// informée de l'usage de ses données » (RM-12).

/** Champs du formulaire, dans l'ordre de l'écran : le canal d'abord. */
export const CHAMPS_SAISIE = ["canal", ...CHAMPS_DEPOT] as const;

export type ChampSaisie = (typeof CHAMPS_SAISIE)[number];

/** Ce que contient le formulaire pendant la saisie : aucun canal choisi d'avance. */
export type ValeursSaisie = ValeursDepot & { canal: CanalSaisie | "" };

export const VALEURS_SAISIE_VIDES: ValeursSaisie = { canal: "", ...VALEURS_DEPOT_VIDES };

export const schemaSaisie = schemaDepot.extend({
  canal: z.enum(CANAUX_SAISIE, {
    // Rien de choisi : « obligatoire » ; *Formulaire* ou une autre valeur
    // (appel direct) : le canal doit être Téléphone ou Email.
    error: (probleme) =>
      probleme.input === undefined || probleme.input === null || probleme.input === ""
        ? MESSAGES_SAISIE.canalObligatoire
        : MESSAGES_SAISIE.canalInconnu,
  }),
  // RM-12 : seule la valeur « vrai » est acceptée.
  personneInformee: z.literal(true, { error: MESSAGES_SAISIE.caseObligatoire }),
});

/** Demande vérifiée et nettoyée, prête à être enregistrée. */
export type DonneesSaisie = z.infer<typeof schemaSaisie>;

/**
 * Vérifie une saisie, d'où qu'elle vienne (formulaire ou appel direct).
 * En cas d'erreur : un seul message par champ, dans l'ordre de l'écran.
 */
export function validerSaisieInterne(saisie: unknown): Validation<DonneesSaisie> {
  return validerSaisie(schemaSaisie, CHAMPS_SAISIE, saisie);
}

/** Message d'erreur d'un seul champ, ou `undefined` s'il est correct. */
export function erreurDuChampSaisie(champ: ChampSaisie, valeurs: ValeursSaisie): string | undefined {
  const validation = validerSaisieInterne(valeurs);
  return validation.ok ? undefined : validation.champs[champ];
}

/** Erreurs d'un formulaire, dans l'ordre de l'écran (résumé d'erreurs). */
export function listerErreursSaisie(champs: ErreursChamps): { champ: ChampSaisie; message: string }[] {
  return CHAMPS_SAISIE.flatMap((champ) => (champs[champ] ? [{ champ, message: champs[champ] }] : []));
}

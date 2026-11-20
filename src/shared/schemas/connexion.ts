import { z } from "zod";

import { compterCaracteres, FORME_EMAIL, LONGUEURS_MAXIMALES } from "@/shared/constantes";
import { MESSAGES_CONNEXION } from "@/shared/messages";
import type { ErreursChamps } from "@/shared/reponse";

import { validerSaisie, type Validation } from "./validation";

// Connexion I1 (FR-8) : la seule définition de ses champs et de ses messages
// (AD-11). Le navigateur s'en sert pour les messages immédiats, la Server
// Function pour la vérification qui fait foi. Une saisie refusée ici n'est
// jamais envoyée à Supabase ni comptée comme une tentative.

/** Champs, dans l'ordre de l'écran. */
export const CHAMPS_CONNEXION = ["email", "motDePasse"] as const;
export type ChampConnexion = (typeof CHAMPS_CONNEXION)[number];

/** Ce que contient le formulaire pendant la saisie. */
export type ValeursConnexion = { email: string; motDePasse: string };

export const VALEURS_CONNEXION_VIDES: ValeursConnexion = { email: "", motDePasse: "" };

export const schemaConnexion = z.object({
  email: z
    .string({ error: MESSAGES_CONNEXION.emailObligatoire })
    .trim()
    // En minuscules, comme Supabase Auth et `tentatives_connexion`.
    .toLowerCase()
    .min(1, MESSAGES_CONNEXION.emailObligatoire)
    .regex(FORME_EMAIL, MESSAGES_CONNEXION.emailForme)
    .refine(
      (texte) => compterCaracteres(texte) <= LONGUEURS_MAXIMALES.email,
      MESSAGES_CONNEXION.emailTropLong,
    ),
  // Jamais nettoyé : une espace fait partie du mot de passe.
  motDePasse: z
    .string({ error: MESSAGES_CONNEXION.motDePasseObligatoire })
    .min(1, MESSAGES_CONNEXION.motDePasseObligatoire),
});

/** Identifiants vérifiés : email nettoyé et en minuscules, mot de passe intact. */
export type DonneesConnexion = z.infer<typeof schemaConnexion>;

export function validerConnexion(saisie: unknown): Validation<DonneesConnexion> {
  return validerSaisie(schemaConnexion, CHAMPS_CONNEXION, saisie);
}

/** Message d'erreur d'un champ pour ces valeurs (aucun s'il est correct). */
export function erreurDuChampConnexion(
  champ: ChampConnexion,
  valeurs: ValeursConnexion,
): string | undefined {
  const validation = validerConnexion(valeurs);
  return validation.ok ? undefined : (validation.champs as ErreursChamps)[champ];
}

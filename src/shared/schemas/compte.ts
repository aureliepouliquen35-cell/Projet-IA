import { z } from "zod";

import {
  compterCaracteres,
  FORME_EMAIL,
  LONGUEUR_MINIMALE_MOT_DE_PASSE,
  LONGUEURS_MAXIMALES,
  ROLES,
} from "@/shared/constantes";
import { MESSAGES_COMPTE } from "@/shared/messages";
import { FORME_IDENTIFIANT } from "@/shared/schemas/depot";

import { validerSaisie, type Validation } from "./validation";

// Création d'un compte interne (FR-21) : écran A1 (story 3.2) et procédure
// d'installation (`npm run compte:creer`, story 1.5). Une seule définition
// des champs, des limites et des messages (AD-11).

/** Champs, dans l'ordre de l'écran A1. */
export const CHAMPS_COMPTE = ["nom", "email", "role", "motDePasseTemporaire"] as const;

const auPlus = (maximum: number) => (texte: string) => compterCaracteres(texte) <= maximum;

export const schemaCompte = z.object({
  nom: z
    .string({ error: MESSAGES_COMPTE.nomObligatoire })
    .trim()
    .min(1, MESSAGES_COMPTE.nomObligatoire)
    .refine(auPlus(LONGUEURS_MAXIMALES.nom), MESSAGES_COMPTE.nomTropLong),
  email: z
    .string({ error: MESSAGES_COMPTE.emailObligatoire })
    .trim()
    // En minuscules, comme Supabase Auth l'enregistre.
    .toLowerCase()
    .min(1, MESSAGES_COMPTE.emailObligatoire)
    .regex(FORME_EMAIL, MESSAGES_COMPTE.emailForme)
    .refine(auPlus(LONGUEURS_MAXIMALES.email), MESSAGES_COMPTE.emailTropLong),
  role: z.enum(ROLES, { error: MESSAGES_COMPTE.roleInconnu }),
  // Jamais nettoyé : une espace fait partie du mot de passe.
  motDePasseTemporaire: z
    .string({ error: MESSAGES_COMPTE.motDePasseTropCourt })
    .refine(
      (texte) => compterCaracteres(texte) >= LONGUEUR_MINIMALE_MOT_DE_PASSE,
      MESSAGES_COMPTE.motDePasseTropCourt,
    ),
});

/** Compte vérifié et nettoyé, prêt à être créé. */
export type DonneesCompte = z.infer<typeof schemaCompte>;

export function validerCompte(saisie: unknown): Validation<DonneesCompte> {
  return validerSaisie(schemaCompte, CHAMPS_COMPTE, saisie);
}

// ---------------------------------------------------------------------------
// Désactivation et réactivation (story 3.4 ; FR-22, RM-10)
// ---------------------------------------------------------------------------

/** Champs de la désactivation ou de la réactivation. */
export const CHAMPS_ETAT_COMPTE = ["compteId", "actif"] as const;

export const schemaEtatCompte = z.object({
  // Identifiant du compte Supabase Auth (UUID), en minuscules comme dans la base.
  compteId: z
    .string({ error: MESSAGES_COMPTE.etatInvalide })
    .regex(FORME_IDENTIFIANT, MESSAGES_COMPTE.etatInvalide)
    .transform((texte) => texte.toLowerCase()),
  /** Faux : désactiver ; vrai : réactiver. */
  actif: z.boolean({ error: MESSAGES_COMPTE.etatInvalide }),
});

/** Désactivation (`actif` faux) ou réactivation (`actif` vrai) vérifiée. */
export type DonneesEtatCompte = z.infer<typeof schemaEtatCompte>;

export function validerEtatCompte(saisie: unknown): Validation<DonneesEtatCompte> {
  return validerSaisie(schemaEtatCompte, CHAMPS_ETAT_COMPTE, saisie);
}

// ---------------------------------------------------------------------------
// Réinitialisation du mot de passe (story 3.5 ; FR-23)
// ---------------------------------------------------------------------------

/** Champs de la réinitialisation, dans l'ordre de la fenêtre. */
export const CHAMPS_REINITIALISATION = ["compteId", "motDePasseTemporaire"] as const;

export const schemaReinitialisation = z.object({
  // Identifiant du compte Supabase Auth (UUID), en minuscules comme dans la base.
  compteId: z
    .string({ error: MESSAGES_COMPTE.compteInvalide })
    .regex(FORME_IDENTIFIANT, MESSAGES_COMPTE.compteInvalide)
    .transform((texte) => texte.toLowerCase()),
  // Même règle qu'à la création : 12 caractères au moins, jamais nettoyé.
  motDePasseTemporaire: schemaCompte.shape.motDePasseTemporaire,
});

/** Réinitialisation vérifiée, prête à être envoyée. */
export type DonneesReinitialisation = z.infer<typeof schemaReinitialisation>;

export function validerReinitialisation(saisie: unknown): Validation<DonneesReinitialisation> {
  return validerSaisie(schemaReinitialisation, CHAMPS_REINITIALISATION, saisie);
}

// ---------------------------------------------------------------------------
// Modification du nom ou du rôle (story 3.3 ; FR-22, FR-25)
// ---------------------------------------------------------------------------

/** Champs de la modification, dans l'ordre de la fenêtre (l'email n'est pas modifiable). */
export const CHAMPS_MODIFICATION = ["compteId", "nom", "role"] as const;

export const schemaModificationCompte = z.object({
  // Identifiant du compte Supabase Auth (UUID), en minuscules comme dans la base.
  compteId: z
    .string({ error: MESSAGES_COMPTE.compteInvalide })
    .regex(FORME_IDENTIFIANT, MESSAGES_COMPTE.compteInvalide)
    .transform((texte) => texte.toLowerCase()),
  // Mêmes règles et mêmes messages qu'à la création.
  nom: schemaCompte.shape.nom,
  role: schemaCompte.shape.role,
});

/** Modification vérifiée et nettoyée, prête à être envoyée. */
export type DonneesModificationCompte = z.infer<typeof schemaModificationCompte>;

export function validerModificationCompte(saisie: unknown): Validation<DonneesModificationCompte> {
  return validerSaisie(schemaModificationCompte, CHAMPS_MODIFICATION, saisie);
}

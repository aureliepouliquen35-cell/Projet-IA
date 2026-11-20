import { z } from "zod";

import {
  compterCaracteres,
  FORME_EMAIL,
  LONGUEUR_MINIMALE_MOT_DE_PASSE,
  LONGUEURS_MAXIMALES,
  ROLES,
} from "@/shared/constantes";
import { MESSAGES_COMPTE } from "@/shared/messages";

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

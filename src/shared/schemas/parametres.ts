import { z } from "zod";

import {
  compterCaracteres,
  FORME_EMAIL,
  LONGUEURS_MAXIMALES_PARAMETRES,
} from "@/shared/constantes";
import { MESSAGES_PARAMETRES } from "@/shared/messages";

import { validerSaisie, type Validation } from "./validation";

// Informations générales affichées aux demandeurs (FR-31) : écran A3
// (story 4.3) et procédure d'installation (`npm run parametres:installer`,
// story 1.5). Une seule définition (AD-11).

/** Champs, dans l'ordre de l'écran A3. */
export const CHAMPS_PARAMETRES = ["telephone", "emailContact", "contactDonnees"] as const;

const auPlus = (maximum: number) => (texte: string) => compterCaracteres(texte) <= maximum;

const texteObligatoire = () =>
  z
    .string({ error: MESSAGES_PARAMETRES.champObligatoire })
    .trim()
    .min(1, MESSAGES_PARAMETRES.champObligatoire);

export const schemaParametres = z.object({
  // Facultatif : un texte vide ou absent devient `null`.
  telephone: z
    .string({ error: MESSAGES_PARAMETRES.telephoneTropLong })
    .trim()
    .refine(auPlus(LONGUEURS_MAXIMALES_PARAMETRES.telephone), MESSAGES_PARAMETRES.telephoneTropLong)
    .nullish()
    .transform((texte) => texte || null),
  emailContact: texteObligatoire()
    .regex(FORME_EMAIL, MESSAGES_PARAMETRES.emailForme)
    .refine(
      auPlus(LONGUEURS_MAXIMALES_PARAMETRES.emailContact),
      MESSAGES_PARAMETRES.emailContactTropLong,
    ),
  contactDonnees: texteObligatoire().refine(
    auPlus(LONGUEURS_MAXIMALES_PARAMETRES.contactDonnees),
    MESSAGES_PARAMETRES.contactDonneesTropLong,
  ),
});

/** Informations vérifiées et nettoyées, prêtes à être enregistrées. */
export type DonneesParametres = z.infer<typeof schemaParametres>;

export function validerParametres(saisie: unknown): Validation<DonneesParametres> {
  return validerSaisie(schemaParametres, CHAMPS_PARAMETRES, saisie);
}

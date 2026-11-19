import { z } from "zod";

import {
  compterCaracteres,
  FORME_EMAIL,
  LONGUEUR_MINIMALE_DESCRIPTION,
  LONGUEURS_MAXIMALES,
} from "@/shared/constantes";
import { MESSAGES_DEPOT } from "@/shared/messages";
import type { ErreursChamps } from "@/shared/reponse";

// Formulaire de dépôt (P1) : la seule définition de ses champs, de ses
// limites et de ses messages (AD-11). Le navigateur s'en sert pour les
// messages immédiats, la Server Function pour la vérification qui fait foi.
//
// Les textes sont nettoyés de leurs espaces de début et de fin avant d'être
// comptés ; rien n'est jamais coupé.

/** Champs du formulaire, dans l'ordre de l'écran. */
export const CHAMPS_DEPOT = [
  "nom",
  "email",
  "telephone",
  "entreprise",
  "categorieId",
  "objet",
  "description",
  "personneInformee",
] as const;

export type ChampDepot = (typeof CHAMPS_DEPOT)[number];

/** Ce que contient le formulaire pendant la saisie. */
export type ValeursDepot = {
  nom: string;
  email: string;
  telephone: string;
  entreprise: string;
  categorieId: string;
  objet: string;
  description: string;
  personneInformee: boolean;
};

export const VALEURS_DEPOT_VIDES: ValeursDepot = {
  nom: "",
  email: "",
  telephone: "",
  entreprise: "",
  categorieId: "",
  objet: "",
  description: "",
  personneInformee: false,
};

const auPlus = (maximum: number) => (texte: string) =>
  compterCaracteres(texte) <= maximum;

/** Champ facultatif : un texte vide ou absent devient `null`. */
const texteFacultatif = (maximum: number, message: string) =>
  z
    .string({ error: message })
    .trim()
    .refine(auPlus(maximum), message)
    .nullish()
    .transform((texte) => texte || null);

/** Forme d'un identifiant (UUID) : catégorie, numéro d'envoi (AD-20). */
export const FORME_IDENTIFIANT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const schemaDepot = z.object({
  nom: z
    .string({ error: MESSAGES_DEPOT.nomObligatoire })
    .trim()
    .min(1, MESSAGES_DEPOT.nomObligatoire)
    .refine(auPlus(LONGUEURS_MAXIMALES.nom), MESSAGES_DEPOT.nomTropLong),
  email: z
    .string({ error: MESSAGES_DEPOT.emailObligatoire })
    .trim()
    .min(1, MESSAGES_DEPOT.emailObligatoire)
    .regex(FORME_EMAIL, MESSAGES_DEPOT.emailForme)
    .refine(auPlus(LONGUEURS_MAXIMALES.email), MESSAGES_DEPOT.emailTropLong),
  telephone: texteFacultatif(
    LONGUEURS_MAXIMALES.telephone,
    MESSAGES_DEPOT.telephoneTropLong,
  ),
  entreprise: texteFacultatif(
    LONGUEURS_MAXIMALES.entreprise,
    MESSAGES_DEPOT.entrepriseTropLongue,
  ),
  categorieId: z
    .string({ error: MESSAGES_DEPOT.categorieObligatoire })
    .trim()
    .min(1, MESSAGES_DEPOT.categorieObligatoire)
    .regex(FORME_IDENTIFIANT, MESSAGES_DEPOT.categorieIndisponible),
  objet: z
    .string({ error: MESSAGES_DEPOT.objetObligatoire })
    .trim()
    .min(1, MESSAGES_DEPOT.objetObligatoire)
    .refine(auPlus(LONGUEURS_MAXIMALES.objet), MESSAGES_DEPOT.objetTropLong),
  description: z
    .string({ error: MESSAGES_DEPOT.descriptionObligatoire })
    .trim()
    .min(1, MESSAGES_DEPOT.descriptionObligatoire)
    .refine(
      (texte) => compterCaracteres(texte) >= LONGUEUR_MINIMALE_DESCRIPTION,
      MESSAGES_DEPOT.descriptionTropCourte,
    )
    .refine(
      auPlus(LONGUEURS_MAXIMALES.description),
      MESSAGES_DEPOT.descriptionTropLongue,
    ),
  // RM-12 : seule la valeur « vrai » est acceptée.
  personneInformee: z.literal(true, { error: MESSAGES_DEPOT.caseObligatoire }),
});

/** Demande vérifiée et nettoyée, prête à être enregistrée. */
export type DonneesDepot = z.infer<typeof schemaDepot>;

export type ValidationDepot =
  | { ok: true; donnees: DonneesDepot }
  | { ok: false; champs: ErreursChamps };

const estChampDepot = (nom: unknown): nom is ChampDepot =>
  (CHAMPS_DEPOT as readonly unknown[]).includes(nom);

/**
 * Vérifie une saisie, d'où qu'elle vienne (formulaire ou appel direct).
 * En cas d'erreur : un seul message par champ, dans l'ordre de l'écran.
 */
export function validerDepot(saisie: unknown): ValidationDepot {
  // Tout ce qui n'est pas un objet (rien, un texte, une liste…) est lu comme
  // un formulaire vierge : chaque champ obligatoire reçoit son message.
  const estUnObjet =
    typeof saisie === "object" && saisie !== null && !Array.isArray(saisie);
  const resultat = schemaDepot.safeParse(estUnObjet ? saisie : {});
  if (resultat.success) return { ok: true, donnees: resultat.data };

  const premiers: Partial<Record<ChampDepot, string>> = {};
  for (const probleme of resultat.error.issues) {
    const champ = probleme.path[0];
    if (estChampDepot(champ) && !(champ in premiers)) {
      premiers[champ] = probleme.message;
    }
  }

  const champs: ErreursChamps = {};
  for (const champ of CHAMPS_DEPOT) {
    const message = premiers[champ];
    if (message) champs[champ] = message;
  }
  return { ok: false, champs };
}

/** Message d'erreur d'un seul champ, ou `undefined` s'il est correct. */
export function erreurDuChamp(
  champ: ChampDepot,
  valeurs: ValeursDepot,
): string | undefined {
  const validation = validerDepot(valeurs);
  return validation.ok ? undefined : validation.champs[champ];
}

/** Erreurs d'un formulaire, dans l'ordre de l'écran (résumé d'erreurs). */
export function listerErreurs(
  champs: ErreursChamps,
): { champ: ChampDepot; message: string }[] {
  return CHAMPS_DEPOT.flatMap((champ) =>
    champs[champ] ? [{ champ, message: champs[champ] }] : [],
  );
}

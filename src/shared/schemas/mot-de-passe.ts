import { z } from "zod";

import {
  compterCaracteres,
  compterOctets,
  LONGUEUR_MAXIMALE_MOT_DE_PASSE_OCTETS,
  LONGUEUR_MINIMALE_MOT_DE_PASSE,
} from "@/shared/constantes";
import { MESSAGES_MOT_DE_PASSE } from "@/shared/messages";
import type { ErreursChamps } from "@/shared/reponse";

import { validerSaisie, type Validation } from "./validation";

// Choix du mot de passe I2 (FR-21, NFR-11) : la seule définition de ses
// champs et de ses messages (AD-11). Le navigateur s'en sert pour les
// messages immédiats, la Server Function pour la vérification qui fait foi.
//
// La différence avec le mot de passe temporaire ne se vérifie pas ici : seule
// la base connaît son empreinte (`est_mot_de_passe_temporaire`).

/** Champs, dans l'ordre de l'écran. */
export const CHAMPS_MOT_DE_PASSE = ["motDePasse", "confirmation"] as const;
export type ChampMotDePasse = (typeof CHAMPS_MOT_DE_PASSE)[number];

/** Ce que contient le formulaire pendant la saisie. */
export type ValeursMotDePasse = { motDePasse: string; confirmation: string };

export const VALEURS_MOT_DE_PASSE_VIDES: ValeursMotDePasse = { motDePasse: "", confirmation: "" };

// Les règles sont vérifiées ensemble (`superRefine`), pour qu'un mot de passe
// trop court et une confirmation différente soient signalés en même temps.
// Les mots de passe ne sont jamais nettoyés : une espace en fait partie.
export const schemaMotDePasse = z
  .object({
    motDePasse: z.string({ error: MESSAGES_MOT_DE_PASSE.tropCourt }),
    confirmation: z.string({ error: MESSAGES_MOT_DE_PASSE.nonIdentiques }),
  })
  .superRefine(({ motDePasse, confirmation }, contexte) => {
    if (compterCaracteres(motDePasse) < LONGUEUR_MINIMALE_MOT_DE_PASSE) {
      contexte.addIssue({ code: "custom", path: ["motDePasse"], message: MESSAGES_MOT_DE_PASSE.tropCourt });
    } else if (compterOctets(motDePasse) > LONGUEUR_MAXIMALE_MOT_DE_PASSE_OCTETS) {
      contexte.addIssue({ code: "custom", path: ["motDePasse"], message: MESSAGES_MOT_DE_PASSE.tropLong });
    }
    if (confirmation !== motDePasse) {
      contexte.addIssue({
        code: "custom",
        path: ["confirmation"],
        message: MESSAGES_MOT_DE_PASSE.nonIdentiques,
      });
    }
  });

/** Saisie vérifiée : les deux mots de passe, identiques et intacts. */
export type DonneesMotDePasse = z.infer<typeof schemaMotDePasse>;

export function validerMotDePasse(saisie: unknown): Validation<DonneesMotDePasse> {
  return validerSaisie(schemaMotDePasse, CHAMPS_MOT_DE_PASSE, saisie);
}

/** Message d'erreur d'un champ pour ces valeurs (aucun s'il est correct). */
export function erreurDuChampMotDePasse(
  champ: ChampMotDePasse,
  valeurs: ValeursMotDePasse,
): string | undefined {
  const validation = validerMotDePasse(valeurs);
  return validation.ok ? undefined : (validation.champs as ErreursChamps)[champ];
}

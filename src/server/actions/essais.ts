"use server";

import { executerAction } from "@/server/actions/enveloppe";
import { MESSAGE_PAGE_INTROUVABLE } from "@/shared/messages";
import { echec, type Reponse } from "@/shared/reponse";

// Actions d'essai du format de réponse (story 1.2), utilisées par la page
// `/essais/action`. Hors développement, elles répondent `INTROUVABLE` sans
// rien faire.

function horsDeveloppement() {
  return process.env.NODE_ENV !== "development";
}

/** Erreur prévue : renvoyée au format commun, jamais levée, rien au journal. */
export async function essaiErreurPrevue(): Promise<Reponse<never>> {
  return executerAction(async () => {
    if (horsDeveloppement()) return echec("INTROUVABLE", MESSAGE_PAGE_INTROUVABLE);
    return echec("VALIDATION", "1 champ est à corriger", {
      champs: { email: "L'email est obligatoire" },
    });
  }, "essai_erreur_prevue");
}

/** Erreur imprévue : levée, puis attrapée et journalisée par l'enveloppe. */
export async function essaiErreurImprevue(): Promise<Reponse<never>> {
  return executerAction(async () => {
    if (horsDeveloppement()) return echec("INTROUVABLE", MESSAGE_PAGE_INTROUVABLE);
    throw new Error("Erreur d'essai levée par essaiErreurImprevue");
  }, "essai_erreur_imprevue");
}

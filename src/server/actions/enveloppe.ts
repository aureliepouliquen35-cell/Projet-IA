import "server-only";

import { unstable_rethrow } from "next/navigation";

import { journaliser } from "@/server/journal";
import { nouveauCodeSupport } from "@/shared/code-support";
import { MESSAGE_ERREUR_INATTENDUE } from "@/shared/messages";
import { echec, type Reponse } from "@/shared/reponse";

/**
 * Enveloppe commune à toutes les Server Functions (AD-12).
 *
 * - Une réponse renvoyée par `fn` (réussite ou erreur prévue) passe telle
 *   quelle.
 * - Les erreurs internes de Next.js (`redirect()`, `notFound()`…) sont
 *   relancées pour que Next.js les traite.
 * - Toute autre erreur est imprévue : elle est journalisée avec un code
 *   court, sans son message, et la réponse est `ERREUR_INTERNE` avec ce code.
 *
 * `action` : nom de l'action, enregistré dans le journal pour le support.
 */
export async function executerAction<T>(
  fn: () => Promise<Reponse<T>>,
  action?: string,
): Promise<Reponse<T>> {
  try {
    return await fn();
  } catch (erreur) {
    unstable_rethrow(erreur);

    const codeSupport = nouveauCodeSupport();
    // Erreur complète dans la console du serveur seulement (jamais dans le
    // journal, qui ne reçoit que le code) : c'est elle que le support retrouve
    // à partir du code.
    console.error(
      `[action] erreur inattendue (code ${codeSupport}, action ${action ?? "inconnue"}) :`,
      erreur,
    );
    await journaliser(
      "erreur",
      "erreur_inattendue",
      action ? { type: "action", action } : { type: "action" },
      codeSupport,
    );
    return echec("ERREUR_INTERNE", MESSAGE_ERREUR_INATTENDUE, { codeSupport });
  }
}

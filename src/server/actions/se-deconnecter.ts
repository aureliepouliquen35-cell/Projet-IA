"use server";

import { executerAction } from "@/server/actions/enveloppe";
import { deconnecter } from "@/server/connexion";
import { succes, type Reponse } from "@/shared/reponse";

// Server Function du bouton « Se déconnecter » (FR-9). Ferme la session de
// ce navigateur ; le bouton recharge ensuite entièrement la page de
// connexion, ce qui vide le cache du routeur (aucune page interne déjà vue
// n'est gardée).

export async function actionSeDeconnecter(): Promise<Reponse<null>> {
  return executerAction(async () => {
    await deconnecter();
    return succes(null);
  }, "se_deconnecter");
}

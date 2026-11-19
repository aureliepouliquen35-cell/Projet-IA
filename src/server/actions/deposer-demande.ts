"use server";

import { executerAction } from "@/server/actions/enveloppe";
import { deposerDemande } from "@/server/depot";
import { resumeErreurs } from "@/shared/messages";
import { echec, succes, type ErreursChamps, type Reponse } from "@/shared/reponse";
import { validerDepot } from "@/shared/schemas/depot";

// Server Function du formulaire de dépôt (P1) : le seul point d'entrée du
// navigateur pour créer une demande (AD-1). Elle est publique : n'importe qui
// peut l'appeler avec n'importe quoi. La vérification faite ici fait donc foi
// (AD-11), celle du navigateur ne sert qu'aux messages immédiats.

function saisieRefusee(champs: ErreursChamps) {
  return echec("VALIDATION", resumeErreurs(Object.keys(champs).length), { champs });
}

/**
 * Dépose une demande.
 *
 * - Saisie incorrecte : `{ ok: false, code: "VALIDATION", champs }`, rien
 *   n'est enregistré.
 * - Réussite : `{ ok: true, donnees: { reference } }`.
 * - Panne : `ERREUR_INTERNE`, journalisée par l'enveloppe (AD-12).
 */
export async function actionDeposerDemande(
  saisie: unknown,
): Promise<Reponse<{ reference: string }>> {
  return executerAction(async () => {
    const validation = validerDepot(saisie);
    if (!validation.ok) return saisieRefusee(validation.champs);

    const depot = await deposerDemande(validation.donnees);
    if (!depot.ok) return saisieRefusee(depot.champs);

    return succes({ reference: depot.reference });
  }, "deposer_demande");
}

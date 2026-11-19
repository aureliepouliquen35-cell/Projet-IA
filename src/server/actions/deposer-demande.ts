"use server";

import { executerAction } from "@/server/actions/enveloppe";
import { deposerDemande } from "@/server/depot";
import { poserConfirmation, verifierSecretPassage } from "@/server/passage";
import { resumeErreurs } from "@/shared/messages";
import { estNumeroEnvoi } from "@/shared/numero-envoi";
import { echec, succes, type ErreursChamps, type Reponse } from "@/shared/reponse";
import { validerDepot } from "@/shared/schemas/depot";

// Server Function du formulaire de dépôt (P1) : le seul point d'entrée du
// navigateur pour créer une demande (AD-1). Elle est publique : n'importe qui
// peut l'appeler avec n'importe quoi. La vérification faite ici fait donc foi
// (AD-11), celle du navigateur ne sert qu'aux messages immédiats.

function saisieRefusee(champs: ErreursChamps) {
  return echec("VALIDATION", resumeErreurs(Object.keys(champs).length), { champs });
}

/** Numéro d'envoi absent ou mal formé : seul un appel direct peut l'envoyer. */
const MESSAGE_NUMERO_ENVOI = "Le formulaire est incomplet. Rechargez la page.";

/**
 * Dépose une demande.
 *
 * `numeroEnvoi` : UUID tiré par le formulaire à son affichage, gardé pour
 * les nouveaux essais, renouvelé après une réussite (AD-20). Le même numéro
 * envoyé deux fois ne crée qu'une demande : le second envoi reçoit celle du
 * premier.
 *
 * - Saisie incorrecte : `{ ok: false, code: "VALIDATION", champs }`, rien
 *   n'est enregistré.
 * - Numéro d'envoi absent ou mal formé : `VALIDATION` sans champ, rien
 *   n'est enregistré.
 * - Réussite : le cookie de confirmation est posé (référence, objet, email,
 *   30 minutes) et la réponse est `{ ok: true, donnees: { reference } }` ;
 *   le formulaire passe alors à `/confirmation`.
 * - Panne : `ERREUR_INTERNE`, journalisée par l'enveloppe (AD-12).
 */
export async function actionDeposerDemande(
  saisie: unknown,
  numeroEnvoi: unknown,
): Promise<Reponse<{ reference: string }>> {
  return executerAction(async () => {
    const validation = validerDepot(saisie);
    if (!validation.ok) return saisieRefusee(validation.champs);
    if (!estNumeroEnvoi(numeroEnvoi)) return echec("VALIDATION", MESSAGE_NUMERO_ENVOI);

    // Le cookie de confirmation doit pouvoir être posé : on le vérifie avant
    // d'enregistrer, pour ne pas créer une demande sans confirmation.
    verifierSecretPassage();

    const depot = await deposerDemande(validation.donnees, numeroEnvoi.toLowerCase());
    if (!depot.ok) return saisieRefusee(depot.champs);

    await poserConfirmation({
      reference: depot.reference,
      objet: depot.objet,
      email: depot.email,
    });
    return succes({ reference: depot.reference });
  }, "deposer_demande");
}

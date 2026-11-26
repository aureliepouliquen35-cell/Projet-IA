"use server";

import { refresh } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { executerAction } from "@/server/actions/enveloppe";
import { exigerAdministrateur } from "@/server/garde";
import { journaliser } from "@/server/journal";
import { DELAI_MS } from "@/server/lectures/demandes";
import { MESSAGES_ACCES_REFUSE, MESSAGES_PARAMETRES, resumeErreurs } from "@/shared/messages";
import { echec, succes, type ErreursChamps, type Reponse } from "@/shared/reponse";
import { validerParametres, type DonneesParametres } from "@/shared/schemas/parametres";

// Server Function du bouton « Enregistrer » de l'écran A3 (story 4.3 ;
// FR-31, RM-7) : le seul point d'entrée du navigateur pour changer les
// informations générales affichées aux demandeurs (AD-1).
//
// - Elle commence par `exigerAdministrateur()` (AD-7) : sans session, renvoi
//   vers la connexion ; collaborateur (ou administrateur rétrogradé),
//   `ACCES_REFUSE` sans aucun appel à la base, et la page est recalculée
//   (`refresh()`) : elle devient S1.
// - La saisie est vérifiée ici par le schéma partagé (AD-11) : champ
//   obligatoire vide, email mal formé, texte trop long : `VALIDATION`, avec
//   le message sous chaque champ, sans appel à la base.
// - L'enregistrement passe par la fonction SQL `modifier_parametres`, avec
//   la session de l'administrateur (rôle `authenticated`), jamais avec la
//   clé secrète (AD-9). Elle refait le contrôle du rôle (NV202) et de
//   l'email (NV103), puis remplace l'unique ligne de `parametres`.
// - Réussite : `parametres_modifies` au journal (`journaliser()`), avec
//   l'email de l'administrateur comme auteur, jamais les valeurs saisies ;
//   la date et l'heure sont celles de la ligne. Puis `refresh()` : l'écran
//   relit les informations. P1 et P2 les relisent à leur prochain affichage.
// - Panne (base injoignable, ligne absente NV104, refus imprévu) : levée ;
//   l'enveloppe la journalise avec le nom de l'action et un code court
//   (AD-12, AD-13). La réponse `ERREUR_INTERNE` porte le message de
//   l'écran : « Les informations n'ont pas pu être enregistrées.
//   Réessayez. ». Rien n'est modifié, la saisie reste à l'écran.

/** Refus de la base : l'email de contact est mal formé. */
const CODE_EMAIL_MAL_FORME = "NV103";

/** Refus de la base : l'appelant n'est pas un administrateur actif. */
const CODE_REFUS_ADMINISTRATEUR = "NV202";

const echecValidation = (champs: ErreursChamps) =>
  echec("VALIDATION", resumeErreurs(Object.keys(champs).length), { champs });

/**
 * Remplace le téléphone (facultatif), l'email de contact et le contact pour
 * les données personnelles.
 *
 * - Enregistrées : `succes` avec les valeurs nettoyées (téléphone vide :
 *   `null`), `parametres_modifies` au journal, page recalculée.
 * - Saisie refusée (navigateur contourné, ou NV103 de la base) :
 *   `VALIDATION`, message sous chaque champ concerné.
 * - Pas administrateur (garde, ou base qui refuse avec NV202) :
 *   `ACCES_REFUSE` ; la page recalculée affiche S1.
 * - Panne : `ERREUR_INTERNE`, journalisée par l'enveloppe.
 */
export async function actionModifierParametres(saisie: unknown): Promise<Reponse<DonneesParametres>> {
  const reponse = await executerAction(async () => {
    const administrateur = await exigerAdministrateur();
    if (!administrateur) {
      refresh();
      return echec("ACCES_REFUSE", MESSAGES_ACCES_REFUSE.action);
    }

    const validation = validerParametres(saisie);
    if (!validation.ok) return echecValidation(validation.champs);
    const { telephone, emailContact, contactDonnees } = validation.donnees;

    const supabase = await createClient();
    const { error } = await supabase
      .rpc("modifier_parametres", {
        p_telephone: telephone,
        p_email_contact: emailContact,
        p_contact_donnees: contactDonnees,
      })
      .abortSignal(AbortSignal.timeout(DELAI_MS));
    if (error) {
      // Rétrogradé ou désactivé entre la garde et la base.
      if (error.code === CODE_REFUS_ADMINISTRATEUR) {
        refresh();
        return echec("ACCES_REFUSE", MESSAGES_ACCES_REFUSE.action);
      }
      if (error.code === CODE_EMAIL_MAL_FORME) return echecValidation({ emailContact: MESSAGES_PARAMETRES.emailForme });
      throw new Error(`La fonction modifier_parametres a échoué (code ${error.code || "inconnu"}).`);
    }

    await journaliser("info", "parametres_modifies", { auteur: administrateur.email });
    refresh();
    return succes({ telephone, emailContact, contactDonnees });
  }, "modifier_parametres");

  // Le code court reste dans la réponse et le journal ; le message est celui de l'écran.
  if (!reponse.ok && reponse.code === "ERREUR_INTERNE") {
    return { ...reponse, message: MESSAGES_PARAMETRES.enregistrementImpossible };
  }
  return reponse;
}

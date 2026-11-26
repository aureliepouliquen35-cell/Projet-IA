"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { changerEtatCompte, type EtatCompteModifie } from "@/server/admin";
import { executerAction } from "@/server/actions/enveloppe";
import { deconnecter } from "@/server/connexion";
import { exigerAdministrateur } from "@/server/garde";
import { journaliser } from "@/server/journal";
import { poserSessionTerminee } from "@/server/passage";
import { ADRESSE_CONNEXION } from "@/shared/acces";
import { nouveauCodeSupport } from "@/shared/code-support";
import { MESSAGES_ACCES_REFUSE, MESSAGES_COMPTE } from "@/shared/messages";
import { echec, type Reponse } from "@/shared/reponse";

// Server Function de « Désactiver » et « Réactiver » de l'écran A1 (story
// 3.4 ; FR-22, FR-25, RM-7, RM-9, RM-10) : le seul point d'entrée du
// navigateur pour changer l'état d'un compte (AD-1).
//
// - Elle commence par `exigerAdministrateur()` (AD-7) : sans session, renvoi
//   vers la connexion ; collaborateur, `ACCES_REFUSE`, sans aucun appel à
//   Supabase pour modifier quoi que ce soit. Tout `ACCES_REFUSE` recalcule
//   la page (`refresh()`, story 3.3) : S1, menu sans Administration.
// - Le changement passe par `changerEtatCompte()` de `src/server/admin`,
//   seul module qui tient la clé secrète : saisie vérifiée (Zod), base
//   d'abord (`modifier_compte`, qui tient la règle du dernier administrateur
//   actif et revérifie l'auteur), puis blocage ou déblocage dans Supabase
//   Auth, retour arrière si Auth échoue, `compte_desactive` ou
//   `compte_reactive` au journal avec l'administrateur comme auteur.
// - Réussite : `refresh()` recalcule le tableau des comptes. Un
//   administrateur qui vient de désactiver son propre compte voit sa session
//   fermée, puis la connexion I1 avec « Votre session a pris fin… ».
// - Refus du dernier administrateur : `CONFLIT` avec le message exact, rien
//   n'a changé. Panne : `ERREUR_INTERNE` avec le message de l'écran (« Le
//   compte n'a pas pu être désactivé. Réessayez. », ou « réactivé ») et un
//   code court, gardé dans la réponse et le journal (AD-12, AD-13).

export async function actionChangerEtatCompte(saisie: unknown): Promise<Reponse<EtatCompteModifie>> {
  return executerAction(async () => {
    const administrateur = await exigerAdministrateur();
    if (!administrateur) {
      // Rétrogradé (ou collaborateur) : la page recalculée montre S1 et le
      // menu sans la section Administration (story 3.3).
      refresh();
      return echec("ACCES_REFUSE", MESSAGES_ACCES_REFUSE.action);
    }

    const { compteId, actif } = lireSaisie(saisie);
    const reponse = await changerEtatCompte(compteId, actif, { auteur: administrateur.id });
    if (!reponse.ok) {
      if (reponse.code === "ERREUR_INTERNE") {
        let codeSupport = reponse.codeSupport;
        if (!codeSupport) {
          // Clés absentes : `changerEtatCompte` n'a rien journalisé.
          codeSupport = nouveauCodeSupport();
          console.error(`[action] erreur inattendue (code ${codeSupport}, action changer_etat_compte) : clés absentes`);
          await journaliser("erreur", "erreur_inattendue", { type: "action", action: "changer_etat_compte" }, codeSupport);
        }
        const message = actif === true ? MESSAGES_COMPTE.reactivationImpossible : MESSAGES_COMPTE.desactivationImpossible;
        return echec("ERREUR_INTERNE", message, { codeSupport });
      }
      // Compte introuvable (supprimé ne se peut pas, identifiant inconnu) :
      // le tableau recalculé montre l'état réel. Auteur refusé par la base
      // (rétrogradé ou désactivé entre-temps) : la page recalculée montre S1.
      if (reponse.code === "INTROUVABLE" || reponse.code === "ACCES_REFUSE") refresh();
      return reponse;
    }

    // Son propre compte désactivé : sa session prend fin aussitôt.
    if (reponse.donnees.change && !reponse.donnees.actif && reponse.donnees.id === administrateur.id.toLowerCase()) {
      await deconnecter();
      await poserSessionTerminee();
      redirect(ADRESSE_CONNEXION);
    }

    refresh();
    return reponse;
  }, "changer_etat_compte");
}

/** `compteId` et `actif` de la saisie, tels quels (vérifiés par `changerEtatCompte`). */
function lireSaisie(saisie: unknown): { compteId: unknown; actif: unknown } {
  if (typeof saisie !== "object" || saisie === null || Array.isArray(saisie)) {
    return { compteId: undefined, actif: undefined };
  }
  const { compteId, actif } = saisie as Record<string, unknown>;
  return { compteId, actif };
}

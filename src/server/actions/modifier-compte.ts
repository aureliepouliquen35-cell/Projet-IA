"use server";

import { refresh } from "next/cache";

import { modifierCompte, type CompteModifie } from "@/server/admin";
import { executerAction } from "@/server/actions/enveloppe";
import { exigerAdministrateur } from "@/server/garde";
import { journaliser } from "@/server/journal";
import { nouveauCodeSupport } from "@/shared/code-support";
import { MESSAGES_ACCES_REFUSE, MESSAGES_COMPTE } from "@/shared/messages";
import { echec, type Reponse } from "@/shared/reponse";

// Server Function de la fenêtre « Modifier » de l'écran A1 (story 3.3 ;
// FR-22, FR-25, RM-7, RM-9) : le seul point d'entrée du navigateur pour
// changer le nom ou le rôle d'un compte (AD-1).
//
// - Elle commence par `exigerAdministrateur()` (AD-7) : sans session, renvoi
//   vers la connexion ; collaborateur, `ACCES_REFUSE`, sans aucun appel à
//   Supabase pour modifier quoi que ce soit. La page est alors recalculée
//   (`refresh()`) : un administrateur rétrogradé, encore sur A1, voit S1 et
//   son menu sans la section Administration.
// - La modification passe par `modifierCompte()` de `src/server/admin`, seul
//   module qui tient la clé secrète : saisie vérifiée par le schéma partagé
//   (AD-11), `modifier_compte` (qui tient la règle du dernier administrateur
//   actif et revérifie l'auteur), `role_modifie` au journal si le rôle a
//   changé, avec l'administrateur comme auteur.
// - Réussite : `refresh()` recalcule le tableau des comptes, et le menu. Un
//   administrateur qui vient de se passer collaborateur voit S1 à la place
//   d'A1, sans la section Administration.
// - Refus du dernier administrateur : `CONFLIT` avec le message exact, rien
//   n'a changé. Panne : `ERREUR_INTERNE` avec le message de l'écran (« Le
//   compte n'a pas pu être modifié. Réessayez. ») et un code court, gardé
//   dans la réponse et le journal (AD-12, AD-13).

export async function actionModifierCompte(saisie: unknown): Promise<Reponse<CompteModifie>> {
  return executerAction(async () => {
    const administrateur = await exigerAdministrateur();
    if (!administrateur) {
      refresh();
      return echec("ACCES_REFUSE", MESSAGES_ACCES_REFUSE.action);
    }

    const reponse = await modifierCompte(saisie, { auteur: administrateur.id });
    if (!reponse.ok) {
      if (reponse.code === "ERREUR_INTERNE") {
        let codeSupport = reponse.codeSupport;
        if (!codeSupport) {
          // Clés absentes : `modifierCompte` n'a rien journalisé.
          codeSupport = nouveauCodeSupport();
          console.error(`[action] erreur inattendue (code ${codeSupport}, action modifier_compte) : clés absentes`);
          await journaliser("erreur", "erreur_inattendue", { type: "action", action: "modifier_compte" }, codeSupport);
        }
        return echec("ERREUR_INTERNE", MESSAGES_COMPTE.modificationImpossible, { codeSupport });
      }
      // Auteur refusé par la base (rétrogradé ou désactivé entre-temps) :
      // la page recalculée montre S1. Compte introuvable : le tableau
      // recalculé montre l'état réel.
      if (reponse.code === "ACCES_REFUSE" || reponse.code === "INTROUVABLE") refresh();
      return reponse;
    }

    refresh();
    return reponse;
  }, "modifier_compte");
}

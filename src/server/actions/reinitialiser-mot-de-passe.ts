"use server";

import { refresh } from "next/cache";

import { reinitialiserMotDePasse, type MotDePasseReinitialise } from "@/server/admin";
import { executerAction } from "@/server/actions/enveloppe";
import { exigerAdministrateur } from "@/server/garde";
import { journaliser } from "@/server/journal";
import { nouveauCodeSupport } from "@/shared/code-support";
import { MESSAGES_ACCES_REFUSE, MESSAGES_COMPTE } from "@/shared/messages";
import { echec, type Reponse } from "@/shared/reponse";

// Server Function de « Réinitialiser le mot de passe » de l'écran A1 (story
// 3.5 ; FR-23, RM-7) : le seul point d'entrée du navigateur pour donner un
// nouveau mot de passe temporaire à un compte (AD-1).
//
// - Elle commence par `exigerAdministrateur()` (AD-7) : sans session, renvoi
//   vers la connexion ; collaborateur, `ACCES_REFUSE`, sans aucun appel à
//   Supabase pour modifier quoi que ce soit. Tout `ACCES_REFUSE` recalcule
//   la page (`refresh()`, story 3.3) : S1, menu sans Administration.
// - La réinitialisation passe par `reinitialiserMotDePasse()` de
//   `src/server/admin`, seul module qui tient la clé secrète : saisie
//   vérifiée par le schéma partagé (12 caractères au moins), base d'abord
//   (`reinitialiser_mdp`, qui revérifie l'auteur), puis mot de passe changé
//   dans Supabase Auth, `mot_de_passe_reinitialise` au journal avec
//   l'administrateur comme auteur.
// - Pas de `refresh()` après une réussite : le tableau ne change pas, et la
//   fenêtre (mot de passe affiché) reste ouverte, même quand l'administrateur
//   réinitialise son propre compte (il passera par I2 à sa prochaine page,
//   par la garde).
// - La réponse ne contient jamais le mot de passe : le navigateur, qui l'a
//   tiré ou saisi, l'affiche lui-même une seule fois.
// - Panne : `ERREUR_INTERNE` avec le message de l'écran (« Le mot de passe
//   n'a pas pu être réinitialisé. Réessayez. ») et un code court, gardé dans
//   la réponse et le journal (AD-12, AD-13).

export async function actionReinitialiserMotDePasse(saisie: unknown): Promise<Reponse<MotDePasseReinitialise>> {
  return executerAction(async () => {
    const administrateur = await exigerAdministrateur();
    if (!administrateur) {
      // Rétrogradé (ou collaborateur) : la page recalculée montre S1 et le
      // menu sans la section Administration (story 3.3).
      refresh();
      return echec("ACCES_REFUSE", MESSAGES_ACCES_REFUSE.action);
    }

    const reponse = await reinitialiserMotDePasse(saisie, { auteur: administrateur.id });
    if (!reponse.ok) {
      if (reponse.code === "ERREUR_INTERNE") {
        let codeSupport = reponse.codeSupport;
        if (!codeSupport) {
          // Clés absentes : `reinitialiserMotDePasse` n'a rien journalisé.
          codeSupport = nouveauCodeSupport();
          console.error(
            `[action] erreur inattendue (code ${codeSupport}, action reinitialiser_mot_de_passe) : clés absentes`,
          );
          await journaliser(
            "erreur",
            "erreur_inattendue",
            { type: "action", action: "reinitialiser_mot_de_passe" },
            codeSupport,
          );
        }
        return echec("ERREUR_INTERNE", MESSAGES_COMPTE.reinitialisationImpossible, { codeSupport });
      }
      // Auteur refusé par la base (rétrogradé ou désactivé entre-temps) : la
      // page recalculée montre S1.
      if (reponse.code === "ACCES_REFUSE") refresh();
      return reponse;
    }

    // Seulement ces trois champs, jamais le mot de passe.
    const { id, nom, email } = reponse.donnees;
    return { ok: true, donnees: { id, nom, email } };
  }, "reinitialiser_mot_de_passe");
}

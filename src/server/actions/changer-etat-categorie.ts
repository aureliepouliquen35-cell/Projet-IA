"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { executerAction } from "@/server/actions/enveloppe";
import { exigerAdministrateur } from "@/server/garde";
import { DELAI_MS, reponseInattendue } from "@/server/lectures/demandes";
import { MESSAGES_ACCES_REFUSE, MESSAGES_CATEGORIES } from "@/shared/messages";
import { echec, succes, type Reponse } from "@/shared/reponse";
import { FORME_IDENTIFIANT } from "@/shared/schemas/depot";
import { validerEtatCategorie } from "@/shared/schemas/categorie";

// Server Function de « Désactiver » et « Réactiver » de la liste A2 (story
// 4.2 ; FR-26, RM-7, RM-11) : le seul point d'entrée du navigateur pour
// changer l'état d'une catégorie (AD-1).
//
// - Elle commence par `exigerAdministrateur()` (AD-7) : sans session, renvoi
//   vers la connexion ; collaborateur (ou administrateur rétrogradé),
//   `ACCES_REFUSE` sans aucun appel à la base, et la page est recalculée
//   (`refresh()`) : elle devient S1.
// - La catégorie et l'état voulu sont vérifiés ici par le schéma partagé
//   (AD-11) ; seul un appel direct peut envoyer autre chose : `VALIDATION`,
//   sans appel à la base.
// - Le changement passe par la fonction SQL `modifier_categorie`, avec la
//   session de l'administrateur (rôle `authenticated`), jamais avec la clé
//   secrète (AD-9). Elle refait le contrôle du rôle (NV202), verrouille les
//   catégories actives et garde la dernière (NV503, AD-10), et garantit le
//   nom unique parmi les actives à la réactivation (NV501). Déjà dans l'état
//   voulu (un autre administrateur l'a fait) : rien n'est écrit (`change`
//   faux), sans erreur.
// - Après toute réponse de la base, `refresh()` recalcule la liste : badge
//   *Désactivée* et « Réactiver », ou l'inverse. Une catégorie désactivée
//   disparaît du formulaire public et de la saisie I5 ; les demandes la
//   gardent, et le filtre de I3 la propose encore (RM-11). Rien au journal.
// - Dernière catégorie active : `CONFLIT` avec « Impossible : au moins une
//   catégorie doit rester active, sinon le formulaire serait
//   inutilisable. ». Nom déjà pris à la réactivation : `CONFLIT` avec « Une
//   catégorie active porte déjà ce nom. ». Catégorie supprimée entre-temps
//   (NV502) : `INTROUVABLE`, la ligne disparaît.
// - Panne : levée ; l'enveloppe la journalise avec le nom de l'action et un
//   code court (AD-12, AD-13). La réponse `ERREUR_INTERNE` porte le message
//   de l'écran : « La catégorie n'a pas pu être modifiée. Réessayez. ».

/** Ce que l'écran reçoit après une désactivation ou une réactivation. */
export type EtatCategorieModifie = {
  id: string;
  /** État en place après l'appel. */
  active: boolean;
  /** Faux : la catégorie était déjà dans l'état voulu, rien n'a été écrit. */
  change: boolean;
};

const schemaReponse = z.object({
  id: z.string().regex(FORME_IDENTIFIANT),
  active: z.boolean(),
  change: z.boolean(),
  supprimee: z.literal(false),
});

/**
 * Désactive (`active` faux) ou réactive (vrai) la catégorie `categorieId`.
 *
 * - Changée : `succes({ id, active, change: true })`, la liste est
 *   recalculée.
 * - Déjà dans l'état voulu : `succes({ …, change: false })`, rien n'est
 *   écrit ; la liste est quand même recalculée.
 * - Saisie mal formée (appel direct) : `VALIDATION`, sans appel à la base.
 * - Dernière catégorie active, ou nom déjà pris à la réactivation :
 *   `CONFLIT` avec le message exact ; la liste est recalculée.
 * - Catégorie inconnue : `INTROUVABLE` ; la liste est recalculée.
 * - Pas administrateur (garde, ou base qui refuse avec NV202) :
 *   `ACCES_REFUSE` ; la page recalculée affiche S1.
 * - Panne : `ERREUR_INTERNE`, journalisée par l'enveloppe.
 */
export async function actionChangerEtatCategorie(saisie: unknown): Promise<Reponse<EtatCategorieModifie>> {
  const reponse = await executerAction(async () => {
    const administrateur = await exigerAdministrateur();
    if (!administrateur) {
      refresh();
      return echec("ACCES_REFUSE", MESSAGES_ACCES_REFUSE.action);
    }

    const validation = validerEtatCategorie(saisie);
    if (!validation.ok) {
      return echec("VALIDATION", MESSAGES_CATEGORIES.modificationImpossible, { champs: validation.champs });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("modifier_categorie", { p_categorie: validation.donnees.categorieId, p_active: validation.donnees.active })
      .abortSignal(AbortSignal.timeout(DELAI_MS));
    if (error) {
      // Rétrogradé ou désactivé entre la garde et la base.
      if (error.code === "NV202") {
        refresh();
        return echec("ACCES_REFUSE", MESSAGES_ACCES_REFUSE.action);
      }
      if (error.code === "NV503") {
        refresh();
        return echec("CONFLIT", MESSAGES_CATEGORIES.derniereActive);
      }
      if (error.code === "NV501") {
        // La catégorie qui porte ce nom apparaît dans la liste recalculée.
        refresh();
        return echec("CONFLIT", MESSAGES_CATEGORIES.nomDejaPris);
      }
      if (error.code === "NV502") {
        refresh();
        return echec("INTROUVABLE", MESSAGES_CATEGORIES.modificationImpossible);
      }
      throw new Error(`La fonction modifier_categorie a échoué (code ${error.code || "inconnu"}).`);
    }

    const lu = schemaReponse.safeParse(data);
    if (!lu.success) throw reponseInattendue("modifier_categorie", lu.error);

    // Même sans changement : l'état affiché est ancien (un autre
    // administrateur l'a changé entre-temps).
    refresh();
    return succes({ id: lu.data.id.toLowerCase(), active: lu.data.active, change: lu.data.change });
  }, "changer_etat_categorie");

  // Le code court reste dans la réponse et le journal ; le message est celui de l'écran.
  if (!reponse.ok && reponse.code === "ERREUR_INTERNE") {
    return { ...reponse, message: MESSAGES_CATEGORIES.modificationImpossible };
  }
  return reponse;
}

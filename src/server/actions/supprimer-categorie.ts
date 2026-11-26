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
import { validerSuppressionCategorie } from "@/shared/schemas/categorie";

// Server Function de « Supprimer » de la liste A2, après confirmation dans
// la fenêtre (story 4.2 ; FR-26, RM-7) : le seul point d'entrée du
// navigateur pour supprimer une catégorie (AD-1).
//
// - Elle commence par `exigerAdministrateur()` (AD-7) : sans session, renvoi
//   vers la connexion ; collaborateur (ou administrateur rétrogradé),
//   `ACCES_REFUSE` sans aucun appel à la base, et la page est recalculée
//   (`refresh()`) : elle devient S1.
// - La catégorie est vérifiée ici par le schéma partagé (AD-11) ; seul un
//   appel direct peut envoyer autre chose : `VALIDATION`, sans appel à la
//   base.
// - La suppression passe par la fonction SQL `modifier_categorie`, avec la
//   session de l'administrateur (rôle `authenticated`), jamais avec la clé
//   secrète (AD-9). Elle refait le contrôle du rôle (NV202), verrouille les
//   catégories actives et garde la dernière (NV503, AD-10), puis refuse une
//   catégorie utilisée par au moins une demande (NV504), la clé étrangère
//   `demandes_categorie_id_fkey` servant de dernière barrière.
// - Après toute réponse de la base, `refresh()` recalcule la liste : la
//   ligne supprimée disparaît ; une catégorie devenue utilisée entre
//   l'affichage et la confirmation perd son « Supprimer ». Rien au journal.
// - Refus : `CONFLIT` avec le message exact (« Impossible : au moins une
//   catégorie doit rester active… » ou « Impossible de supprimer une
//   catégorie utilisée par des demandes. Vous pouvez la désactiver. »),
//   affiché dans la fenêtre. Catégorie déjà supprimée (NV502) :
//   `INTROUVABLE`, la ligne disparaît.
// - Panne : levée ; l'enveloppe la journalise avec le nom de l'action et un
//   code court (AD-12, AD-13). La réponse `ERREUR_INTERNE` porte le message
//   de l'écran : « La catégorie n'a pas pu être modifiée. Réessayez. ».

/** Ce que l'écran reçoit après une suppression. */
export type CategorieSupprimee = {
  id: string;
  /** Nom de la catégorie supprimée. */
  nom: string;
};

const schemaReponse = z.object({
  id: z.string().regex(FORME_IDENTIFIANT),
  nom: z.string(),
  supprimee: z.literal(true),
});

/**
 * Supprime la catégorie `categorieId`, qui ne doit être utilisée par aucune
 * demande.
 *
 * - Supprimée : `succes({ id, nom })`, la liste est recalculée.
 * - Saisie mal formée (appel direct) : `VALIDATION`, sans appel à la base.
 * - Dernière catégorie active, ou catégorie utilisée : `CONFLIT` avec le
 *   message exact ; la liste est recalculée.
 * - Catégorie inconnue : `INTROUVABLE` ; la liste est recalculée.
 * - Pas administrateur (garde, ou base qui refuse avec NV202) :
 *   `ACCES_REFUSE` ; la page recalculée affiche S1.
 * - Panne : `ERREUR_INTERNE`, journalisée par l'enveloppe.
 */
export async function actionSupprimerCategorie(saisie: unknown): Promise<Reponse<CategorieSupprimee>> {
  const reponse = await executerAction(async () => {
    const administrateur = await exigerAdministrateur();
    if (!administrateur) {
      refresh();
      return echec("ACCES_REFUSE", MESSAGES_ACCES_REFUSE.action);
    }

    const validation = validerSuppressionCategorie(saisie);
    if (!validation.ok) {
      return echec("VALIDATION", MESSAGES_CATEGORIES.modificationImpossible, { champs: validation.champs });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("modifier_categorie", { p_categorie: validation.donnees.categorieId, p_supprimer: true })
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
      if (error.code === "NV504") {
        // Une demande est arrivée entre-temps : « Supprimer » disparaît de la ligne.
        refresh();
        return echec("CONFLIT", MESSAGES_CATEGORIES.categorieUtilisee);
      }
      if (error.code === "NV502") {
        refresh();
        return echec("INTROUVABLE", MESSAGES_CATEGORIES.modificationImpossible);
      }
      throw new Error(`La fonction modifier_categorie a échoué (code ${error.code || "inconnu"}).`);
    }

    const lu = schemaReponse.safeParse(data);
    if (!lu.success) throw reponseInattendue("modifier_categorie", lu.error);

    refresh();
    return succes({ id: lu.data.id.toLowerCase(), nom: lu.data.nom });
  }, "supprimer_categorie");

  // Le code court reste dans la réponse et le journal ; le message est celui de l'écran.
  if (!reponse.ok && reponse.code === "ERREUR_INTERNE") {
    return { ...reponse, message: MESSAGES_CATEGORIES.modificationImpossible };
  }
  return reponse;
}

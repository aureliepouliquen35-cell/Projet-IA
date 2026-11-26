"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { executerAction } from "@/server/actions/enveloppe";
import { exigerAdministrateur } from "@/server/garde";
import { DELAI_MS, reponseInattendue } from "@/server/lectures/demandes";
import { MESSAGES_ACCES_REFUSE, MESSAGES_CATEGORIES, resumeErreurs } from "@/shared/messages";
import { echec, succes, type Reponse } from "@/shared/reponse";
import { FORME_IDENTIFIANT } from "@/shared/schemas/depot";
import { validerRenommageCategorie } from "@/shared/schemas/categorie";

// Server Function de « Renommer » de la liste A2 (story 4.1 ; FR-26, RM-7) :
// le seul point d'entrée du navigateur pour renommer une catégorie (AD-1).
//
// - Elle commence par `exigerAdministrateur()` (AD-7) : sans session, renvoi
//   vers la connexion ; collaborateur (ou administrateur rétrogradé),
//   `ACCES_REFUSE` sans aucun appel à la base, et la page est recalculée
//   (`refresh()`) : elle devient S1.
// - La catégorie et le nom sont vérifiés ici par le schéma partagé (AD-11) :
//   nom vide ou trop long, `VALIDATION` avec le message sous le champ, sans
//   appel à la base.
// - Le renommage passe par la fonction SQL `modifier_categorie`, avec la
//   session de l'administrateur (rôle `authenticated`), jamais avec la clé
//   secrète (AD-9). Elle refait le contrôle du rôle (NV202), verrouille la
//   catégorie et garantit le nom unique parmi les catégories actives
//   (NV501). Même nom qu'avant : rien n'est écrit (`change` faux). Depuis la
//   story 4.2, la fonction sait aussi désactiver, réactiver et supprimer :
//   le renommage ne lui donne que `p_categorie` et `p_nom`, les autres
//   paramètres gardent leur valeur par défaut (aucune autre opération).
// - Réussite, même sans changement : `refresh()` recalcule la liste, qui
//   montre le nom réel en place. Le nouveau nom s'affiche aussi sur le
//   détail I4, le filtre de I3 et le formulaire public, qui relisent le nom
//   dans `categories`. Rien au journal.
// - Nom déjà pris : `CONFLIT`, avec « Une catégorie active porte déjà ce
//   nom. » sous le champ de la ligne, et `refresh()` : la catégorie qui porte
//   ce nom (peut-être renommée à l'instant par un autre administrateur)
//   apparaît dans la liste.
// - Catégorie inconnue (supprimée entre-temps, NV502) : `INTROUVABLE` et
//   `refresh()` : la liste recalculée montre l'état réel.
// - Panne : levée ; l'enveloppe la journalise avec le nom de l'action et un
//   code court (AD-12, AD-13). La réponse `ERREUR_INTERNE` porte le message
//   de l'écran : « La catégorie n'a pas pu être enregistrée. Réessayez. ».

/** Ce que l'écran reçoit après un renommage. */
export type CategorieRenommee = {
  id: string;
  /** Nom en place après l'appel, espaces de bord retirés. */
  nom: string;
  /** Faux : le nom ne différait pas, rien n'a été écrit. */
  change: boolean;
};

const schemaReponse = z.object({
  id: z.string().regex(FORME_IDENTIFIANT),
  nom: z.string(),
  change: z.boolean(),
});

/**
 * Renomme la catégorie `categorieId` en `nom`.
 *
 * - Renommée : `succes({ id, nom, change: true })`, la liste est recalculée.
 * - Même nom : `succes({ …, change: false })`, rien n'est écrit ; la liste
 *   est quand même recalculée.
 * - Nom vide ou trop long : `VALIDATION`, message sous le champ `nom`.
 * - Nom déjà porté par une autre catégorie active : `CONFLIT`, même message
 *   sous le champ `nom` ; la liste est recalculée.
 * - Catégorie inconnue : `INTROUVABLE` ; la liste est recalculée.
 * - Pas administrateur (garde, ou base qui refuse avec NV202) :
 *   `ACCES_REFUSE` ; la page recalculée affiche S1.
 * - Panne : `ERREUR_INTERNE`, journalisée par l'enveloppe.
 */
export async function actionRenommerCategorie(saisie: unknown): Promise<Reponse<CategorieRenommee>> {
  const reponse = await executerAction(async () => {
    const administrateur = await exigerAdministrateur();
    if (!administrateur) {
      refresh();
      return echec("ACCES_REFUSE", MESSAGES_ACCES_REFUSE.action);
    }

    const validation = validerRenommageCategorie(saisie);
    if (!validation.ok) {
      return echec("VALIDATION", resumeErreurs(Object.keys(validation.champs).length), {
        champs: validation.champs,
      });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("modifier_categorie", { p_categorie: validation.donnees.categorieId, p_nom: validation.donnees.nom })
      .abortSignal(AbortSignal.timeout(DELAI_MS));
    if (error) {
      // Rétrogradé ou désactivé entre la garde et la base.
      if (error.code === "NV202") {
        refresh();
        return echec("ACCES_REFUSE", MESSAGES_ACCES_REFUSE.action);
      }
      if (error.code === "NV501") {
        // Le nom peut venir d'un autre administrateur : la liste recalculée le montre.
        refresh();
        return echec("CONFLIT", MESSAGES_CATEGORIES.nomDejaPris, {
          champs: { nom: MESSAGES_CATEGORIES.nomDejaPris },
        });
      }
      if (error.code === "NV502") {
        refresh();
        return echec("INTROUVABLE", MESSAGES_CATEGORIES.enregistrementImpossible);
      }
      throw new Error(`La fonction modifier_categorie a échoué (code ${error.code || "inconnu"}).`);
    }

    const lu = schemaReponse.safeParse(data);
    if (!lu.success) throw reponseInattendue("modifier_categorie", lu.error);

    // Même sans changement : le nom affiché peut être ancien (un autre
    // administrateur a pu renommer la catégorie entre-temps).
    refresh();
    return succes({ id: lu.data.id.toLowerCase(), nom: lu.data.nom, change: lu.data.change });
  }, "modifier_categorie");

  // Le code court reste dans la réponse et le journal ; le message est celui de l'écran.
  if (!reponse.ok && reponse.code === "ERREUR_INTERNE") {
    return { ...reponse, message: MESSAGES_CATEGORIES.enregistrementImpossible };
  }
  return reponse;
}

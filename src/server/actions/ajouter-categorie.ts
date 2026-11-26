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
import { validerNouvelleCategorie } from "@/shared/schemas/categorie";

// Server Function du champ « Nouvelle catégorie » de l'écran A2 (story 4.1 ;
// FR-26, RM-7) : le seul point d'entrée du navigateur pour ajouter une
// catégorie (AD-1).
//
// - Elle commence par `exigerAdministrateur()` (AD-7) : sans session, renvoi
//   vers la connexion ; collaborateur (ou administrateur rétrogradé),
//   `ACCES_REFUSE` sans aucun appel à la base, et la page est recalculée
//   (`refresh()`) : elle devient S1.
// - Le nom est vérifié ici par le schéma partagé (AD-11) : vide ou trop
//   long, `VALIDATION` avec le message sous le champ, sans appel à la base.
// - L'ajout passe par la fonction SQL `ajouter_categorie`, avec la session
//   de l'administrateur (rôle `authenticated`), jamais avec la clé secrète
//   (AD-9). Elle refait le contrôle du rôle (NV202) et garantit le nom
//   unique parmi les catégories actives (NV501), même si deux
//   administrateurs agissent au même instant.
// - Réussite : `refresh()` recalcule la liste. Rien au journal : pas
//   d'événement de journal pour les catégories.
// - Nom déjà pris : `CONFLIT`, avec « Une catégorie active porte déjà ce
//   nom. » sous le champ ; rien n'est écrit. `refresh()` : la catégorie qui
//   porte ce nom (peut-être ajoutée à l'instant par un autre administrateur)
//   apparaît dans la liste.
// - Panne : levée ; l'enveloppe la journalise avec le nom de l'action et un
//   code court (AD-12, AD-13). La réponse `ERREUR_INTERNE` porte le message
//   de l'écran : « La catégorie n'a pas pu être enregistrée. Réessayez. ».

/** Ce que l'écran reçoit après un ajout. */
export type CategorieAjoutee = {
  id: string;
  /** Nom enregistré, espaces de bord retirés. */
  nom: string;
};

const schemaReponse = z.object({
  id: z.string().regex(FORME_IDENTIFIANT),
  nom: z.string(),
});

/**
 * Ajoute la catégorie active `nom`, en dernière position.
 *
 * - Ajoutée : `succes({ id, nom })`, la liste est recalculée.
 * - Nom vide ou trop long : `VALIDATION`, message sous le champ `nom`.
 * - Nom déjà porté par une catégorie active : `CONFLIT`, même message sous
 *   le champ `nom` ; la liste est recalculée.
 * - Pas administrateur (garde, ou base qui refuse avec NV202) :
 *   `ACCES_REFUSE` ; la page recalculée affiche S1.
 * - Panne : `ERREUR_INTERNE`, journalisée par l'enveloppe.
 */
export async function actionAjouterCategorie(saisie: unknown): Promise<Reponse<CategorieAjoutee>> {
  const reponse = await executerAction(async () => {
    const administrateur = await exigerAdministrateur();
    if (!administrateur) {
      refresh();
      return echec("ACCES_REFUSE", MESSAGES_ACCES_REFUSE.action);
    }

    const validation = validerNouvelleCategorie(saisie);
    if (!validation.ok) {
      return echec("VALIDATION", resumeErreurs(Object.keys(validation.champs).length), {
        champs: validation.champs,
      });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("ajouter_categorie", { p_nom: validation.donnees.nom })
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
      throw new Error(`La fonction ajouter_categorie a échoué (code ${error.code || "inconnu"}).`);
    }

    const lu = schemaReponse.safeParse(data);
    if (!lu.success) throw reponseInattendue("ajouter_categorie", lu.error);

    refresh();
    return succes({ id: lu.data.id.toLowerCase(), nom: lu.data.nom });
  }, "ajouter_categorie");

  // Le code court reste dans la réponse et le journal ; le message est celui de l'écran.
  if (!reponse.ok && reponse.code === "ERREUR_INTERNE") {
    return { ...reponse, message: MESSAGES_CATEGORIES.enregistrementImpossible };
  }
  return reponse;
}

"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { executerAction } from "@/server/actions/enveloppe";
import { exigerAdministrateur } from "@/server/garde";
import { journaliser } from "@/server/journal";
import { lireReference } from "@/server/lectures/demande";
import { DELAI_MS, reponseInattendue } from "@/server/lectures/demandes";
import { MESSAGES_ACCES_REFUSE, MESSAGES_DETAIL, MESSAGES_SUPPRESSION } from "@/shared/messages";
import { echec, succes, type Reponse } from "@/shared/reponse";

// Server Function de « Supprimer définitivement » de la zone administrateur
// de l'écran I4 (story 4.4 ; FR-28, RM-5, RM-7) : le seul point d'entrée du
// navigateur pour effacer une demande (AD-1).
//
// - Elle commence par `exigerAdministrateur()` (AD-7) : sans session, renvoi
//   vers la connexion ; collaborateur (ou administrateur rétrogradé),
//   `ACCES_REFUSE` sans aucun appel à la base, et la page est recalculée
//   (`refresh()`) : la zone administrateur disparaît.
// - La référence est vérifiée ici (Zod, forme NOVA-AAAA-NNNN) : mal formée,
//   `VALIDATION` sans appel à la base.
// - L'effacement passe par la fonction SQL `supprimer_demande`, avec la
//   session de l'administrateur (rôle `authenticated`), jamais avec la clé
//   secrète : seul chemin d'effacement (AD-2, AD-3). Elle refait le contrôle
//   du rôle (NV202), verrouille la demande, efface ses événements puis la
//   demande, dans une seule transaction.
// - Réussite : `demande_supprimee` au journal, avec seulement la référence
//   et l'identifiant de l'administrateur, jamais une donnée du demandeur
//   (AD-13). Pas de `refresh()` ici : le détail recalculé afficherait S2.
//   C'est le navigateur qui affiche le toast, revient à la liste
//   (`router.replace`) puis la recalcule (`router.refresh`).
// - Demande déjà supprimée (un autre administrateur est passé avant) :
//   `INTROUVABLE` et `refresh()` : la page recalculée affiche S2.
// - Panne : levée ; l'enveloppe la journalise avec le nom de l'action et un
//   code court, sans aucune donnée de la demande (AD-12, AD-13), et renvoie
//   `ERREUR_INTERNE`.

/** Ce que l'écran reçoit après une suppression. */
export type DemandeSupprimee = {
  /** Référence de la demande effacée, en majuscules. */
  reference: string;
};

const schemaSaisie = z.object({
  reference: z.string().max(100),
});

const schemaReponse = z.object({
  resultat: z.enum(["supprimee", "introuvable"]),
  reference: z.string(),
});

/**
 * Supprime définitivement la demande `reference` et tout son historique.
 *
 * - Supprimée : `succes({ reference })`, `demande_supprimee` au journal.
 * - Déjà supprimée ou inconnue : `INTROUVABLE` ; la page recalculée affiche
 *   « Cette demande n'existe pas ou a été supprimée. ».
 * - Pas administrateur (garde, ou base qui refuse avec NV202) :
 *   `ACCES_REFUSE` ; la page recalculée n'a plus la zone administrateur.
 * - Référence mal formée : `VALIDATION`, sans appel à la base.
 * - Panne : `ERREUR_INTERNE`, journalisée par l'enveloppe.
 */
export async function actionSupprimerDemande(saisie: unknown): Promise<Reponse<DemandeSupprimee>> {
  return executerAction(async () => {
    const administrateur = await exigerAdministrateur();
    if (!administrateur) {
      // Collaborateur, ou administrateur rétrogradé pendant que la fenêtre
      // était ouverte : la page recalculée n'a plus la zone administrateur.
      refresh();
      return echec("ACCES_REFUSE", MESSAGES_ACCES_REFUSE.action);
    }

    const validation = schemaSaisie.safeParse(saisie);
    const reference = validation.success ? lireReference(validation.data.reference) : null;
    if (!reference) return echec("VALIDATION", MESSAGES_SUPPRESSION.echec);

    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("supprimer_demande", { p_reference: reference })
      .abortSignal(AbortSignal.timeout(DELAI_MS));
    if (error) {
      // Rétrogradé ou désactivé entre la garde et la base.
      if (error.code === "NV202") {
        refresh();
        return echec("ACCES_REFUSE", MESSAGES_ACCES_REFUSE.action);
      }
      throw new Error(`La fonction supprimer_demande a échoué (code ${error.code || "inconnu"}).`);
    }

    const lu = schemaReponse.safeParse(data);
    if (!lu.success) throw reponseInattendue("supprimer_demande", lu.error);

    if (lu.data.resultat === "introuvable") {
      refresh();
      return echec("INTROUVABLE", MESSAGES_DETAIL.introuvable);
    }

    await journaliser("info", "demande_supprimee", { reference: lu.data.reference, auteur: administrateur.id });
    return succes({ reference: lu.data.reference });
  }, "supprimer_demande");
}

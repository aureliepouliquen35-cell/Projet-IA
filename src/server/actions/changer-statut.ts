"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { executerAction } from "@/server/actions/enveloppe";
import { exigerUtilisateur } from "@/server/garde";
import { lireReference } from "@/server/lectures/demande";
import { DELAI_MS, reponseInattendue } from "@/server/lectures/demandes";
import { STATUTS, STATUTS_DEMANDABLES, type Statut } from "@/shared/constantes";
import { formaterHeure } from "@/shared/dates";
import { MESSAGES_DETAIL, MESSAGES_STATUT, messageModifieePar } from "@/shared/messages";
import { echec, succes, type Reponse } from "@/shared/reponse";

// Server Function du panneau « Statut » de l'écran I4 (FR-16, FR-17).
//
// - Elle commence par `exigerUtilisateur()` (AD-7) : sans session, renvoi
//   vers la connexion.
// - La saisie est vérifiée ici (Zod) : un statut demandé autre que
//   *En cours* ou *Traitée* (retour à *Nouvelle* compris) est refusé sans
//   appeler la base (`VALIDATION`).
// - Le changement passe par la fonction SQL `changer_statut`, avec la
//   session de la personne (rôle `authenticated`) : seul chemin d'écriture
//   (AD-2). C'est elle qui fait foi sur les passages permis (AD-5), à partir
//   du statut réel de la demande.
// - Après un changement appliqué, refusé ou sans effet, et pour une demande
//   introuvable, `refresh()` demande à Next.js de recalculer la page : badge,
//   historique, date de clôture et compteur « à traiter » montrent l'état
//   réel.
// - Un conflit (collègue passé avant) est **renvoyé** (`CONFLIT`), jamais
//   levé (AD-12). Une panne est levée : l'enveloppe la journalise avec le
//   nom de l'action et un code court, sans aucune donnée de la demande
//   (AD-13), et renvoie `ERREUR_INTERNE`.

/** Ce que l'écran reçoit après un changement appliqué. */
export type ChangementStatut = {
  /** Statut en place après le changement. */
  statut: Statut;
  /**
   * Encadré « Cette demande a été modifiée par … à … » si un collègue avait
   * changé le statut juste avant (le changement a quand même été appliqué) ;
   * sinon `null`.
   */
  modifiee: string | null;
};

const schemaSaisie = z.object({
  reference: z.string().max(100),
  statutVu: z.enum(STATUTS),
  nouveauStatut: z.enum(STATUTS_DEMANDABLES),
});

const schemaReponse = z.object({
  resultat: z.enum(["applique", "inchange", "refuse", "introuvable"]),
  statut: z.enum(STATUTS).nullable(),
  modifiee_par: z
    .object({
      nom: z.string(),
      date: z.string().refine((texte) => !Number.isNaN(Date.parse(texte))),
    })
    .nullable(),
});

/** Codes des refus prévus de `changer_statut` : saisie impossible (le serveur l'a déjà vérifiée). */
const REFUS_SAISIE = new Set(["NV301", "NV302"]);

const messageModifiee = (modifieePar: { nom: string; date: string } | null) =>
  modifieePar ? messageModifieePar(modifieePar.nom, formaterHeure(new Date(modifieePar.date))) : null;

/**
 * Change le statut de la demande `reference`, que la personne voyait au
 * statut `statutVu`, vers `nouveauStatut`.
 *
 * - Appliqué : `succes({ statut, modifiee })` ; `modifiee` est le texte de
 *   l'encadré si un collègue était passé avant.
 * - Statut déjà en place, ou passage plus permis depuis le statut réel :
 *   `CONFLIT`, avec le texte de l'encadré ; rien n'est écrit.
 * - Demande inconnue : `INTROUVABLE` ; la page recalculée affiche « demande
 *   introuvable ».
 * - Saisie refusée (statut *Nouvelle* ou inconnu, référence mal formée) :
 *   `VALIDATION`, sans appel à la base.
 * - Panne : `ERREUR_INTERNE`, journalisée par l'enveloppe.
 */
export async function actionChangerStatut(saisie: unknown): Promise<Reponse<ChangementStatut>> {
  return executerAction(async () => {
    await exigerUtilisateur();

    const validation = schemaSaisie.safeParse(saisie);
    const reference = validation.success ? lireReference(validation.data.reference) : null;
    if (!validation.success || !reference) {
      return echec("VALIDATION", MESSAGES_STATUT.echec);
    }
    const { statutVu, nouveauStatut } = validation.data;

    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("changer_statut", {
        p_reference: reference,
        p_statut_vu: statutVu,
        p_nouveau_statut: nouveauStatut,
      })
      .abortSignal(AbortSignal.timeout(DELAI_MS));
    if (error) {
      if (REFUS_SAISIE.has(error.code)) return echec("VALIDATION", MESSAGES_STATUT.echec);
      throw new Error(`La fonction changer_statut a échoué (code ${error.code || "inconnu"}).`);
    }

    const lu = schemaReponse.safeParse(data);
    if (!lu.success) throw reponseInattendue("changer_statut", lu.error);
    const { resultat, statut, modifiee_par: modifieePar } = lu.data;
    if (resultat !== "introuvable" && statut === null) {
      throw new Error("Réponse inattendue de changer_statut (statut).");
    }

    refresh();

    switch (resultat) {
      case "introuvable":
        return echec("INTROUVABLE", MESSAGES_DETAIL.introuvable);
      case "inchange":
      case "refuse":
        return echec("CONFLIT", messageModifiee(modifieePar) ?? MESSAGES_STATUT.modifieeEntreTemps);
      case "applique":
        return succes({ statut: statut!, modifiee: messageModifiee(modifieePar) });
    }
  }, "changer_statut");
}

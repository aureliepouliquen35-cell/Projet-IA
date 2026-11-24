"use server";

import { refresh } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { executerAction } from "@/server/actions/enveloppe";
import { REFUS_PREVUS_SAISIE } from "@/server/actions/refus-saisie";
import { exigerUtilisateur } from "@/server/garde";
import { DELAI_MS } from "@/server/lectures/demandes";
import { FORME_REFERENCE } from "@/shared/constantes";
import { MESSAGES_SAISIE, resumeErreurs } from "@/shared/messages";
import { estNumeroEnvoi } from "@/shared/numero-envoi";
import { echec, succes, type ErreursChamps, type Reponse } from "@/shared/reponse";
import { validerSaisieInterne } from "@/shared/schemas/saisie";

// Server Function de l'écran I5 « Nouvelle demande » (FR-30, RM-12) : le
// seul point d'entrée du navigateur pour saisir une demande reçue par
// téléphone ou par email (AD-1).
//
// - Elle commence par `exigerUtilisateur()` (AD-7) : sans session, renvoi
//   vers la connexion.
// - La saisie est vérifiée ici avec le schéma partagé (AD-11) : c'est elle
//   qui fait foi, celle du navigateur ne sert qu'aux messages immédiats.
// - La demande est créée par la fonction SQL `saisir_demande`, avec la
//   session de la personne (rôle `authenticated`), jamais avec la clé
//   secrète : seul chemin d'écriture (AD-2). La base répète les refus
//   (canal, case, catégorie) : ils reviennent ici en erreur de saisie.
// - Pas de limite d'envois : l'appelant est un utilisateur interne connecté.
// - Après une création, `refresh()` demande à Next.js de recalculer ce qui
//   est affiché (pastille « à traiter » du menu) ; l'écran passe ensuite au
//   détail de la demande.
// - Une panne est levée : l'enveloppe la journalise avec le nom de l'action
//   et un code court, sans aucune donnée saisie (AD-12, AD-13), et renvoie
//   `ERREUR_INTERNE`.

function saisieRefusee(champs: ErreursChamps) {
  return echec("VALIDATION", resumeErreurs(Object.keys(champs).length), { champs });
}

/**
 * Enregistre une demande reçue par téléphone ou par email.
 *
 * `numeroEnvoi` : UUID tiré par le formulaire à son affichage, gardé pour
 * les nouveaux essais après un refus ou une panne (AD-20). Le même numéro
 * envoyé deux fois ne crée qu'une demande : le second envoi reçoit la
 * référence de la première.
 *
 * - Saisie incorrecte (canal *Formulaire* compris) : `VALIDATION` avec les
 *   champs, rien n'est enregistré.
 * - Numéro d'envoi absent ou mal formé : `VALIDATION` sans champ.
 * - Réussite : `{ ok: true, donnees: { reference } }`.
 * - Panne : `ERREUR_INTERNE`, journalisée par l'enveloppe.
 */
export async function actionSaisirDemande(
  saisie: unknown,
  numeroEnvoi: unknown,
): Promise<Reponse<{ reference: string }>> {
  return executerAction(async () => {
    await exigerUtilisateur();

    const validation = validerSaisieInterne(saisie);
    if (!validation.ok) return saisieRefusee(validation.champs);
    if (!estNumeroEnvoi(numeroEnvoi)) return echec("VALIDATION", MESSAGES_SAISIE.formulaireIncomplet);
    const donnees = validation.donnees;

    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("saisir_demande", {
        p_canal: donnees.canal,
        p_nom: donnees.nom,
        p_email: donnees.email,
        p_telephone: donnees.telephone,
        p_entreprise: donnees.entreprise,
        p_categorie_id: donnees.categorieId,
        p_objet: donnees.objet,
        p_description: donnees.description,
        p_personne_informee: donnees.personneInformee,
        p_numero_envoi: numeroEnvoi.toLowerCase(),
      })
      .abortSignal(AbortSignal.timeout(DELAI_MS));

    if (error) {
      const champs = REFUS_PREVUS_SAISIE.get(error.code);
      if (champs) return saisieRefusee({ ...champs });
      throw new Error(`La fonction saisir_demande a échoué (code ${error.code || "inconnu"}).`);
    }

    // Une seule ligne attendue : la référence.
    const ligne: unknown = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (
      typeof ligne !== "object" ||
      ligne === null ||
      !("reference" in ligne) ||
      typeof ligne.reference !== "string" ||
      !FORME_REFERENCE.test(ligne.reference)
    ) {
      throw new Error("La fonction saisir_demande n'a pas renvoyé de référence.");
    }

    refresh();
    return succes({ reference: ligne.reference });
  }, "saisir_demande");
}

"use server";

import { executerAction } from "@/server/actions/enveloppe";
import { choisirMotDePasse } from "@/server/connexion";
import { exigerChangementMotDePasse } from "@/server/garde";
import { MESSAGES_MOT_DE_PASSE, resumeErreurs } from "@/shared/messages";
import { echec, succes, type Reponse } from "@/shared/reponse";
import { validerMotDePasse } from "@/shared/schemas/mot-de-passe";

// Server Function de l'écran I2 (FR-21, AD-6). Elle n'est permise qu'à la
// personne connectée qui doit encore choisir son mot de passe : la garde le
// vérifie en premier (AD-7), et la vérification de la saisie faite ici fait
// foi (AD-11).

/**
 * Remplace le mot de passe temporaire de la personne connectée.
 *
 * - Sans session (session expirée comprise) : renvoi vers la connexion ;
 *   mot de passe déjà choisi : renvoi vers « Demandes » (`redirect`).
 * - Saisie refusée (moins de 12 caractères, confirmation différente) :
 *   `VALIDATION` avec ses champs ; rien n'est appelé.
 * - Mot de passe temporaire réutilisé : `VALIDATION` sur `motDePasse` ;
 *   Supabase Auth n'est pas modifié.
 * - Réussite : `succes(null)` ; l'écran affiche le toast et passe à
 *   « Demandes ».
 * - Panne : `ERREUR_INTERNE`, journalisée par l'enveloppe (AD-12).
 */
export async function actionChoisirMotDePasse(saisie: unknown): Promise<Reponse<null>> {
  return executerAction(async () => {
    const { id } = await exigerChangementMotDePasse();

    const validation = validerMotDePasse(saisie);
    if (!validation.ok) {
      return echec("VALIDATION", resumeErreurs(Object.keys(validation.champs).length), {
        champs: validation.champs,
      });
    }

    const resultat = await choisirMotDePasse(id, validation.donnees.motDePasse);
    if (resultat === "temporaire") {
      return echec("VALIDATION", resumeErreurs(1), {
        champs: { motDePasse: MESSAGES_MOT_DE_PASSE.identiqueAuTemporaire },
      });
    }
    return succes(null);
  }, "choisir_mot_de_passe");
}

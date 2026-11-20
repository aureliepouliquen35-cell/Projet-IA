"use server";

import { redirect } from "next/navigation";

import { executerAction } from "@/server/actions/enveloppe";
import { connecter } from "@/server/connexion";
import { oublierMessageConnexion } from "@/server/passage";
import { ADRESSE_ACCUEIL_INTERNE, ADRESSE_NOUVEAU_MOT_DE_PASSE } from "@/shared/acces";
import { MESSAGES_CONNEXION, resumeErreurs } from "@/shared/messages";
import { echec, type Reponse } from "@/shared/reponse";
import { validerConnexion } from "@/shared/schemas/connexion";

// Server Function de la connexion I1 (FR-8, AD-8). Elle est publique :
// n'importe qui peut l'appeler avec n'importe quoi. La vérification faite
// ici fait donc foi (AD-11).

/**
 * Ouvre une session avec l'email et le mot de passe saisis.
 *
 * - Saisie vide ou mal formée : `VALIDATION` avec ses champs ; Supabase
 *   n'est pas appelé, rien n'est enregistré.
 * - Identifiants refusés (email inconnu, mauvais mot de passe, compte
 *   inactif) : `VALIDATION` sans champ, « Identifiants incorrects ».
 * - Blocage (5 échecs récents) : `TROP_DE_TENTATIVES`, « Trop de
 *   tentatives, réessayez plus tard ».
 * - Réussite : session ouverte, message « session expirée » effacé, puis
 *   passage à « Demandes », ou à I2 si le mot de passe temporaire doit être
 *   remplacé (`redirect`). Jamais de retour à la page demandée avant.
 * - Panne : `ERREUR_INTERNE`, journalisée par l'enveloppe (AD-12).
 */
export async function actionSeConnecter(saisie: unknown): Promise<Reponse<null>> {
  return executerAction(async () => {
    const validation = validerConnexion(saisie);
    if (!validation.ok) {
      return echec("VALIDATION", resumeErreurs(Object.keys(validation.champs).length), {
        champs: validation.champs,
      });
    }

    const { email, motDePasse } = validation.donnees;
    const resultat = await connecter(email, motDePasse);
    if (resultat === "bloquee") {
      return echec("TROP_DE_TENTATIVES", MESSAGES_CONNEXION.tropDeTentatives);
    }
    if (resultat === "refusee") {
      return echec("VALIDATION", MESSAGES_CONNEXION.identifiantsIncorrects);
    }

    await oublierMessageConnexion();
    // Lève l'interruption de Next.js : l'enveloppe la relance.
    redirect(
      resultat === "mot_de_passe_a_changer" ? ADRESSE_NOUVEAU_MOT_DE_PASSE : ADRESSE_ACCUEIL_INTERNE,
    );
  }, "se_connecter");
}

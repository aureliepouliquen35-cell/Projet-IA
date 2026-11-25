"use server";

import { refresh } from "next/cache";

import { creerCompte, type CompteCree } from "@/server/admin";
import { executerAction } from "@/server/actions/enveloppe";
import { exigerAdministrateur } from "@/server/garde";
import { journaliser } from "@/server/journal";
import { nouveauCodeSupport } from "@/shared/code-support";
import { MESSAGES_ACCES_REFUSE, MESSAGES_COMPTE } from "@/shared/messages";
import { echec, type Reponse } from "@/shared/reponse";

// Server Function de la fenêtre « Créer un compte » de l'écran A1 (story
// 3.2 ; FR-21, RM-7, RM-8) : le seul point d'entrée du navigateur pour créer
// un compte interne (AD-1).
//
// - Elle commence par `exigerAdministrateur()` (AD-7) : sans session, renvoi
//   vers la connexion ; collaborateur, `ACCES_REFUSE`, sans aucun appel à
//   Supabase pour créer quoi que ce soit.
// - La création passe par `creerCompte()` de `src/server/admin` (AD-6), seul
//   module qui tient la clé secrète : saisie vérifiée par le schéma partagé
//   (AD-11, c'est elle qui fait foi), compte Auth « email confirmé » (aucun
//   email envoyé), profil par `creer_profil`, retour arrière si le profil
//   échoue, `compte_cree` au journal avec l'administrateur comme auteur.
// - Réussite : `refresh()` recalcule le tableau des comptes. La réponse ne
//   contient jamais le mot de passe : le navigateur, qui l'a tiré ou saisi,
//   l'affiche lui-même une seule fois.
// - Panne : réponse `ERREUR_INTERNE` avec le message de l'écran (« Le compte
//   n'a pas pu être créé. Réessayez. ») et un code court, gardé dans la
//   réponse et le journal (par `creerCompte`, par l'enveloppe pour une panne
//   levée, ou ici pour des clés absentes) ; l'écran n'affiche que le message
//   de l'UX, comme I5 (AD-12, AD-13).

export async function actionCreerCompte(saisie: unknown): Promise<Reponse<CompteCree>> {
  return executerAction(async () => {
    const administrateur = await exigerAdministrateur();
    if (!administrateur) return echec("ACCES_REFUSE", MESSAGES_ACCES_REFUSE.action);

    const reponse = await creerCompte(saisie, { auteur: administrateur.id });
    if (!reponse.ok) {
      // Les messages techniques de `creerCompte` (clés absentes, retour
      // arrière manqué) sont écrits pour la procédure d'installation : la
      // réponse porte le message de l'écran et le code du support.
      if (reponse.code === "ERREUR_INTERNE") {
        let codeSupport = reponse.codeSupport;
        if (!codeSupport) {
          // Clés absentes : `creerCompte` n'a rien journalisé.
          codeSupport = nouveauCodeSupport();
          console.error(`[action] erreur inattendue (code ${codeSupport}, action creer_compte) : clés absentes`);
          await journaliser("erreur", "erreur_inattendue", { type: "action", action: "creer_compte" }, codeSupport);
        }
        return echec("ERREUR_INTERNE", MESSAGES_COMPTE.creationImpossible, { codeSupport });
      }
      return reponse;
    }

    refresh();
    // Seulement ces quatre champs, jamais le mot de passe.
    const { id, nom, email, role } = reponse.donnees;
    return { ok: true, donnees: { id, nom, email, role } };
  }, "creer_compte");
}

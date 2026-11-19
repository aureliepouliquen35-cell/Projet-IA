import "server-only";

import { creerClientSecret } from "@/server/supabase-secret";

// Journal technique (AD-13) : seul chemin d'écriture dans `journal_technique`,
// par la fonction SQL `ecrire_journal`.
//
// Ne jamais y mettre de mot de passe, ni le nom, les coordonnées ou le texte
// d'un demandeur, ni le message d'une erreur (il peut en contenir). Les
// détails peuvent contenir une référence, l'identifiant ou l'email d'un
// utilisateur interne, un chemin de page sans ses paramètres.

export const NIVEAUX_JOURNAL = ["info", "avertissement", "erreur"] as const;
export type NiveauJournal = (typeof NIVEAUX_JOURNAL)[number];

/** Liste fermée des événements (AD-13), identique à la contrainte SQL. */
export const EVENEMENTS_JOURNAL = [
  "connexion_reussie",
  "connexion_echouee",
  "connexion_bloquee",
  "compte_cree",
  "role_modifie",
  "compte_desactive",
  "compte_reactive",
  "mot_de_passe_reinitialise",
  "demande_supprimee",
  "anonymisation",
  "parametres_modifies",
  "envoi_refuse",
  "erreur_inattendue",
  "sauvegarde_reussie",
] as const;
export type EvenementJournal = (typeof EVENEMENTS_JOURNAL)[number];

export type DetailsJournal = Record<string, string | number | boolean | null>;

/** Au-delà, on abandonne l'écriture : la page ne doit pas attendre le journal. */
const DELAI_MAXIMUM_MS = 3000;

/**
 * Écrit une ligne dans le journal technique.
 *
 * Ne lève jamais : un journal injoignable ne doit pas casser la page ni
 * l'action en cours. L'échec est seulement signalé dans les journaux du
 * serveur.
 */
export async function journaliser(
  niveau: NiveauJournal,
  evenement: EvenementJournal,
  details: DetailsJournal = {},
  codeErreur?: string,
): Promise<void> {
  try {
    const { error } = await creerClientSecret()
      .rpc("ecrire_journal", {
        p_niveau: niveau,
        p_evenement: evenement,
        p_details: details,
        p_code_erreur: codeErreur ?? null,
      })
      .abortSignal(AbortSignal.timeout(DELAI_MAXIMUM_MS));
    if (error) {
      console.error(
        `[journal] écriture refusée (${evenement}, code ${codeErreur ?? "aucun"}) :`,
        error.code ?? error.message,
      );
    }
  } catch (cause) {
    console.error(
      `[journal] écriture impossible (${evenement}, code ${codeErreur ?? "aucun"}) :`,
      cause instanceof Error ? cause.message : cause,
    );
  }
}

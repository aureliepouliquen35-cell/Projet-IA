"use client";

import { CircleAlert, LoaderCircle, Trash2 } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { messageEchecCategorie } from "@/components/interne/etat-categorie";
import { Alert, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { afficherSucces } from "@/components/ui/sonner";
import { actionSupprimerCategorie, type CategorieSupprimee } from "@/server/actions/supprimer-categorie";
import { MESSAGES_CATEGORIES } from "@/shared/messages";
import { echec, type Reponse } from "@/shared/reponse";

// « Supprimer » de la colonne Actions de l'écran A2 (story 4.2 ;
// EXPERIENCE.md, A2 ; FR-26).
//
// - Proposé seulement pour une catégorie sans aucune demande. La base le
//   revérifie (NV504).
// - Il ouvre la fenêtre de confirmation : pastille rouge clair avec la
//   corbeille, « Supprimer la catégorie Facturation ? », « Elle n'a jamais
//   été utilisée. Cette action est irréversible. », puis « Annuler »
//   (secondaire, sélectionné à l'ouverture, Échap ferme) et « Supprimer »
//   (bouton danger, rouge).
// - Pendant l'envoi : indicateur « Suppression… », la fenêtre ne se ferme
//   pas et un second clic n'envoie rien (AD-20).
// - Réussite : la fenêtre se ferme, toast « Catégorie supprimée » ; la liste
//   recalculée par `refresh()` n'a plus la ligne.
// - Refus (dernière catégorie active, catégorie devenue utilisée), accès
//   refusé ou panne : le message s'affiche dans la fenêtre, qui reste
//   ouverte. Une catégorie devenue utilisée perd son « Supprimer » dans la
//   liste recalculée, mais la fenêtre ouverte reste affichée avec son
//   message jusqu'à ce qu'on la ferme.
// - Catégorie déjà supprimée : la fenêtre se ferme, la ligne disparaît.
//
// `suiteApresSuppressionCategorie`, `envoyerSuppressionCategorie`,
// `appliquerSuiteSuppressionCategorie` et
// `changerOuvertureSuppressionCategorie` sont exportées et essayées seules ;
// `VueSupprimerCategorie` est l'écran, sans état ; `SupprimerCategorie`
// relie les deux à la Server Function.

/** Ce que le bouton et la fenêtre montrent de la catégorie. */
export type CategorieSuppression = { id: string; nom: string; nombreDemandes: number };

/** « Supprimer » n'est proposé que pour une catégorie jamais utilisée. */
export const suppressionProposee = (categorie: Pick<CategorieSuppression, "nombreDemandes">) =>
  categorie.nombreDemandes === 0;

// ---------------------------------------------------------------------------
// Réponse
// ---------------------------------------------------------------------------

/** Ce que la fenêtre fait après la réponse de la Server Function. */
export type SuiteSuppressionCategorie =
  /** Le serveur a changé de page, ou la catégorie était déjà supprimée. */
  | { type: "rien" }
  | { type: "succes"; message: string }
  | { type: "erreur"; message: string };

/**
 * Suite à donner à une réponse. Les textes affichés sont ceux de l'UX,
 * jamais un message technique :
 * - aucune réponse : le serveur a changé de page ;
 * - réussite : « Catégorie supprimée » ;
 * - déjà supprimée : rien (la ligne disparaît) ;
 * - dernière catégorie active, catégorie utilisée : le message exact ;
 * - accès refusé : « Accès refusé. » ;
 * - toute autre réponse : « La catégorie n'a pas pu être modifiée. Réessayez. ».
 */
export function suiteApresSuppressionCategorie(
  reponse: Reponse<CategorieSupprimee> | undefined,
): SuiteSuppressionCategorie {
  if (!reponse) return { type: "rien" };
  if (reponse.ok) return { type: "succes", message: MESSAGES_CATEGORIES.categorieSupprimee };
  if (reponse.code === "INTROUVABLE") return { type: "rien" };
  return { type: "erreur", message: messageEchecCategorie(reponse) };
}

/** Ce dont l'envoi a besoin : passé en paramètre pour pouvoir être essayé seul. */
export type DependancesSuppressionCategorie = {
  categorieId: string;
  /** La Server Function (`actionSupprimerCategorie`). */
  supprimer: (saisie: { categorieId: string }) => Promise<Reponse<CategorieSupprimee> | undefined>;
  /** Fermé pendant l'envoi : un second clic n'envoie rien (AD-20). */
  envoiVerrouille: { current: boolean };
  /** Reçoit la suite (toast, message dans la fenêtre, fermeture). */
  apresReponse: (suite: SuiteSuppressionCategorie) => void;
};

/**
 * Envoie la suppression et traite la réponse.
 *
 * - Verrou déjà fermé : rien n'est envoyé. Sinon il est fermé pendant
 *   l'envoi, puis rouvert quelle que soit la réponse.
 * - Un réseau coupé donne la même suite qu'une panne.
 * - Une redirection du serveur (session terminée par la garde) est relancée
 *   pour que Next.js change de page : le verrou est rouvert, aucune suite
 *   n'est donnée.
 */
export async function envoyerSuppressionCategorie({
  categorieId,
  supprimer,
  envoiVerrouille,
  apresReponse,
}: DependancesSuppressionCategorie): Promise<void> {
  if (envoiVerrouille.current) return;
  envoiVerrouille.current = true;

  let reponse: Reponse<CategorieSupprimee> | undefined;
  try {
    reponse = await supprimer({ categorieId });
  } catch (erreur) {
    try {
      unstable_rethrow(erreur);
    } catch (redirection) {
      envoiVerrouille.current = false;
      throw redirection;
    }
    reponse = echec("ERREUR_INTERNE", MESSAGES_CATEGORIES.modificationImpossible);
  }

  envoiVerrouille.current = false;
  apresReponse(suiteApresSuppressionCategorie(reponse));
}

/** Ce que la fenêtre fait de la suite d'une réponse : passé en paramètre pour être essayé seul. */
export type DependancesSuiteSuppressionCategorie = {
  setFenetreOuverte: (ouverte: boolean) => void;
  /** Refus ou panne affiché dans la fenêtre. */
  setErreur: (message: string | null) => void;
  /** Toast de succès (5 s). */
  afficherSucces: (message: string) => void;
};

/**
 * Applique la suite d'une réponse :
 * - réussite : fenêtre fermée, toast de succès ;
 * - erreur : message dans la fenêtre, qui reste ouverte ;
 * - rien : fenêtre fermée.
 */
export function appliquerSuiteSuppressionCategorie(
  suite: SuiteSuppressionCategorie,
  deps: DependancesSuiteSuppressionCategorie,
): void {
  if (suite.type === "erreur") {
    deps.setErreur(suite.message);
    return;
  }
  deps.setFenetreOuverte(false);
  if (suite.type === "succes") deps.afficherSucces(suite.message);
}

/**
 * Ouverture ou fermeture demandée (« Supprimer », « Annuler », Échap) :
 * ignorée pendant l'envoi (la réponse doit pouvoir s'afficher) ; sinon le
 * message d'erreur est retiré et la fenêtre suit.
 */
export function changerOuvertureSuppressionCategorie(
  ouvrir: boolean,
  envoiVerrouille: { current: boolean },
  deps: Pick<DependancesSuiteSuppressionCategorie, "setFenetreOuverte" | "setErreur">,
): void {
  if (envoiVerrouille.current) return;
  deps.setErreur(null);
  deps.setFenetreOuverte(ouvrir);
}

// ---------------------------------------------------------------------------
// Écran (sans état)
// ---------------------------------------------------------------------------

export function VueSupprimerCategorie({
  categorie,
  envoiEnCours = false,
  fenetreOuverte = false,
  erreur = null,
  onOuverture,
  onSupprimer,
}: {
  categorie: CategorieSuppression;
  /** Envoi en cours : indicateur, boutons désactivés. */
  envoiEnCours?: boolean;
  fenetreOuverte?: boolean;
  /** Refus ou panne affiché dans la fenêtre. */
  erreur?: string | null;
  onOuverture?: (ouvrir: boolean) => void;
  onSupprimer?: () => void;
}) {
  const proposee = suppressionProposee(categorie);
  // Catégorie utilisée : pas de « Supprimer ». Si elle l'est devenue pendant
  // que la fenêtre était ouverte, la fenêtre reste, avec son message.
  if (!proposee && !fenetreOuverte) return null;

  return (
    <AlertDialog open={fenetreOuverte} onOpenChange={onOuverture}>
      {proposee ? (
        <AlertDialogTrigger asChild>
          <Button
            variant="secondaire"
            size="sm"
            data-slot="supprimer-categorie"
            aria-label={MESSAGES_CATEGORIES.supprimerNom(categorie.nom)}
          >
            <Trash2 aria-hidden="true" />
            {MESSAGES_CATEGORIES.supprimer}
          </Button>
        </AlertDialogTrigger>
      ) : null}
      <AlertDialogContent data-slot="fenetre-supprimer-categorie" aria-busy={envoiEnCours || undefined}>
        <span
          aria-hidden="true"
          data-slot="pastille-supprimer"
          className="mb-3.5 flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger"
        >
          <Trash2 className="size-5" />
        </span>
        <AlertDialogTitle>{MESSAGES_CATEGORIES.fenetreSupprimerTitre(categorie.nom)}</AlertDialogTitle>
        <AlertDialogDescription>{MESSAGES_CATEGORIES.fenetreSupprimerTexte}</AlertDialogDescription>
        {erreur ? (
          <Alert variant="erreur" data-slot="refus-suppression" className="mb-5">
            <AlertTitle>
              <CircleAlert aria-hidden="true" />
              {erreur}
            </AlertTitle>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={envoiEnCours}>{MESSAGES_CATEGORIES.annuler}</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            data-slot="confirmer-suppression-categorie"
            // Devenue utilisée (NV504) : plus rien à confirmer.
            disabled={envoiEnCours || !proposee}
            onClick={(evenement) => {
              // La fenêtre reste ouverte jusqu'à la réponse : un refus s'y affiche.
              evenement.preventDefault();
              onSupprimer?.();
            }}
          >
            {envoiEnCours ? (
              <>
                <LoaderCircle aria-hidden="true" className="animate-spin" />
                {MESSAGES_CATEGORIES.suppressionEnCours}
              </>
            ) : (
              MESSAGES_CATEGORIES.supprimer
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Bouton et fenêtre (avec état)
// ---------------------------------------------------------------------------

export function SupprimerCategorie({ categorie }: { categorie: CategorieSuppression }) {
  const [envoiEnCours, demarrerEnvoi] = useTransition();
  const [fenetreOuverte, setFenetreOuverte] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Un second clic avant la réponse n'envoie rien.
  const envoiVerrouille = useRef(false);

  function supprimer() {
    if (envoiVerrouille.current) return;
    setErreur(null);
    demarrerEnvoi(() =>
      envoyerSuppressionCategorie({
        categorieId: categorie.id,
        supprimer: actionSupprimerCategorie,
        envoiVerrouille,
        apresReponse: (suite) =>
          appliquerSuiteSuppressionCategorie(suite, { setFenetreOuverte, setErreur, afficherSucces }),
      }),
    );
  }

  return (
    <VueSupprimerCategorie
      categorie={categorie}
      envoiEnCours={envoiEnCours}
      fenetreOuverte={fenetreOuverte}
      erreur={erreur}
      onOuverture={(ouvrir) => changerOuvertureSuppressionCategorie(ouvrir, envoiVerrouille, { setFenetreOuverte, setErreur })}
      onSupprimer={supprimer}
    />
  );
}

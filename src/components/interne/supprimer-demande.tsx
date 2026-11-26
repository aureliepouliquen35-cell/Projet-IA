"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

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
import { afficherErreur, afficherSucces } from "@/components/ui/sonner";
import { actionSupprimerDemande, type DemandeSupprimee } from "@/server/actions/supprimer-demande";
import { MESSAGES_ACCES_REFUSE, MESSAGES_SUPPRESSION } from "@/shared/messages";
import { echec, type Reponse } from "@/shared/reponse";

// Zone administrateur du panneau d'actions de l'écran I4 (story 4.4 ;
// EXPERIENCE.md, I4 et Flux 5 ; FR-28, RM-5, RM-7). Rendue par la page pour
// les seuls administrateurs ; la Server Function refuse de toute façon un
// collaborateur.
//
// - En bas du panneau, séparée par un trait : « Supprimer la demande… »,
//   lien rouge en semi-gras, sans fond, avec la corbeille.
// - Il ouvre la fenêtre de confirmation (440 px au plus) : pastille rouge
//   clair avec la corbeille, « Supprimer définitivement la demande
//   NOVA-… ? » (référence en chasse fixe), « La demande et tout son
//   historique seront effacés. Cette action est irréversible. », puis
//   « Annuler » (secondaire, sélectionné à l'ouverture, Échap ferme) et
//   « Supprimer définitivement » (seul bouton `danger`).
// - Pendant l'envoi, la fenêtre ne se ferme pas et un second clic n'envoie
//   rien (AD-20).
// - Réussite : toast « Demande NOVA-… supprimée », retour à la liste d'où
//   l'on venait (`router.replace`, même recherche, mêmes filtres), puis
//   liste, carte et pastille « à traiter » recalculées (`router.refresh`).
//   La fenêtre reste affichée, occupée, jusqu'au changement de page.
// - Déjà supprimée : rien ; la page recalculée par le serveur affiche S2.
// - Accès refusé : toast « Accès refusé. » ; la page recalculée n'a plus la
//   zone administrateur.
// - Panne : la fenêtre se ferme, la demande reste affichée, toast d'erreur
//   « La demande n'a pas pu être supprimée. Réessayez. » (jusqu'à
//   fermeture).
//
// `suiteApresSuppression`, `envoyerSuppression`, `appliquerSuiteSuppression`
// et `changerOuvertureSuppression` sont exportées et essayées seules ;
// `VueSupprimerDemande` est l'écran, sans état ; `SupprimerDemande` relie
// les deux à la Server Function et au routeur.

// ---------------------------------------------------------------------------
// Réponse
// ---------------------------------------------------------------------------

/** Ce que l'écran fait après la réponse de la Server Function. */
export type SuiteSuppression =
  /** Le serveur a changé de page, ou la page recalculée affiche S2. */
  | { type: "rien" }
  | { type: "succes"; message: string }
  | { type: "erreur"; message: string };

/**
 * Suite à donner à une réponse. Les textes affichés sont ceux de l'UX,
 * jamais un message technique :
 * - aucune réponse : le serveur a changé de page (session expirée) ;
 * - réussite : « Demande NOVA-… supprimée » ;
 * - introuvable : rien (la page recalculée affiche S2) ;
 * - accès refusé : « Accès refusé. » ;
 * - toute autre réponse : « La demande n'a pas pu être supprimée. Réessayez. ».
 */
export function suiteApresSuppression(reponse: Reponse<DemandeSupprimee> | undefined): SuiteSuppression {
  if (!reponse) return { type: "rien" };
  if (reponse.ok) return { type: "succes", message: MESSAGES_SUPPRESSION.supprimee(reponse.donnees.reference) };
  if (reponse.code === "INTROUVABLE") return { type: "rien" };
  if (reponse.code === "ACCES_REFUSE") return { type: "erreur", message: MESSAGES_ACCES_REFUSE.action };
  return { type: "erreur", message: MESSAGES_SUPPRESSION.echec };
}

/** Ce dont l'envoi a besoin : passé en paramètre pour pouvoir être essayé seul. */
export type DependancesSuppression = {
  reference: string;
  /** La Server Function (`actionSupprimerDemande`). */
  supprimer: (saisie: { reference: string }) => Promise<Reponse<DemandeSupprimee> | undefined>;
  /** Fermé pendant l'envoi : un second clic n'envoie rien (AD-20). */
  envoiVerrouille: { current: boolean };
  /** Reçoit la suite (toast, retour à la liste, fermeture). */
  apresReponse: (suite: SuiteSuppression) => void;
};

/**
 * Envoie la suppression et traite la réponse.
 *
 * - Verrou déjà fermé : rien n'est envoyé. Sinon il est fermé pendant
 *   l'envoi ; il reste fermé après une réussite (la page va changer : rien
 *   ne doit repartir), et il est rouvert après toute autre réponse.
 * - Un réseau coupé donne la même suite qu'une panne.
 * - Une redirection du serveur (session terminée par la garde) est relancée
 *   pour que Next.js change de page : le verrou est rouvert, aucune suite
 *   n'est donnée.
 */
export async function envoyerSuppression({
  reference,
  supprimer,
  envoiVerrouille,
  apresReponse,
}: DependancesSuppression): Promise<void> {
  if (envoiVerrouille.current) return;
  envoiVerrouille.current = true;

  let reponse: Reponse<DemandeSupprimee> | undefined;
  try {
    reponse = await supprimer({ reference });
  } catch (erreur) {
    try {
      unstable_rethrow(erreur);
    } catch (redirection) {
      envoiVerrouille.current = false;
      throw redirection;
    }
    reponse = echec("ERREUR_INTERNE", MESSAGES_SUPPRESSION.echec);
  }

  const suite = suiteApresSuppression(reponse);
  if (suite.type !== "succes") envoiVerrouille.current = false;
  apresReponse(suite);
}

/** Ce que la zone fait de la suite d'une réponse : passé en paramètre pour être essayé seul. */
export type DependancesSuiteSuppression = {
  setFenetreOuverte: (ouverte: boolean) => void;
  /** La fenêtre reste occupée jusqu'au changement de page. */
  marquerSupprimee: () => void;
  /** Toast de succès (5 s). */
  afficherSucces: (message: string) => void;
  /** Toast d'erreur (jusqu'à fermeture). */
  afficherErreur: (message: string) => void;
  /** Retour à la liste d'où l'on venait, puis liste recalculée. */
  retourner: () => void;
};

/**
 * Applique la suite d'une réponse :
 * - réussite : fenêtre gardée occupée, toast de succès, retour à la liste ;
 * - erreur : fenêtre fermée, toast d'erreur, la demande reste affichée ;
 * - rien : fenêtre fermée (la page recalculée affiche S2, ou le serveur a
 *   changé de page).
 */
export function appliquerSuiteSuppression(suite: SuiteSuppression, deps: DependancesSuiteSuppression): void {
  if (suite.type === "succes") {
    deps.marquerSupprimee();
    deps.afficherSucces(suite.message);
    deps.retourner();
    return;
  }
  deps.setFenetreOuverte(false);
  if (suite.type === "erreur") deps.afficherErreur(suite.message);
}

/** Ce que `dependancesSuiteSuppression` reçoit de la zone avec état. */
export type BranchementSuiteSuppression = {
  /** Le routeur de Next.js (`useRouter()`), ou un faux dans les essais. */
  router: { replace: (adresse: string) => void; refresh: () => void };
  /** Adresse de la liste d'où l'on venait. */
  retour: string;
  setFenetreOuverte: (ouverte: boolean) => void;
  setSupprimee: (supprimee: boolean) => void;
  /** Toasts : par défaut ceux de l'application. */
  afficherSucces?: (message: string) => void;
  afficherErreur?: (message: string) => void;
};

/**
 * Relie la suite d'une réponse à l'état de la zone, aux toasts et au
 * routeur : réussite → fenêtre gardée occupée (`setSupprimee(true)`), puis
 * `router.replace(retour)` et `router.refresh()`.
 */
export function dependancesSuiteSuppression({
  router,
  retour,
  setFenetreOuverte,
  setSupprimee,
  afficherSucces: succes = afficherSucces,
  afficherErreur: erreur = afficherErreur,
}: BranchementSuiteSuppression): DependancesSuiteSuppression {
  return {
    setFenetreOuverte,
    marquerSupprimee: () => setSupprimee(true),
    afficherSucces: succes,
    afficherErreur: erreur,
    retourner: () => {
      router.replace(retour);
      router.refresh();
    },
  };
}

/**
 * Ouverture ou fermeture demandée (« Supprimer la demande… », « Annuler »,
 * Échap) : ignorée pendant l'envoi (et après une réussite, jusqu'au
 * changement de page) ; sinon la fenêtre suit.
 */
export function changerOuvertureSuppression(
  ouvrir: boolean,
  envoiVerrouille: { current: boolean },
  setFenetreOuverte: (ouverte: boolean) => void,
): void {
  if (envoiVerrouille.current) return;
  setFenetreOuverte(ouvrir);
}

// ---------------------------------------------------------------------------
// Écran (sans état)
// ---------------------------------------------------------------------------

/** « Supprimer définitivement la demande NOVA-2026-0042 ? », la référence en chasse fixe. */
function TitreFenetreSupprimer({ reference }: { reference: string }) {
  const titre = MESSAGES_SUPPRESSION.fenetreTitre(reference);
  const position = titre.indexOf(reference);
  return (
    <>
      {titre.slice(0, position)}
      <span className="font-mono">{reference}</span>
      {titre.slice(position + reference.length)}
    </>
  );
}

export function VueSupprimerDemande({
  reference,
  envoiEnCours = false,
  fenetreOuverte = false,
  onOuverture,
  onSupprimer,
}: {
  reference: string;
  /** Envoi en cours (ou réussi, avant le changement de page) : indicateur, boutons désactivés. */
  envoiEnCours?: boolean;
  fenetreOuverte?: boolean;
  onOuverture?: (ouvrir: boolean) => void;
  onSupprimer?: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={MESSAGES_SUPPRESSION.zone}
      data-slot="zone-administrateur"
      className="mt-5 border-t pt-4"
    >
      <AlertDialog open={fenetreOuverte} onOpenChange={onOuverture}>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            data-slot="supprimer-demande"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-body-sm font-semibold text-danger hover:underline hover:underline-offset-2"
          >
            <Trash2 aria-hidden="true" className="size-4 shrink-0" />
            {MESSAGES_SUPPRESSION.bouton}
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent data-slot="fenetre-supprimer" aria-busy={envoiEnCours || undefined}>
          <span
            aria-hidden="true"
            data-slot="pastille-supprimer"
            className="mb-3.5 flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger"
          >
            <Trash2 className="size-5" />
          </span>
          <AlertDialogTitle>
            <TitreFenetreSupprimer reference={reference} />
          </AlertDialogTitle>
          <AlertDialogDescription>{MESSAGES_SUPPRESSION.fenetreTexte}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={envoiEnCours}>{MESSAGES_SUPPRESSION.annuler}</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              data-slot="confirmer-suppression"
              disabled={envoiEnCours}
              onClick={(evenement) => {
                // La fenêtre reste ouverte jusqu'à la réponse.
                evenement.preventDefault();
                onSupprimer?.();
              }}
            >
              {envoiEnCours ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
              {MESSAGES_SUPPRESSION.confirmer}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zone (avec état)
// ---------------------------------------------------------------------------

export function SupprimerDemande({
  reference,
  retour,
}: {
  reference: string;
  /** Adresse de la liste d'où l'on venait (même recherche, mêmes filtres, même page). */
  retour: string;
}) {
  const router = useRouter();
  const [envoiEnCours, demarrerEnvoi] = useTransition();
  const [fenetreOuverte, setFenetreOuverte] = useState(false);
  // Réussie : la fenêtre reste occupée jusqu'au changement de page.
  const [supprimee, setSupprimee] = useState(false);
  // Un second clic avant la réponse n'envoie rien.
  const envoiVerrouille = useRef(false);

  function supprimer() {
    if (envoiVerrouille.current) return;
    demarrerEnvoi(() =>
      envoyerSuppression({
        reference,
        supprimer: actionSupprimerDemande,
        envoiVerrouille,
        apresReponse: (suite) =>
          appliquerSuiteSuppression(
            suite,
            dependancesSuiteSuppression({ router, retour, setFenetreOuverte, setSupprimee }),
          ),
      }),
    );
  }

  return (
    <VueSupprimerDemande
      reference={reference}
      envoiEnCours={envoiEnCours || supprimee}
      fenetreOuverte={fenetreOuverte}
      onOuverture={(ouvrir) => changerOuvertureSuppression(ouvrir, envoiVerrouille, setFenetreOuverte)}
      onSupprimer={supprimer}
    />
  );
}

"use client";

import { CircleCheck, CirclePlay, Info, LoaderCircle, RotateCcw } from "lucide-react";
import { useRef, useState, useTransition, type ReactNode } from "react";

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
import { afficherErreur, afficherSucces } from "@/components/ui/sonner";
import { actionChangerStatut, type ChangementStatut } from "@/server/actions/changer-statut";
import { transitionsDepuis, type Statut, type StatutDemandable } from "@/shared/constantes";
import { libelleTransition } from "@/shared/libelles";
import { MESSAGES_STATUT } from "@/shared/messages";
import { echec, type Reponse } from "@/shared/reponse";

// Boutons du panneau « Statut » de l'écran I4 (EXPERIENCE.md, FR-16).
//
// - Seulement les passages permis depuis le statut affiché
//   (`TRANSITIONS_STATUT`, AD-5) ; jamais de retour à *Nouvelle*. Depuis
//   *Nouvelle* : « Passer En cours » (principal) et « Marquer Traitée »
//   (secondaire) ; depuis *En cours* : « Marquer Traitée » (principal) ;
//   depuis *Traitée* : « Rouvrir (En cours) » (secondaire), qui ouvre d'abord
//   la fenêtre de confirmation. Les autres passages n'en ont pas.
// - Effet immédiat : la Server Function change le statut et fait recalculer
//   la page (badge, historique, date de clôture, compteur).
// - Pendant l'action, le bouton cliqué montre un indicateur et tous les
//   boutons de statut sont désactivés : un second clic n'envoie rien (AD-20).
// - Après la réponse : toast « Statut mis à jour » (5 s) ; encadré « Cette
//   demande a été modifiée par … » si un collègue était passé avant ; toast
//   d'erreur « Le statut n'a pas pu être modifié. Réessayez. » (jusqu'à
//   fermeture) en cas de panne.
//
// `VueActionsStatut` est l'écran, sans état ; `ActionsStatut` le relie à la
// Server Function.

// ---------------------------------------------------------------------------
// Réponse
// ---------------------------------------------------------------------------

/** Ce que l'écran fait après la réponse de la Server Function. */
export type SuiteChangementStatut = {
  toast: { type: "succes" | "erreur"; message: string } | null;
  /** Texte de l'encadré d'information, ou `null` pour le retirer. */
  encadre: string | null;
};

/**
 * Suite à donner à une réponse. Les textes affichés sont ceux de l'UX, jamais
 * le message technique d'une erreur.
 *
 * - aucune réponse : le serveur a changé de page (session expirée) ;
 * - appliqué : toast de succès, et l'encadré si un collègue était passé avant ;
 * - conflit : l'encadré seul (rien n'a été écrit, l'affichage est à jour) ;
 * - introuvable : rien, la page recalculée affiche « demande introuvable » ;
 * - toute autre réponse : toast d'erreur.
 */
export function suiteApresReponse(reponse: Reponse<ChangementStatut> | undefined): SuiteChangementStatut {
  if (!reponse) return { toast: null, encadre: null };
  if (reponse.ok) {
    return { toast: { type: "succes", message: MESSAGES_STATUT.misAJour }, encadre: reponse.donnees.modifiee };
  }
  if (reponse.code === "CONFLIT") return { toast: null, encadre: reponse.message };
  if (reponse.code === "INTROUVABLE") return { toast: null, encadre: null };
  return { toast: { type: "erreur", message: MESSAGES_STATUT.echec }, encadre: null };
}

/** Ce dont l'envoi a besoin : passé en paramètre pour pouvoir être essayé seul. */
export type DependancesChangementStatut = {
  reference: string;
  statutVu: Statut;
  nouveauStatut: StatutDemandable;
  /** La Server Function (`actionChangerStatut`). */
  changer: (saisie: {
    reference: string;
    statutVu: Statut;
    nouveauStatut: StatutDemandable;
  }) => Promise<Reponse<ChangementStatut> | undefined>;
  /** Fermé pendant l'envoi : un second clic n'envoie rien (AD-20). */
  envoiVerrouille: { current: boolean };
  /** Affiche (texte) ou retire (`null`) l'encadré « modifiée par … ». */
  afficherEncadre: (texte: string | null) => void;
  /** Toast de succès (5 s). */
  afficherSucces: (message: string) => void;
  /** Toast d'erreur (jusqu'à fermeture). */
  afficherErreur: (message: string) => void;
};

/**
 * Envoie le changement et traite la réponse.
 *
 * - Verrou déjà fermé : rien n'est envoyé. Sinon il est fermé pendant
 *   l'envoi, puis rouvert quelle que soit la réponse.
 * - L'encadré est retiré au départ, puis remis selon la réponse.
 * - Un réseau coupé donne la même suite qu'une panne.
 */
export async function envoyerChangementStatut({
  reference,
  statutVu,
  nouveauStatut,
  changer,
  envoiVerrouille,
  afficherEncadre,
  afficherSucces,
  afficherErreur,
}: DependancesChangementStatut): Promise<void> {
  if (envoiVerrouille.current) return;
  envoiVerrouille.current = true;
  afficherEncadre(null);

  let reponse: Reponse<ChangementStatut> | undefined;
  try {
    reponse = await changer({ reference, statutVu, nouveauStatut });
  } catch {
    reponse = echec("ERREUR_INTERNE", MESSAGES_STATUT.echec);
  }

  const suite = suiteApresReponse(reponse);
  if (suite.toast?.type === "succes") afficherSucces(suite.toast.message);
  else if (suite.toast?.type === "erreur") afficherErreur(suite.toast.message);
  afficherEncadre(suite.encadre);
  envoiVerrouille.current = false;
}

// ---------------------------------------------------------------------------
// Écran (sans état)
// ---------------------------------------------------------------------------

function icone(depuis: Statut, vers: Statut): ReactNode {
  if (vers === "traitee") return <CircleCheck aria-hidden="true" />;
  if (depuis === "traitee") return <RotateCcw aria-hidden="true" />;
  return <CirclePlay aria-hidden="true" />;
}

/** « Rouvrir la demande NOVA-2026-0042 ? », la référence en chasse fixe. */
function TitreFenetreRouvrir({ reference }: { reference: string }) {
  const titre = MESSAGES_STATUT.fenetreRouvrirTitre(reference);
  const position = titre.indexOf(reference);
  return (
    <>
      {titre.slice(0, position)}
      <span className="font-mono">{reference}</span>
      {titre.slice(position + reference.length)}
    </>
  );
}

export function VueActionsStatut({
  reference,
  statut,
  cibleEnCours = null,
  encadre = null,
  fenetreOuverte,
  onChanger,
}: {
  reference: string;
  /** Statut affiché (celui que la personne a sous les yeux). */
  statut: Statut;
  /** Passage en cours d'envoi : son bouton montre l'indicateur, tous sont désactivés. */
  cibleEnCours?: Statut | null;
  /** Encadré « modifiée par … ». */
  encadre?: string | null;
  /** Fenêtre de réouverture ouverte au premier affichage (essais). */
  fenetreOuverte?: boolean;
  onChanger?: (vers: StatutDemandable) => void;
}) {
  const occupe = cibleEnCours !== null;

  return (
    <div data-slot="actions-statut" aria-busy={occupe || undefined}>
      {encadre ? (
        <Alert variant="information" data-slot="modifiee-entre-temps" className="mt-3">
          <AlertTitle>
            <Info aria-hidden="true" />
            {encadre}
          </AlertTitle>
        </Alert>
      ) : null}

      <div role="group" aria-label={MESSAGES_STATUT.actions} className="mt-3 flex flex-col gap-2.5">
        {transitionsDepuis(statut).map((vers, index) => {
          // Jamais proposé (TRANSITIONS_STATUT), et refusé par le serveur.
          if (vers === "nouvelle") return null;
          const reouverture = statut === "traitee";
          const bouton = (
            <Button
              key={vers}
              data-transition={vers}
              // Un seul bouton principal : le premier passage, sauf la
              // réouverture (toujours secondaire).
              variant={index === 0 && !reouverture ? "principal" : "secondaire"}
              disabled={occupe}
              className="w-full"
              onClick={reouverture ? undefined : () => onChanger?.(vers)}
            >
              {cibleEnCours === vers ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                icone(statut, vers)
              )}
              {libelleTransition(statut, vers)}
            </Button>
          );
          if (!reouverture) return bouton;

          return (
            <AlertDialog key={vers} defaultOpen={fenetreOuverte}>
              <AlertDialogTrigger asChild>{bouton}</AlertDialogTrigger>
              <AlertDialogContent data-slot="fenetre-rouvrir">
                <AlertDialogTitle>
                  <TitreFenetreRouvrir reference={reference} />
                </AlertDialogTitle>
                <AlertDialogDescription>{MESSAGES_STATUT.fenetreRouvrirTexte}</AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogCancel>{MESSAGES_STATUT.annuler}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onChanger?.(vers)}>
                    {MESSAGES_STATUT.confirmerRouvrir}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Boutons (avec état)
// ---------------------------------------------------------------------------

export function ActionsStatut({ reference, statut }: { reference: string; statut: Statut }) {
  const [envoiEnCours, demarrerEnvoi] = useTransition();
  const [cible, setCible] = useState<StatutDemandable | null>(null);
  const [encadre, setEncadre] = useState<string | null>(null);
  // Un second clic avant la réponse n'envoie rien.
  const envoiVerrouille = useRef(false);

  function changer(vers: StatutDemandable) {
    // Le verrou est géré par `envoyerChangementStatut` ; ce test évite
    // seulement de déplacer l'indicateur vers un bouton cliqué en second.
    if (envoiVerrouille.current) return;
    // Hors de la transition, pour que l'indicateur s'affiche aussitôt.
    setCible(vers);
    demarrerEnvoi(() =>
      envoyerChangementStatut({
        reference,
        statutVu: statut,
        nouveauStatut: vers,
        changer: actionChangerStatut,
        envoiVerrouille,
        afficherEncadre: setEncadre,
        afficherSucces,
        afficherErreur,
      }),
    );
  }

  return (
    <VueActionsStatut
      reference={reference}
      statut={statut}
      cibleEnCours={envoiEnCours ? cible : null}
      encadre={encadre}
      onChanger={changer}
    />
  );
}

"use client";

import { CircleAlert, LoaderCircle, UserCheck, UserX } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type Ref } from "react";

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
import { actionChangerEtatCompte } from "@/server/actions/changer-etat-compte";
import type { EtatCompteModifie } from "@/server/admin";
import { MESSAGES_ACCES_REFUSE, MESSAGES_COMPTE, MESSAGES_COMPTES } from "@/shared/messages";
import { echec, type Reponse } from "@/shared/reponse";

// « Désactiver » et « Réactiver » de la colonne Actions de l'écran A1
// (story 3.4 ; EXPERIENCE.md, A1 ; FR-22, FR-25, RM-9, RM-10).
//
// - Compte actif : « Désactiver » ouvre la fenêtre de confirmation
//   « Désactiver le compte de Lucas Bernard ? » (« Lucas ne pourra plus se
//   connecter… »), avec « Annuler » (sélectionné à l'ouverture, Échap
//   ferme) et « Désactiver » (bouton principal : le bouton danger est
//   réservé aux suppressions). Le refus du dernier administrateur et les
//   pannes s'affichent dans la fenêtre, qui reste ouverte ; la réussite la
//   ferme, avec le toast « Compte désactivé ».
// - Compte désactivé : « Réactiver » agit d'un clic, sans fenêtre (décision
//   d'Aurel, 25 nov. 2026), avec l'indicateur « Réactivation… » sur le
//   bouton ; toast « Compte réactivé », ou toast d'erreur (jusqu'à
//   fermeture) pour un refus ou une panne.
// - Pendant l'envoi, le bouton montre son indicateur et un second clic
//   n'envoie rien (AD-20). La fenêtre ne se ferme pas pendant l'envoi.
// - Le tableau se met à jour par `refresh()` dans la Server Function :
//   badge *Désactivé* et bouton « Réactiver », ou l'inverse.
//
// `suiteApresReponseEtat` et `envoyerEtatCompte` sont exportées et essayées
// seules ; `VueEtatCompte` est l'écran, sans état ; `EtatCompte` relie les
// deux à la Server Function.

/** Ce que la ligne montre d'un compte. */
export type CompteLigne = { id: string; nom: string; actif: boolean };

// ---------------------------------------------------------------------------
// Réponse
// ---------------------------------------------------------------------------

/** Premier mot du nom (« Lucas » pour « Lucas Bernard »), pour le texte de la fenêtre. */
export function premierMot(nom: string): string {
  return nom.trim().split(/\s+/)[0] ?? "";
}

/** Ce que l'écran fait après la réponse de la Server Function. */
export type SuiteEtatCompte =
  /** Le serveur a changé de page (son propre compte désactivé, session finie). */
  | { type: "rien" }
  | { type: "succes"; message: string }
  | { type: "erreur"; message: string };

/**
 * Suite à donner à une réponse, pour une désactivation (`actif` voulu faux)
 * ou une réactivation (vrai). Les textes affichés sont ceux de l'UX, jamais
 * un message technique :
 * - aucune réponse : le serveur a changé de page ;
 * - réussite : « Compte désactivé » ou « Compte réactivé » ;
 * - dernier administrateur : le message exact ;
 * - accès refusé : « Accès refusé. » ;
 * - toute autre réponse : « Le compte n'a pas pu être désactivé. Réessayez. »
 *   (ou « réactivé »).
 */
export function suiteApresReponseEtat(
  reponse: Reponse<EtatCompteModifie> | undefined,
  actifVoulu: boolean,
): SuiteEtatCompte {
  const textes = MESSAGES_COMPTES.etat;
  if (!reponse) return { type: "rien" };
  if (reponse.ok) {
    return { type: "succes", message: actifVoulu ? textes.compteReactive : textes.compteDesactive };
  }
  if (reponse.code === "CONFLIT") return { type: "erreur", message: MESSAGES_COMPTE.dernierAdministrateur };
  if (reponse.code === "ACCES_REFUSE") return { type: "erreur", message: MESSAGES_ACCES_REFUSE.action };
  return {
    type: "erreur",
    message: actifVoulu ? MESSAGES_COMPTE.reactivationImpossible : MESSAGES_COMPTE.desactivationImpossible,
  };
}

/** Ce dont l'envoi a besoin : passé en paramètre pour pouvoir être essayé seul. */
export type DependancesEtatCompte = {
  compteId: string;
  /** Faux : désactiver ; vrai : réactiver. */
  actif: boolean;
  /** La Server Function (`actionChangerEtatCompte`). */
  changer: (saisie: { compteId: string; actif: boolean }) => Promise<Reponse<EtatCompteModifie> | undefined>;
  /** Fermé pendant l'envoi : un second clic n'envoie rien (AD-20). */
  envoiVerrouille: { current: boolean };
  /** Reçoit la suite (toast, message dans la fenêtre, fermeture). */
  apresReponse: (suite: SuiteEtatCompte) => void;
};

/**
 * Envoie la désactivation ou la réactivation et traite la réponse.
 *
 * - Verrou déjà fermé : rien n'est envoyé. Sinon il est fermé pendant
 *   l'envoi, puis rouvert quelle que soit la réponse.
 * - Un réseau coupé donne la même suite qu'une panne.
 * - Une redirection du serveur (son propre compte désactivé, session
 *   terminée par la garde) est relancée pour que Next.js change de page :
 *   le verrou est rouvert, aucune suite n'est donnée.
 */
export async function envoyerEtatCompte({
  compteId,
  actif,
  changer,
  envoiVerrouille,
  apresReponse,
}: DependancesEtatCompte): Promise<void> {
  if (envoiVerrouille.current) return;
  envoiVerrouille.current = true;

  let reponse: Reponse<EtatCompteModifie> | undefined;
  try {
    reponse = await changer({ compteId, actif });
  } catch (erreur) {
    try {
      unstable_rethrow(erreur);
    } catch (redirection) {
      envoiVerrouille.current = false;
      throw redirection;
    }
    reponse = echec(
      "ERREUR_INTERNE",
      actif ? MESSAGES_COMPTE.reactivationImpossible : MESSAGES_COMPTE.desactivationImpossible,
    );
  }

  envoiVerrouille.current = false;
  apresReponse(suiteApresReponseEtat(reponse, actif));
}

// ---------------------------------------------------------------------------
// Écran (sans état)
// ---------------------------------------------------------------------------

const textes = MESSAGES_COMPTES.etat;

/** Message du refus ou de la panne, dans la fenêtre. */
function EncadreRefus({ message }: { message: string }) {
  return (
    <Alert variant="erreur" data-slot="refus-desactivation" className="mb-5">
      <AlertTitle>
        <CircleAlert aria-hidden="true" />
        {message}
      </AlertTitle>
    </Alert>
  );
}

export function VueEtatCompte({
  compte,
  envoiEnCours = false,
  fenetreOuverte = false,
  erreur = null,
  refBouton,
  onOuverture,
  onDesactiver,
  onReactiver,
}: {
  compte: CompteLigne;
  /** Envoi en cours : indicateur sur le bouton concerné, boutons désactivés. */
  envoiEnCours?: boolean;
  /** Fenêtre « Désactiver » ouverte (compte actif seulement). */
  fenetreOuverte?: boolean;
  /** Refus ou panne affiché dans la fenêtre. */
  erreur?: string | null;
  /** Bouton de la ligne, pour lui rendre la sélection après un changement. */
  refBouton?: Ref<HTMLButtonElement>;
  onOuverture?: (ouvrir: boolean) => void;
  onDesactiver?: () => void;
  onReactiver?: () => void;
}) {
  if (!compte.actif) {
    return (
      <Button
        ref={refBouton}
        variant="secondaire"
        size="sm"
        data-slot="reactiver"
        aria-label={envoiEnCours ? undefined : textes.reactiverNom(compte.nom)}
        disabled={envoiEnCours}
        onClick={onReactiver}
      >
        {envoiEnCours ? (
          <>
            <LoaderCircle aria-hidden="true" className="animate-spin" />
            {textes.reactivationEnCours}
          </>
        ) : (
          <>
            <UserCheck aria-hidden="true" />
            {textes.reactiver}
          </>
        )}
      </Button>
    );
  }

  return (
    <AlertDialog open={fenetreOuverte} onOpenChange={onOuverture}>
      <AlertDialogTrigger asChild>
        <Button
          ref={refBouton}
          variant="secondaire"
          size="sm"
          data-slot="desactiver"
          aria-label={textes.desactiverNom(compte.nom)}
        >
          <UserX aria-hidden="true" />
          {textes.desactiver}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent data-slot="fenetre-desactiver" aria-busy={envoiEnCours || undefined}>
        <AlertDialogTitle>{textes.fenetreTitre(compte.nom)}</AlertDialogTitle>
        <AlertDialogDescription>{textes.fenetreTexte(premierMot(compte.nom))}</AlertDialogDescription>
        {erreur ? <EncadreRefus message={erreur} /> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={envoiEnCours}>{textes.annuler}</AlertDialogCancel>
          <AlertDialogAction
            data-slot="confirmer-desactivation"
            disabled={envoiEnCours}
            onClick={(evenement) => {
              // La fenêtre reste ouverte jusqu'à la réponse : un refus s'y affiche.
              evenement.preventDefault();
              onDesactiver?.();
            }}
          >
            {envoiEnCours ? (
              <>
                <LoaderCircle aria-hidden="true" className="animate-spin" />
                {textes.desactivationEnCours}
              </>
            ) : (
              textes.desactiver
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

/** Ce que la ligne fait de la suite d'une réponse : passé en paramètre pour être essayé seul. */
export type DependancesSuiteEtat = {
  setFenetreOuverte: (ouverte: boolean) => void;
  /** Refus ou panne affiché dans la fenêtre (désactivation). */
  setErreur: (message: string | null) => void;
  /** Toast de succès (5 s). */
  afficherSucces: (message: string) => void;
  /** Toast d'erreur (jusqu'à fermeture), pour la réactivation. */
  afficherErreur: (message: string) => void;
  /** Le bouton de la ligne recevra la sélection après la mise à jour du tableau. */
  rendreSelection: { current: boolean };
};

/**
 * Applique la suite d'une désactivation (`actif` faux) ou d'une
 * réactivation (vrai) :
 * - réussite : fenêtre fermée, toast de succès, sélection rendue au bouton ;
 * - erreur d'une désactivation : message dans la fenêtre, qui reste ouverte ;
 * - erreur d'une réactivation : toast d'erreur ;
 * - rien (le serveur a changé de page) : rien.
 */
export function appliquerSuiteEtat(suite: SuiteEtatCompte, actif: boolean, deps: DependancesSuiteEtat): void {
  if (suite.type === "succes") {
    deps.rendreSelection.current = true;
    deps.setFenetreOuverte(false);
    deps.afficherSucces(suite.message);
  } else if (suite.type === "erreur") {
    if (actif) deps.afficherErreur(suite.message);
    else deps.setErreur(suite.message);
  }
}

/**
 * Ouverture ou fermeture demandée (« Désactiver », « Annuler », Échap) :
 * une fermeture pendant l'envoi est ignorée (la réponse doit pouvoir
 * s'afficher) ; sinon le message d'erreur est retiré et la fenêtre suit.
 */
export function changerOuvertureEtat(
  ouvrir: boolean,
  envoiVerrouille: { current: boolean },
  deps: Pick<DependancesSuiteEtat, "setFenetreOuverte" | "setErreur">,
): void {
  if (!ouvrir && envoiVerrouille.current) return;
  deps.setErreur(null);
  deps.setFenetreOuverte(ouvrir);
}

export function EtatCompte({ compte }: { compte: CompteLigne }) {
  const [envoiEnCours, demarrerEnvoi] = useTransition();
  const [fenetreOuverte, setFenetreOuverte] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Un second clic avant la réponse n'envoie rien.
  const envoiVerrouille = useRef(false);
  const refBouton = useRef<HTMLButtonElement>(null);
  // Après un changement réussi, le bouton de la ligne change (« Désactiver »
  // ↔ « Réactiver ») : la sélection lui est rendue.
  const rendreSelection = useRef(false);

  useEffect(() => {
    if (rendreSelection.current) {
      rendreSelection.current = false;
      refBouton.current?.focus();
    }
  }, [compte.actif]);

  function changerOuverture(ouvrir: boolean) {
    changerOuvertureEtat(ouvrir, envoiVerrouille, { setFenetreOuverte, setErreur });
  }

  function envoyer(actif: boolean) {
    if (envoiVerrouille.current) return;
    setErreur(null);
    demarrerEnvoi(() =>
      envoyerEtatCompte({
        compteId: compte.id,
        actif,
        changer: actionChangerEtatCompte,
        envoiVerrouille,
        apresReponse: (suite) =>
          appliquerSuiteEtat(suite, actif, {
            setFenetreOuverte,
            setErreur,
            afficherSucces,
            afficherErreur,
            rendreSelection,
          }),
      }),
    );
  }

  return (
    <VueEtatCompte
      compte={compte}
      envoiEnCours={envoiEnCours}
      fenetreOuverte={fenetreOuverte}
      erreur={erreur}
      refBouton={refBouton}
      onOuverture={changerOuverture}
      onDesactiver={() => envoyer(false)}
      onReactiver={() => envoyer(true)}
    />
  );
}

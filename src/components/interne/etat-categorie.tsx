"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useEffect, useRef, useTransition, type Ref } from "react";

import { Button } from "@/components/ui/button";
import { afficherErreur, afficherSucces } from "@/components/ui/sonner";
import { actionChangerEtatCategorie, type EtatCategorieModifie } from "@/server/actions/changer-etat-categorie";
import { MESSAGES_ACCES_REFUSE, MESSAGES_CATEGORIES } from "@/shared/messages";
import { echec, type Echec, type Reponse } from "@/shared/reponse";

// « Désactiver » et « Réactiver » de la colonne Actions de l'écran A2
// (story 4.2 ; EXPERIENCE.md, A2 ; FR-26, RM-11).
//
// - Catégorie active : « Désactiver » ; désactivée : « Réactiver ». D'un
//   seul clic, sans fenêtre (décision d'Aurel, 26 nov. 2026), avec
//   l'indicateur « Désactivation… » ou « Réactivation… » sur le bouton.
// - Le bouton reste visible pour la dernière catégorie active : la base
//   refuse, et le toast d'erreur affiche le message exact.
// - Réussite : toast « Catégorie désactivée » ou « Catégorie réactivée ».
//   Déjà dans l'état voulu (un autre administrateur l'a fait) : pas de
//   toast, la liste recalculée montre l'état réel.
// - Refus ou panne : toast d'erreur, qui reste jusqu'à fermeture.
//   Catégorie supprimée entre-temps : rien, la ligne disparaît.
// - Pendant l'envoi, un second clic n'envoie rien (AD-20).
// - La liste se met à jour par `refresh()` dans la Server Function : badge
//   *Désactivée* et « Réactiver », ou l'inverse. Après toute réponse
//   (réussite, refus, panne), la sélection est rendue au bouton.
//
// `suiteApresReponseEtatCategorie`, `envoyerEtatCategorie` et
// `appliquerSuiteEtatCategorie` sont exportées et essayées seules ;
// `VueEtatCategorie` est le bouton, sans état ; `EtatCategorie` relie les
// deux à la Server Function.

/** Ce que le bouton montre de la catégorie. */
export type CategorieEtat = { id: string; nom: string; active: boolean };

// ---------------------------------------------------------------------------
// Réponse
// ---------------------------------------------------------------------------

/** Messages de refus que le serveur peut renvoyer avec `CONFLIT` (textes exacts de l'UX). */
const REFUS_CATEGORIE: readonly string[] = [
  MESSAGES_CATEGORIES.derniereActive,
  MESSAGES_CATEGORIES.nomDejaPris,
  MESSAGES_CATEGORIES.categorieUtilisee,
];

/**
 * Texte à afficher pour un échec de désactivation, de réactivation ou de
 * suppression : le message exact d'un refus prévu (`CONFLIT`), « Accès
 * refusé. », ou la panne. Jamais un message technique.
 */
export function messageEchecCategorie(reponse: Echec): string {
  if (reponse.code === "CONFLIT" && REFUS_CATEGORIE.includes(reponse.message)) return reponse.message;
  if (reponse.code === "ACCES_REFUSE") return MESSAGES_ACCES_REFUSE.action;
  return MESSAGES_CATEGORIES.modificationImpossible;
}

/** Ce que le bouton fait après la réponse de la Server Function. */
export type SuiteEtatCategorie =
  /** Rien à annoncer : le serveur a changé de page, ou la liste recalculée suffit. */
  | { type: "rien" }
  | { type: "succes"; message: string }
  | { type: "erreur"; message: string };

/**
 * Suite à donner à une réponse, pour une désactivation (`active` voulu
 * faux) ou une réactivation (vrai) :
 * - aucune réponse : le serveur a changé de page ;
 * - changée : « Catégorie désactivée » ou « Catégorie réactivée » ;
 * - déjà dans l'état voulu, ou catégorie supprimée entre-temps : rien (la
 *   liste recalculée montre l'état réel) ;
 * - dernière catégorie active, nom déjà pris : le message exact ;
 * - accès refusé : « Accès refusé. » ;
 * - toute autre réponse : « La catégorie n'a pas pu être modifiée. Réessayez. ».
 */
export function suiteApresReponseEtatCategorie(
  reponse: Reponse<EtatCategorieModifie> | undefined,
  activeVoulue: boolean,
): SuiteEtatCategorie {
  if (!reponse) return { type: "rien" };
  if (reponse.ok) {
    if (!reponse.donnees.change) return { type: "rien" };
    return {
      type: "succes",
      message: activeVoulue ? MESSAGES_CATEGORIES.categorieReactivee : MESSAGES_CATEGORIES.categorieDesactivee,
    };
  }
  if (reponse.code === "INTROUVABLE") return { type: "rien" };
  return { type: "erreur", message: messageEchecCategorie(reponse) };
}

/** Ce dont l'envoi a besoin : passé en paramètre pour pouvoir être essayé seul. */
export type DependancesEtatCategorie = {
  categorieId: string;
  /** Faux : désactiver ; vrai : réactiver. */
  active: boolean;
  /** La Server Function (`actionChangerEtatCategorie`). */
  changer: (saisie: { categorieId: string; active: boolean }) => Promise<Reponse<EtatCategorieModifie> | undefined>;
  /** Fermé pendant l'envoi : un second clic n'envoie rien (AD-20). */
  envoiVerrouille: { current: boolean };
  /** Reçoit la suite (toast). */
  apresReponse: (suite: SuiteEtatCategorie) => void;
};

/**
 * Envoie la désactivation ou la réactivation et traite la réponse.
 *
 * - Verrou déjà fermé : rien n'est envoyé. Sinon il est fermé pendant
 *   l'envoi, puis rouvert quelle que soit la réponse.
 * - Un réseau coupé donne la même suite qu'une panne.
 * - Une redirection du serveur (session terminée par la garde) est relancée
 *   pour que Next.js change de page : le verrou est rouvert, aucune suite
 *   n'est donnée.
 */
export async function envoyerEtatCategorie({
  categorieId,
  active,
  changer,
  envoiVerrouille,
  apresReponse,
}: DependancesEtatCategorie): Promise<void> {
  if (envoiVerrouille.current) return;
  envoiVerrouille.current = true;

  let reponse: Reponse<EtatCategorieModifie> | undefined;
  try {
    reponse = await changer({ categorieId, active });
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
  apresReponse(suiteApresReponseEtatCategorie(reponse, active));
}

/** Ce que le bouton fait de la suite d'une réponse : passé en paramètre pour être essayé seul. */
export type DependancesSuiteEtatCategorie = {
  /** Toast de succès (5 s). */
  afficherSucces: (message: string) => void;
  /** Toast d'erreur (jusqu'à fermeture). */
  afficherErreur: (message: string) => void;
  /** Le bouton recevra la sélection à la fin de l'envoi. */
  rendreSelection: { current: boolean };
};

/**
 * Applique la suite d'une réponse. Quelle qu'elle soit, la sélection est
 * rendue au bouton à la fin de l'envoi (il était inactif pendant l'envoi,
 * et il a pu devenir « Réactiver » ou « Désactiver ») :
 * - réussite : toast de succès ;
 * - erreur : toast d'erreur ;
 * - rien : pas de toast.
 */
export function appliquerSuiteEtatCategorie(suite: SuiteEtatCategorie, deps: DependancesSuiteEtatCategorie): void {
  deps.rendreSelection.current = true;
  if (suite.type === "succes") deps.afficherSucces(suite.message);
  else if (suite.type === "erreur") deps.afficherErreur(suite.message);
}

// ---------------------------------------------------------------------------
// Bouton (sans état)
// ---------------------------------------------------------------------------

export function VueEtatCategorie({
  categorie,
  envoiEnCours = false,
  refBouton,
  onBasculer,
}: {
  categorie: CategorieEtat;
  /** Envoi en cours : indicateur sur le bouton, bouton inactif. */
  envoiEnCours?: boolean;
  /** Le bouton, pour lui rendre la sélection après un changement. */
  refBouton?: Ref<HTMLButtonElement>;
  onBasculer?: () => void;
}) {
  const desactiver = categorie.active;
  const libelle = desactiver ? MESSAGES_CATEGORIES.desactiver : MESSAGES_CATEGORIES.reactiver;
  const enCours = desactiver ? MESSAGES_CATEGORIES.desactivationEnCours : MESSAGES_CATEGORIES.reactivationEnCours;
  const nom = desactiver ? MESSAGES_CATEGORIES.desactiverNom(categorie.nom) : MESSAGES_CATEGORIES.reactiverNom(categorie.nom);

  return (
    <Button
      ref={refBouton}
      type="button"
      variant="secondaire"
      size="sm"
      data-slot={desactiver ? "desactiver-categorie" : "reactiver-categorie"}
      // Pendant l'envoi, le texte visible (« Désactivation… ») est lu tel quel.
      aria-label={envoiEnCours ? undefined : nom}
      disabled={envoiEnCours}
      aria-busy={envoiEnCours || undefined}
      onClick={onBasculer}
    >
      {envoiEnCours ? (
        <>
          <LoaderCircle aria-hidden="true" className="animate-spin" />
          {enCours}
        </>
      ) : (
        <>
          {desactiver ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          {libelle}
        </>
      )}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Bouton (avec état)
// ---------------------------------------------------------------------------

export function EtatCategorie({ categorie }: { categorie: CategorieEtat }) {
  const [envoiEnCours, demarrerEnvoi] = useTransition();
  // Un second clic avant la réponse n'envoie rien.
  const envoiVerrouille = useRef(false);
  const refBouton = useRef<HTMLButtonElement>(null);
  // Le bouton a été inactif pendant l'envoi (et a pu changer : « Désactiver »
  // ↔ « Réactiver ») : après toute réponse, la sélection lui est rendue, une
  // fois l'envoi terminé et la liste recalculée.
  const rendreSelection = useRef(false);

  useEffect(() => {
    if (envoiEnCours || !rendreSelection.current) return;
    rendreSelection.current = false;
    refBouton.current?.focus();
  }, [categorie.active, envoiEnCours]);

  function basculer() {
    if (envoiVerrouille.current) return;
    const active = !categorie.active;
    demarrerEnvoi(() =>
      envoyerEtatCategorie({
        categorieId: categorie.id,
        active,
        changer: actionChangerEtatCategorie,
        envoiVerrouille,
        apresReponse: (suite) => appliquerSuiteEtatCategorie(suite, { afficherSucces, afficherErreur, rendreSelection }),
      }),
    );
  }

  return (
    <VueEtatCategorie categorie={categorie} envoiEnCours={envoiEnCours} refBouton={refBouton} onBasculer={basculer} />
  );
}

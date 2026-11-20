"use client";

import { CircleAlert, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef, useTransition, type FormEvent, type Ref } from "react";
import { toast } from "sonner";

import { Champ } from "@/components/formulaire/champ";
import { ResumeErreurs } from "@/components/formulaire/resume-erreurs";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actionChoisirMotDePasse } from "@/server/actions/choisir-mot-de-passe";
import { ADRESSE_ACCUEIL_INTERNE } from "@/shared/acces";
import { MESSAGES_MOT_DE_PASSE } from "@/shared/messages";
import { echec, type ErreursChamps, type Reponse } from "@/shared/reponse";
import {
  CHAMPS_MOT_DE_PASSE,
  erreurDuChampMotDePasse,
  validerMotDePasse,
  VALEURS_MOT_DE_PASSE_VIDES,
  type ChampMotDePasse,
  type ValeursMotDePasse,
} from "@/shared/schemas/mot-de-passe";

// Formulaire de l'écran I2 (EXPERIENCE.md) : choisir son mot de passe.
//
// - `reduireMotDePasse` : ce qui change à chaque geste (saisie, envoi
//   refusé, échec, réussite). Après **toute** erreur, les deux champs sont
//   vidés, par sécurité (EXPERIENCE.md).
// - `VueFormulaireMotDePasse` : l'écran, sans état.
// - `FormulaireMotDePasse` : relie les deux et appelle la Server Function ;
//   à la réussite, toast « Mot de passe enregistré » puis passage à
//   « Demandes » sans rechargement (le toast reste à l'écran).
//
// Les champs sont contrôlés et l'envoi passe par `onSubmit`, comme pour la
// connexion I1.

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export type EtatMotDePasse = {
  valeurs: ValeursMotDePasse;
  /** Message affiché sous chaque champ en erreur. */
  erreurs: ErreursChamps;
  /** Le résumé du haut apparaît après un envoi refusé, pas avant. */
  resumeVisible: boolean;
  /** Erreur technique, en haut du formulaire. */
  message: string | null;
  /** Mot de passe enregistré (ou renvoi par le serveur) : formulaire figé. */
  redirection: boolean;
  /** Augmente chaque fois que le résumé d'erreurs doit recevoir la sélection. */
  appelsResume: number;
  /** Augmente chaque fois que le premier champ doit recevoir la sélection. */
  appelsPremierChamp: number;
};

export type ActionMotDePasse =
  | { type: "saisie"; champ: ChampMotDePasse; valeur: string }
  | { type: "envoi" }
  | { type: "refus"; champs: ErreursChamps }
  | { type: "echec"; message: string }
  | { type: "reussite" }
  | { type: "renvoi" };

export const ETAT_MOT_DE_PASSE_INITIAL: EtatMotDePasse = {
  valeurs: VALEURS_MOT_DE_PASSE_VIDES,
  erreurs: {},
  resumeVisible: false,
  message: null,
  redirection: false,
  appelsResume: 0,
  appelsPremierChamp: 0,
};

function avecErreur(
  erreurs: ErreursChamps,
  champ: ChampMotDePasse,
  message: string | undefined,
): ErreursChamps {
  const suivantes = { ...erreurs };
  if (message) suivantes[champ] = message;
  else delete suivantes[champ];
  return suivantes;
}

export function reduireMotDePasse(etat: EtatMotDePasse, action: ActionMotDePasse): EtatMotDePasse {
  switch (action.type) {
    case "saisie": {
      const valeurs = { ...etat.valeurs, [action.champ]: action.valeur };
      // Un message d'erreur disparaît dès que le champ est corrigé.
      let erreurs = etat.erreurs[action.champ]
        ? avecErreur(etat.erreurs, action.champ, erreurDuChampMotDePasse(action.champ, valeurs))
        : etat.erreurs;
      // La confirmation dépend aussi du premier champ : son message est revu
      // quand celui-ci change.
      if (action.champ === "motDePasse" && erreurs.confirmation) {
        erreurs = avecErreur(erreurs, "confirmation", erreurDuChampMotDePasse("confirmation", valeurs));
      }
      return {
        ...etat,
        valeurs,
        erreurs,
        resumeVisible: etat.resumeVisible && Object.keys(erreurs).length > 0,
      };
    }
    case "envoi":
      return { ...etat, message: null };
    case "refus":
      // Saisie refusée (ici ou par le serveur) : champs vidés, messages sous
      // les champs.
      return {
        ...etat,
        valeurs: VALEURS_MOT_DE_PASSE_VIDES,
        erreurs: action.champs,
        resumeVisible: true,
        message: null,
        appelsResume: etat.appelsResume + 1,
      };
    case "echec":
      // Erreur technique : champs vidés, message en haut.
      return {
        ...etat,
        valeurs: VALEURS_MOT_DE_PASSE_VIDES,
        erreurs: {},
        resumeVisible: false,
        message: action.message,
        appelsPremierChamp: etat.appelsPremierChamp + 1,
      };
    case "reussite":
    case "renvoi":
      return { ...etat, message: null, redirection: true };
  }
}

/**
 * Ce que le formulaire fait de la réponse de la Server Function. Les textes
 * affichés sont ceux de l'UX, jamais le message technique de la réponse.
 *
 * - aucune réponse : le serveur a changé de page (session expirée, mot de
 *   passe déjà choisi) ; le formulaire reste figé, sans toast ;
 * - réussite : toast et passage à « Demandes » ;
 * - saisie refusée avec ses champs : messages sous les champs ;
 * - toute autre réponse : « Votre mot de passe n'a pas pu être enregistré.
 *   Réessayez. »
 */
export function actionApresReponse(reponse: Reponse<unknown> | undefined): ActionMotDePasse {
  if (!reponse) return { type: "renvoi" };
  if (reponse.ok) return { type: "reussite" };
  if (reponse.code === "VALIDATION" && reponse.champs && Object.keys(reponse.champs).length > 0) {
    return { type: "refus", champs: reponse.champs };
  }
  return { type: "echec", message: MESSAGES_MOT_DE_PASSE.enregistrementImpossible };
}

/** Ce dont l'envoi a besoin : passé en paramètre pour pouvoir être essayé seul. */
export type DependancesEnvoiMotDePasse = {
  /** Saisie déjà vérifiée par le navigateur. */
  valeurs: ValeursMotDePasse;
  /** La Server Function (`actionChoisirMotDePasse`). */
  choisir: (valeurs: ValeursMotDePasse) => Promise<Reponse<unknown> | undefined>;
  agir: (action: ActionMotDePasse) => void;
  /** Toast et passage à « Demandes ». */
  apresReussite: () => void;
  /** Fermé pendant l'envoi : un second clic ne lance pas un second envoi. */
  envoiVerrouille: { current: boolean };
};

/**
 * Envoie le mot de passe et traite la réponse. Le verrou doit déjà être
 * fermé et l'action « envoi » appliquée. Après une erreur, le verrou est
 * rouvert ; après une réussite ou un renvoi, il reste fermé jusqu'au
 * changement de page.
 */
export async function envoyerMotDePasse({
  valeurs,
  choisir,
  agir,
  apresReussite,
  envoiVerrouille,
}: DependancesEnvoiMotDePasse): Promise<void> {
  let reponse: Reponse<unknown> | undefined;
  try {
    reponse = await choisir(valeurs);
  } catch {
    // Réseau coupé ou serveur injoignable : même message qu'une panne.
    reponse = echec("ERREUR_INTERNE", MESSAGES_MOT_DE_PASSE.enregistrementImpossible);
  }

  const suite = actionApresReponse(reponse);
  agir(suite);
  if (suite.type === "reussite") apresReussite();
  else if (suite.type !== "renvoi") envoiVerrouille.current = false;
}

// ---------------------------------------------------------------------------
// Écran (sans état)
// ---------------------------------------------------------------------------

const ORDRE_CHAMPS: readonly string[] = CHAMPS_MOT_DE_PASSE;

export function VueFormulaireMotDePasse({
  etat,
  envoiEnCours: envoiDemande = false,
  refResume,
  refPremierChamp,
  onSaisie,
  onEnvoi,
}: {
  etat: EtatMotDePasse;
  envoiEnCours?: boolean;
  /** Résumé d'erreurs, pour lui donner la sélection après un envoi refusé. */
  refResume?: Ref<HTMLDivElement>;
  /** Premier champ, pour lui donner la sélection après une erreur technique. */
  refPremierChamp?: Ref<HTMLInputElement>;
  onSaisie?: (champ: ChampMotDePasse, valeur: string) => void;
  onEnvoi?: (evenement: FormEvent<HTMLFormElement>) => void;
}) {
  const { valeurs, erreurs } = etat;
  // Après une réussite, le formulaire reste dans l'état « envoi » jusqu'au
  // changement de page.
  const envoiEnCours = envoiDemande || etat.redirection;
  const erreursListees = Object.entries(erreurs)
    .sort(([a], [b]) => ORDRE_CHAMPS.indexOf(a) - ORDRE_CHAMPS.indexOf(b))
    .map(([champ, message]) => ({ champ, message }));

  return (
    <form
      noValidate // Les messages sont ceux de l'UX, pas ceux du navigateur.
      onSubmit={onEnvoi}
      aria-busy={envoiEnCours || undefined}
      className="flex flex-col"
    >
      {etat.message ? (
        <Alert variant="erreur" data-slot="echec-mot-de-passe" className="mb-5">
          <AlertTitle>
            <CircleAlert aria-hidden="true" />
            {etat.message}
          </AlertTitle>
        </Alert>
      ) : etat.resumeVisible ? (
        <ResumeErreurs ref={refResume} erreurs={erreursListees} className="mb-5" />
      ) : null}

      <fieldset disabled={envoiEnCours} className="mb-6 flex min-w-0 flex-col gap-4">
        <Champ
          id="motDePasse"
          etiquette={MESSAGES_MOT_DE_PASSE.nouveauMotDePasse}
          aide={MESSAGES_MOT_DE_PASSE.regle}
          erreur={erreurs.motDePasse}
        >
          <Input
            ref={refPremierChamp}
            name="motDePasse"
            type="password"
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
            // Curseur dans le premier champ à l'arrivée (EXPERIENCE.md, I2).
            autoFocus
            value={valeurs.motDePasse}
            onChange={(e) => onSaisie?.("motDePasse", e.target.value)}
          />
        </Champ>
        <Champ id="confirmation" etiquette={MESSAGES_MOT_DE_PASSE.confirmer} erreur={erreurs.confirmation}>
          <Input
            name="confirmation"
            type="password"
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
            value={valeurs.confirmation}
            onChange={(e) => onSaisie?.("confirmation", e.target.value)}
          />
        </Champ>
      </fieldset>

      {/* Actif tant qu'aucun envoi n'est en cours : la saisie est vérifiée au
          clic, le bouton n'est jamais grisé d'avance. */}
      <Button type="submit" disabled={envoiEnCours} className="w-full">
        {envoiEnCours ? (
          <>
            <LoaderCircle aria-hidden="true" className="animate-spin" />
            {MESSAGES_MOT_DE_PASSE.enregistrementEnCours}
          </>
        ) : (
          MESSAGES_MOT_DE_PASSE.enregistrer
        )}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Formulaire (avec état)
// ---------------------------------------------------------------------------

export function FormulaireMotDePasse() {
  const router = useRouter();
  const [etat, agir] = useReducer(reduireMotDePasse, ETAT_MOT_DE_PASSE_INITIAL);
  const [envoiEnCours, demarrerEnvoi] = useTransition();
  // Un second clic avant la réponse ne lance pas un second envoi.
  const envoiVerrouille = useRef(false);
  const refResume = useRef<HTMLDivElement>(null);
  const refPremierChamp = useRef<HTMLInputElement>(null);

  // Après un envoi refusé, la sélection passe au résumé d'erreurs.
  useEffect(() => {
    if (etat.appelsResume > 0) refResume.current?.focus();
  }, [etat.appelsResume]);

  // Après une erreur technique, la sélection revient au premier champ, vidé,
  // une fois l'envoi terminé (avant, le `fieldset` le désactive encore). Une
  // seule fois par erreur : la fin d'un envoi suivant ne la déplace plus.
  const premierChampTraite = useRef(0);
  useEffect(() => {
    if (etat.appelsPremierChamp > premierChampTraite.current && !envoiEnCours) {
      premierChampTraite.current = etat.appelsPremierChamp;
      refPremierChamp.current?.focus();
    }
  }, [etat.appelsPremierChamp, envoiEnCours]);

  function envoyer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    if (envoiVerrouille.current) return;

    const validation = validerMotDePasse(etat.valeurs);
    if (!validation.ok) {
      agir({ type: "refus", champs: validation.champs });
      return;
    }

    envoiVerrouille.current = true;
    agir({ type: "envoi" });
    const valeurs = etat.valeurs;
    demarrerEnvoi(() =>
      envoyerMotDePasse({
        valeurs,
        choisir: actionChoisirMotDePasse,
        agir,
        apresReussite: () => {
          toast.success(MESSAGES_MOT_DE_PASSE.enregistre);
          router.replace(ADRESSE_ACCUEIL_INTERNE);
        },
        envoiVerrouille,
      }),
    );
  }

  return (
    <VueFormulaireMotDePasse
      etat={etat}
      envoiEnCours={envoiEnCours}
      refResume={refResume}
      refPremierChamp={refPremierChamp}
      onSaisie={(champ, valeur) => agir({ type: "saisie", champ, valeur })}
      onEnvoi={envoyer}
    />
  );
}

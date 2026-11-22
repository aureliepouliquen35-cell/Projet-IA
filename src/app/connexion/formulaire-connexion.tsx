"use client";

import { CircleAlert, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import {
  useEffect,
  useReducer,
  useRef,
  useTransition,
  type ComponentProps,
  type FormEvent,
  type Ref,
} from "react";

import { Champ } from "@/components/formulaire/champ";
import { ResumeErreurs } from "@/components/formulaire/resume-erreurs";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actionSeConnecter } from "@/server/actions/se-connecter";
import { FORME_EMAIL } from "@/shared/constantes";
import { MESSAGE_ERREUR_INATTENDUE, MESSAGES_CONNEXION } from "@/shared/messages";
import { echec, type ErreursChamps, type Reponse } from "@/shared/reponse";
import {
  CHAMPS_CONNEXION,
  erreurDuChampConnexion,
  validerConnexion,
  VALEURS_CONNEXION_VIDES,
  type ChampConnexion,
  type ValeursConnexion,
} from "@/shared/schemas/connexion";

// Formulaire de connexion I1 (EXPERIENCE.md).
//
// - `reduireConnexion` : ce qui change à chaque geste (saisie, sortie d'un
//   champ, « Afficher », envoi refusé, échec, réussite). Après un échec de
//   connexion, le mot de passe est effacé et l'email gardé.
// - `VueFormulaireConnexion` : l'écran, sans état.
// - `FormulaireConnexion` : relie les deux et appelle la Server Function,
//   qui ouvre la session puis renvoie vers « Demandes ».
//
// Les champs sont contrôlés et l'envoi passe par `onSubmit` : avec
// `<form action>`, React 19 viderait les champs après l'action.

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export type EtatConnexion = {
  valeurs: ValeursConnexion;
  /** Message affiché sous chaque champ en erreur. */
  erreurs: ErreursChamps;
  /** Le résumé du haut apparaît après un envoi refusé, pas avant. */
  resumeVisible: boolean;
  /** Échec de la connexion (« Identifiants incorrects »…), en haut du formulaire. */
  message: string | null;
  /** Mot de passe affiché en clair (bouton « Afficher »). */
  motDePasseVisible: boolean;
  /** Connexion réussie, passage à « Demandes » en cours : formulaire figé. */
  redirection: boolean;
  /** Augmente chaque fois que le résumé d'erreurs doit recevoir la sélection. */
  appelsResume: number;
  /** Augmente chaque fois que le mot de passe doit recevoir la sélection. */
  appelsMotDePasse: number;
};

export type ActionConnexion =
  | { type: "saisie"; champ: ChampConnexion; valeur: string }
  | { type: "sortie"; champ: ChampConnexion }
  | { type: "basculerAffichage" }
  | { type: "envoi" }
  | { type: "refus"; champs: ErreursChamps }
  | { type: "echec"; message: string; effacerMotDePasse: boolean }
  | { type: "reussite" };

export const ETAT_CONNEXION_INITIAL: EtatConnexion = {
  valeurs: VALEURS_CONNEXION_VIDES,
  erreurs: {},
  resumeVisible: false,
  message: null,
  motDePasseVisible: false,
  redirection: false,
  appelsResume: 0,
  appelsMotDePasse: 0,
};

function avecErreur(
  erreurs: ErreursChamps,
  champ: ChampConnexion,
  message: string | undefined,
): ErreursChamps {
  const suivantes = { ...erreurs };
  if (message) suivantes[champ] = message;
  else delete suivantes[champ];
  return suivantes;
}

export function reduireConnexion(etat: EtatConnexion, action: ActionConnexion): EtatConnexion {
  switch (action.type) {
    case "saisie": {
      const valeurs = { ...etat.valeurs, [action.champ]: action.valeur };
      // Un message d'erreur disparaît dès que le champ est corrigé.
      const erreurs = etat.erreurs[action.champ]
        ? avecErreur(etat.erreurs, action.champ, erreurDuChampConnexion(action.champ, valeurs))
        : etat.erreurs;
      return {
        ...etat,
        valeurs,
        erreurs,
        resumeVisible: etat.resumeVisible && Object.keys(erreurs).length > 0,
      };
    }
    case "sortie": {
      // Seul le format de l'email est vérifié à la sortie du champ ; le reste
      // (champ vide compris) l'est à l'envoi.
      if (action.champ !== "email") return etat;
      const email = etat.valeurs.email.trim();
      if (email === "" || FORME_EMAIL.test(email)) return etat;
      return {
        ...etat,
        erreurs: avecErreur(etat.erreurs, "email", erreurDuChampConnexion("email", etat.valeurs)),
      };
    }
    case "basculerAffichage":
      return { ...etat, motDePasseVisible: !etat.motDePasseVisible };
    case "envoi":
      return { ...etat, message: null };
    case "refus":
      // Saisie refusée : rien n'est effacé.
      return {
        ...etat,
        erreurs: action.champs,
        resumeVisible: true,
        message: null,
        appelsResume: etat.appelsResume + 1,
      };
    case "echec":
      // Connexion refusée : mot de passe effacé, email gardé (EXPERIENCE.md).
      return {
        ...etat,
        valeurs: action.effacerMotDePasse ? { ...etat.valeurs, motDePasse: "" } : etat.valeurs,
        erreurs: {},
        resumeVisible: false,
        message: action.message,
        appelsMotDePasse: etat.appelsMotDePasse + 1,
      };
    case "reussite":
      return { ...etat, message: null, redirection: true };
  }
}

/**
 * Ce que le formulaire fait de la réponse de la Server Function. Les textes
 * affichés sont ceux de l'UX, jamais le message technique de la réponse.
 *
 * - aucune réponse ou réussite : la connexion est faite, la page change ;
 * - saisie refusée avec ses champs : messages sous les champs ;
 * - identifiants refusés (`VALIDATION` sans champ) : « Identifiants
 *   incorrects », mot de passe effacé ;
 * - blocage : « Trop de tentatives, réessayez plus tard », mot de passe effacé ;
 * - toute autre réponse : « Une erreur inattendue s'est produite. », rien
 *   d'effacé (la personne peut réessayer tel quel).
 */
export function actionApresReponse(reponse: Reponse<unknown> | undefined): ActionConnexion {
  if (!reponse || reponse.ok) return { type: "reussite" };
  if (reponse.code === "VALIDATION" && reponse.champs && Object.keys(reponse.champs).length > 0) {
    return { type: "refus", champs: reponse.champs };
  }
  if (reponse.code === "VALIDATION") {
    return {
      type: "echec",
      message: MESSAGES_CONNEXION.identifiantsIncorrects,
      effacerMotDePasse: true,
    };
  }
  if (reponse.code === "TROP_DE_TENTATIVES") {
    return { type: "echec", message: MESSAGES_CONNEXION.tropDeTentatives, effacerMotDePasse: true };
  }
  return { type: "echec", message: MESSAGE_ERREUR_INATTENDUE, effacerMotDePasse: false };
}

/**
 * Vrai pour une erreur interne de Next.js (redirection d'une Server
 * Function) : `unstable_rethrow` relance celles-là, et seulement celles-là.
 */
function estRedirectionNext(erreur: unknown): boolean {
  try {
    unstable_rethrow(erreur);
    return false;
  } catch {
    return true;
  }
}

/** Ce dont l'envoi a besoin : passé en paramètre pour pouvoir être essayé seul. */
export type DependancesEnvoiConnexion = {
  /** Saisie déjà vérifiée par le navigateur. */
  valeurs: ValeursConnexion;
  /** La Server Function (`actionSeConnecter`). */
  seConnecter: (valeurs: ValeursConnexion) => Promise<Reponse<unknown> | undefined>;
  agir: (action: ActionConnexion) => void;
  /** Fermé pendant l'envoi : un second clic ne lance pas un second envoi. */
  envoiVerrouille: { current: boolean };
};

/**
 * Envoie les identifiants et traite la réponse. Le verrou doit déjà être
 * fermé et l'action « envoi » appliquée. Après un échec, le verrou est
 * rouvert ; après une réussite, il reste fermé jusqu'au changement de page.
 */
export async function envoyerConnexion({
  valeurs,
  seConnecter,
  agir,
  envoiVerrouille,
}: DependancesEnvoiConnexion): Promise<void> {
  let reponse: Reponse<unknown> | undefined;
  try {
    reponse = await seConnecter(valeurs);
  } catch (erreur) {
    // Connexion réussie : Next.js rejette la promesse avec sa redirection
    // vers « Demandes » (ou I2), déjà en cours. Ce n'est pas une panne.
    // Réseau coupé ou serveur injoignable : même message qu'une panne.
    reponse = estRedirectionNext(erreur)
      ? undefined
      : echec("ERREUR_INTERNE", MESSAGE_ERREUR_INATTENDUE);
  }

  const suite = actionApresReponse(reponse);
  agir(suite);
  if (suite.type !== "reussite") envoiVerrouille.current = false;
}

// ---------------------------------------------------------------------------
// Écran (sans état)
// ---------------------------------------------------------------------------

/**
 * Champ du mot de passe, avec son bouton « Afficher ». Reçoit de `Champ`
 * son identifiant et ses liens d'accessibilité, comme un `Input`.
 */
function SaisieMotDePasse({
  visible,
  onBasculer,
  ref,
  ...props
}: Omit<ComponentProps<"input">, "type"> & {
  visible: boolean;
  onBasculer?: () => void;
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <div className="relative">
      <Input
        ref={ref}
        {...props}
        type={visible ? "text" : "password"}
        autoComplete="current-password"
        autoCapitalize="none"
        spellCheck={false}
        className="pr-28 aria-invalid:pr-[111px]"
      />
      <Button
        variant="discret"
        size="sm"
        aria-controls={props.id}
        disabled={props.disabled}
        onClick={onBasculer}
        className="absolute top-1/2 right-1 -translate-y-1/2"
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        {visible ? MESSAGES_CONNEXION.masquer : MESSAGES_CONNEXION.afficher}
      </Button>
    </div>
  );
}

const ORDRE_CHAMPS: readonly string[] = CHAMPS_CONNEXION;

export function VueFormulaireConnexion({
  etat,
  envoiEnCours: envoiDemande = false,
  refResume,
  refMotDePasse,
  onSaisie,
  onSortie,
  onBasculerAffichage,
  onEnvoi,
}: {
  etat: EtatConnexion;
  envoiEnCours?: boolean;
  /** Résumé d'erreurs, pour lui donner la sélection après un envoi refusé. */
  refResume?: Ref<HTMLDivElement>;
  /** Champ du mot de passe, pour lui donner la sélection après un échec. */
  refMotDePasse?: Ref<HTMLInputElement>;
  onSaisie?: (champ: ChampConnexion, valeur: string) => void;
  onSortie?: (champ: ChampConnexion) => void;
  onBasculerAffichage?: () => void;
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
        <Alert variant="erreur" data-slot="echec-connexion" className="mb-5">
          <AlertTitle>
            <CircleAlert aria-hidden="true" />
            {etat.message}
          </AlertTitle>
        </Alert>
      ) : etat.resumeVisible ? (
        <ResumeErreurs ref={refResume} erreurs={erreursListees} className="mb-5" />
      ) : null}

      <fieldset disabled={envoiEnCours} className="mb-6 flex min-w-0 flex-col gap-4">
        <Champ id="email" etiquette={MESSAGES_CONNEXION.email} erreur={erreurs.email}>
          <Input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            // Curseur dans le champ Email à l'arrivée (EXPERIENCE.md, I1).
            autoFocus
            value={valeurs.email}
            onChange={(e) => onSaisie?.("email", e.target.value)}
            onBlur={() => onSortie?.("email")}
          />
        </Champ>
        <Champ id="motDePasse" etiquette={MESSAGES_CONNEXION.motDePasse} erreur={erreurs.motDePasse}>
          <SaisieMotDePasse
            ref={refMotDePasse}
            name="motDePasse"
            visible={etat.motDePasseVisible}
            disabled={envoiEnCours}
            value={valeurs.motDePasse}
            onChange={(e) => onSaisie?.("motDePasse", e.target.value)}
            onBasculer={onBasculerAffichage}
          />
        </Champ>
      </fieldset>

      {/* Actif tant qu'aucun envoi n'est en cours : la saisie est vérifiée au
          clic, le bouton n'est jamais grisé d'avance. */}
      <Button type="submit" disabled={envoiEnCours} className="w-full">
        {envoiEnCours ? (
          <>
            <LoaderCircle aria-hidden="true" className="animate-spin" />
            {MESSAGES_CONNEXION.connexionEnCours}
          </>
        ) : (
          MESSAGES_CONNEXION.seConnecter
        )}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Formulaire (avec état)
// ---------------------------------------------------------------------------

export function FormulaireConnexion() {
  const [etat, agir] = useReducer(reduireConnexion, ETAT_CONNEXION_INITIAL);
  const [envoiEnCours, demarrerEnvoi] = useTransition();
  // Un second clic avant la réponse ne lance pas un second envoi.
  const envoiVerrouille = useRef(false);
  const refResume = useRef<HTMLDivElement>(null);
  const refMotDePasse = useRef<HTMLInputElement>(null);

  // Après un envoi refusé, la sélection passe au résumé d'erreurs.
  useEffect(() => {
    if (etat.appelsResume > 0) refResume.current?.focus();
  }, [etat.appelsResume]);

  // Après un échec, la sélection revient au mot de passe, effacé, pour le
  // ressaisir aussitôt. Le message est annoncé par son encadré (`alert`).
  // Seulement une fois l'envoi terminé : avant, le champ est encore
  // désactivé par le `fieldset` et ne peut pas recevoir la sélection.
  useEffect(() => {
    if (etat.appelsMotDePasse > 0 && !envoiEnCours) refMotDePasse.current?.focus();
  }, [etat.appelsMotDePasse, envoiEnCours]);

  function envoyer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    if (envoiVerrouille.current) return;

    const validation = validerConnexion(etat.valeurs);
    if (!validation.ok) {
      agir({ type: "refus", champs: validation.champs });
      return;
    }

    envoiVerrouille.current = true;
    agir({ type: "envoi" });
    const valeurs = etat.valeurs;
    demarrerEnvoi(() =>
      envoyerConnexion({ valeurs, seConnecter: actionSeConnecter, agir, envoiVerrouille }),
    );
  }

  return (
    <VueFormulaireConnexion
      etat={etat}
      envoiEnCours={envoiEnCours}
      refResume={refResume}
      refMotDePasse={refMotDePasse}
      onSaisie={(champ, valeur) => agir({ type: "saisie", champ, valeur })}
      onSortie={(champ) => agir({ type: "sortie", champ })}
      onBasculerAffichage={() => agir({ type: "basculerAffichage" })}
      onEnvoi={envoyer}
    />
  );
}

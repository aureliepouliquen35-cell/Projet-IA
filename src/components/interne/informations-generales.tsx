"use client";

import { CircleAlert, LoaderCircle } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useEffect, useReducer, useRef, useTransition, type FormEvent, type Ref } from "react";

import { Champ } from "@/components/formulaire/champ";
import { ResumeErreurs } from "@/components/formulaire/resume-erreurs";
import { BoutonReessayer } from "@/components/interne/bouton-reessayer";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { afficherSucces } from "@/components/ui/sonner";
import { actionModifierParametres } from "@/server/actions/modifier-parametres";
import type { InformationsGenerales } from "@/server/lectures/parametres";
import { FORME_EMAIL } from "@/shared/constantes";
import { MESSAGES_ACCES_REFUSE, MESSAGES_PARAMETRES } from "@/shared/messages";
import { echec, type ErreursChamps, type Reponse } from "@/shared/reponse";
import { CHAMPS_PARAMETRES, validerParametres, type DonneesParametres } from "@/shared/schemas/parametres";

// Écran A3 « Informations générales » (story 4.3 ; EXPERIENCE.md, A3 ;
// FR-31) : le formulaire, son squelette et son état d'erreur de lecture.
//
// - Trois champs, remplis avec les valeurs en place : Téléphone de contact
//   (facultatif), Email de contact *, Contact pour les données
//   personnelles *. Sous chacun, un aperçu dit où l'information apparaît
//   aux demandeurs.
// - Vérification par le schéma partagé (AD-11) : à la sortie du champ pour
//   le format de l'email, à l'envoi pour tout le reste. Saisie refusée : le
//   message sous chaque champ, le résumé d'erreurs en haut (qui reçoit la
//   sélection), rien n'est envoyé ; la Server Function revérifie, et la
//   base aussi (NV103). Un message disparaît dès que le champ est corrigé.
// - Pendant l'envoi : « Enregistrement… » sur le bouton, saisie figée ; un
//   double clic n'envoie qu'une fois (AD-20).
// - Réussite : toast « Informations mises à jour. Elles sont visibles
//   immédiatement. », les valeurs nettoyées dans les champs (téléphone
//   vidé : champ vide) ; la page est recalculée par `refresh()` dans la
//   Server Function.
// - Panne : « Les informations n'ont pas pu être enregistrées. Réessayez. »
//   en haut, rien n'est effacé. Accès refusé (administrateur rétrogradé
//   entre-temps) : la page recalculée devient S1.
//
// - `reduireInformations`, `preparerEnvoiInformations`,
//   `actionApresReponseInformations`, `envoyerInformations` : les gestes et
//   l'envoi, exportés pour être essayés seuls.
// - `VueInformationsGenerales` : le formulaire, sans état.
// - `InformationsGeneralesFormulaire` : le formulaire, son état et la
//   Server Function.
// - `SqueletteInformations`, `EtatInformationsErreur` : chargement et
//   lecture impossible.

export type ChampInformations = (typeof CHAMPS_PARAMETRES)[number];

/** Saisie des trois champs, telle que tapée. */
export type ValeursInformations = Record<ChampInformations, string>;

/** Identifiant de chaque champ dans la page (visé par le résumé d'erreurs). */
export const idChampInformations = (champ: ChampInformations) => `informations-${champ}`;

/** Valeurs des champs d'après les informations enregistrées (pas de téléphone : champ vide). */
export function valeursDepuis(informations: InformationsGenerales | DonneesParametres): ValeursInformations {
  return {
    telephone: informations.telephone ?? "",
    emailContact: informations.emailContact,
    contactDonnees: informations.contactDonnees,
  };
}

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export type EtatInformations = {
  valeurs: ValeursInformations;
  /** Message affiché sous chaque champ en erreur. */
  erreurs: ErreursChamps;
  /** Le résumé du haut apparaît après un envoi refusé, pas avant. */
  resumeVisible: boolean;
  /** Message de l'encadré du haut après une panne (ou un refus d'accès), sinon `null`. */
  panne: string | null;
  /** Augmente chaque fois que l'encadré du haut doit recevoir la sélection. */
  appelsEncadre: number;
};

export type ActionInformations =
  | { type: "saisie"; champ: ChampInformations; valeur: string }
  | { type: "sortie"; champ: ChampInformations }
  | { type: "envoi" }
  | { type: "refus"; champs: ErreursChamps }
  | { type: "panne"; message: string }
  | { type: "reussite"; valeurs: ValeursInformations };

export function etatInitialInformations(valeurs: ValeursInformations): EtatInformations {
  return { valeurs, erreurs: {}, resumeVisible: false, panne: null, appelsEncadre: 0 };
}

/** Erreur d'un champ selon le schéma partagé, pour les valeurs données. */
function erreurDuChamp(champ: ChampInformations, valeurs: ValeursInformations): string | undefined {
  const validation = validerParametres(valeurs);
  return validation.ok ? undefined : validation.champs[champ];
}

function avecErreur(erreurs: ErreursChamps, champ: ChampInformations, message: string | undefined): ErreursChamps {
  const suivantes = { ...erreurs };
  if (message) suivantes[champ] = message;
  else delete suivantes[champ];
  return suivantes;
}

export function reduireInformations(etat: EtatInformations, action: ActionInformations): EtatInformations {
  switch (action.type) {
    case "saisie": {
      const valeurs = { ...etat.valeurs, [action.champ]: action.valeur };
      // Un message disparaît dès que le champ est corrigé ; tant qu'il ne
      // l'est pas, il dit ce qui reste à corriger.
      const erreurs = etat.erreurs[action.champ]
        ? avecErreur(etat.erreurs, action.champ, erreurDuChamp(action.champ, valeurs))
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
      if (action.champ !== "emailContact") return etat;
      const email = etat.valeurs.emailContact.trim();
      if (email === "" || FORME_EMAIL.test(email)) return etat;
      return { ...etat, erreurs: avecErreur(etat.erreurs, "emailContact", erreurDuChamp("emailContact", etat.valeurs)) };
    }
    case "envoi":
      return { ...etat, panne: null, erreurs: {}, resumeVisible: false };
    case "refus":
      return {
        ...etat,
        erreurs: action.champs,
        resumeVisible: true,
        panne: null,
        appelsEncadre: etat.appelsEncadre + 1,
      };
    case "panne":
      // Rien n'est effacé : la même saisie peut être renvoyée.
      return { ...etat, panne: action.message, resumeVisible: false, appelsEncadre: etat.appelsEncadre + 1 };
    case "reussite":
      return { ...etatInitialInformations(action.valeurs), appelsEncadre: etat.appelsEncadre };
  }
}

/** Erreurs du formulaire, dans l'ordre de l'écran (résumé d'erreurs). */
export function listerErreursInformations(champs: ErreursChamps): { champ: string; message: string }[] {
  return CHAMPS_PARAMETRES.flatMap((champ) =>
    champs[champ] ? [{ champ: idChampInformations(champ), message: champs[champ] }] : [],
  );
}

/**
 * Début d'un envoi (clic sur « Enregistrer » ou Entrée) :
 * - verrou fermé (envoi déjà en cours, double clic) : `ignore` ;
 * - saisie refusée par le schéma partagé : `refus` avec ses champs, rien
 *   n'est envoyé, verrou laissé ouvert ;
 * - sinon : `envoi`, et le verrou est fermé.
 */
export function preparerEnvoiInformations(
  valeurs: ValeursInformations,
  envoiVerrouille: { current: boolean },
): { type: "ignore" } | { type: "refus"; champs: ErreursChamps } | { type: "envoi" } {
  if (envoiVerrouille.current) return { type: "ignore" };
  const validation = validerParametres(valeurs);
  if (!validation.ok) return { type: "refus", champs: validation.champs };
  envoiVerrouille.current = true;
  return { type: "envoi" };
}

/**
 * Ce que le formulaire fait de la réponse de la Server Function. Les textes
 * affichés sont ceux de l'UX, jamais un message technique :
 * - réussite : les valeurs nettoyées dans les champs ;
 * - saisie refusée par le serveur (avec ses champs) : messages sous les
 *   champs ;
 * - accès refusé : « Accès refusé. » (en pratique, la page recalculée devient
 *   aussitôt S1) ;
 * - toute autre réponse : « Les informations n'ont pas pu être
 *   enregistrées. Réessayez. ».
 */
export function actionApresReponseInformations(reponse: Reponse<DonneesParametres>): ActionInformations {
  if (reponse.ok) return { type: "reussite", valeurs: valeursDepuis(reponse.donnees) };
  if (reponse.code === "VALIDATION" && reponse.champs && Object.keys(reponse.champs).length > 0) {
    return { type: "refus", champs: reponse.champs };
  }
  if (reponse.code === "ACCES_REFUSE") return { type: "panne", message: MESSAGES_ACCES_REFUSE.action };
  return { type: "panne", message: MESSAGES_PARAMETRES.enregistrementImpossible };
}

/** Ce dont l'envoi a besoin : passé en paramètre pour pouvoir être essayé seul. */
export type DependancesInformations = {
  /** Saisie déjà vérifiée par le navigateur. */
  valeurs: ValeursInformations;
  /** La Server Function (`actionModifierParametres`). */
  enregistrer: (valeurs: ValeursInformations) => Promise<Reponse<DonneesParametres>>;
  agir: (action: ActionInformations) => void;
  /** Après une réussite : toast. */
  apresReussite: () => void;
  /** Fermé pendant l'envoi : un second clic ne lance pas un second envoi. */
  envoiVerrouille: { current: boolean };
};

/**
 * Envoie la saisie et traite la réponse. Le verrou doit déjà être fermé et
 * l'action « envoi » appliquée. Le verrou est rouvert à la fin, quelle que
 * soit la réponse. Un réseau coupé donne la même suite qu'une panne ; une
 * redirection du serveur (session terminée) est relancée pour que Next.js
 * change de page.
 */
export async function envoyerInformations({
  valeurs,
  enregistrer,
  agir,
  apresReussite,
  envoiVerrouille,
}: DependancesInformations): Promise<void> {
  let reponse: Reponse<DonneesParametres>;
  try {
    reponse = await enregistrer(valeurs);
  } catch (erreur) {
    try {
      unstable_rethrow(erreur);
    } catch (redirection) {
      envoiVerrouille.current = false;
      throw redirection;
    }
    reponse = echec("ERREUR_INTERNE", MESSAGES_PARAMETRES.enregistrementImpossible);
  }

  agir(actionApresReponseInformations(reponse));
  envoiVerrouille.current = false;
  if (reponse.ok) apresReussite();
}

// ---------------------------------------------------------------------------
// Formulaire (sans état)
// ---------------------------------------------------------------------------

const textes = MESSAGES_PARAMETRES;

/** Encadré de panne : rien n'est perdu, le même envoi peut être relancé. */
function EncadrePanne({ message, ref }: { message: string; ref?: Ref<HTMLDivElement> }) {
  return (
    <Alert ref={ref} variant="erreur" tabIndex={-1} data-slot="panne-informations" className="mb-5">
      <AlertTitle>
        <CircleAlert aria-hidden="true" />
        {message}
      </AlertTitle>
    </Alert>
  );
}

export function VueInformationsGenerales({
  etat,
  envoiEnCours = false,
  refEncadre,
  onSaisie,
  onSortie,
  onEnvoi,
}: {
  etat: EtatInformations;
  envoiEnCours?: boolean;
  /** Encadré du haut (résumé d'erreurs ou panne), pour lui donner la sélection. */
  refEncadre?: Ref<HTMLDivElement>;
  onSaisie?: (champ: ChampInformations, valeur: string) => void;
  onSortie?: (champ: ChampInformations) => void;
  onEnvoi?: (evenement: FormEvent<HTMLFormElement>) => void;
}) {
  const { valeurs, erreurs } = etat;
  const saisir = (champ: ChampInformations) => (valeur: string) => onSaisie?.(champ, valeur);

  return (
    <form
      noValidate // Les messages sont ceux de l'UX, pas ceux du navigateur.
      onSubmit={onEnvoi}
      aria-busy={envoiEnCours || undefined}
      data-slot="informations-generales"
      className="flex max-w-xl flex-col rounded-lg border bg-background p-5 shadow-soft"
    >
      {etat.panne ? (
        <EncadrePanne ref={refEncadre} message={etat.panne} />
      ) : etat.resumeVisible ? (
        <ResumeErreurs ref={refEncadre} erreurs={listerErreursInformations(erreurs)} className="mb-5" />
      ) : null}

      {/* Pendant l'envoi, la saisie est figée. */}
      <fieldset disabled={envoiEnCours} className="mb-6 flex min-w-0 flex-col gap-4">
        <Champ
          id={idChampInformations("telephone")}
          etiquette={textes.telephone}
          aide={textes.apercuTelephone}
          erreur={erreurs.telephone}
        >
          <Input
            name="telephone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={valeurs.telephone}
            onChange={(e) => saisir("telephone")(e.target.value)}
          />
        </Champ>
        <Champ
          id={idChampInformations("emailContact")}
          etiquette={textes.emailContact}
          obligatoire
          aide={textes.apercuEmailContact}
          erreur={erreurs.emailContact}
        >
          <Input
            name="emailContact"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={valeurs.emailContact}
            onChange={(e) => saisir("emailContact")(e.target.value)}
            onBlur={() => onSortie?.("emailContact")}
          />
        </Champ>
        <Champ
          id={idChampInformations("contactDonnees")}
          etiquette={textes.contactDonnees}
          obligatoire
          aide={textes.apercuContactDonnees}
          erreur={erreurs.contactDonnees}
        >
          <Input
            name="contactDonnees"
            autoComplete="off"
            value={valeurs.contactDonnees}
            onChange={(e) => saisir("contactDonnees")(e.target.value)}
          />
        </Champ>
      </fieldset>

      <div>
        {/* Actif tant qu'aucun envoi n'est en cours : la saisie est vérifiée
            au clic, le bouton n'est jamais grisé d'avance. */}
        <Button type="submit" data-slot="enregistrer" disabled={envoiEnCours} aria-busy={envoiEnCours || undefined}>
          {envoiEnCours ? (
            <>
              <LoaderCircle aria-hidden="true" className="animate-spin" />
              {textes.enregistrementEnCours}
            </>
          ) : (
            textes.enregistrer
          )}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Formulaire (avec état)
// ---------------------------------------------------------------------------

export function InformationsGeneralesFormulaire({ informations }: { informations: InformationsGenerales }) {
  const [etat, agir] = useReducer(reduireInformations, valeursDepuis(informations), etatInitialInformations);
  const [envoiEnCours, demarrerEnvoi] = useTransition();
  // Un second clic avant la réponse ne lance pas un second envoi.
  const envoiVerrouille = useRef(false);
  const refEncadre = useRef<HTMLDivElement>(null);

  // Après un envoi refusé ou une panne, la sélection passe à l'encadré du
  // haut : il est lu par les lecteurs d'écran.
  useEffect(() => {
    if (etat.appelsEncadre > 0) refEncadre.current?.focus();
  }, [etat.appelsEncadre]);

  function envoyer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const debut = preparerEnvoiInformations(etat.valeurs, envoiVerrouille);
    if (debut.type === "ignore") return;
    if (debut.type === "refus") {
      agir({ type: "refus", champs: debut.champs });
      return;
    }

    agir({ type: "envoi" });
    const valeurs = etat.valeurs;
    demarrerEnvoi(() =>
      envoyerInformations({
        valeurs,
        enregistrer: actionModifierParametres,
        agir,
        apresReussite: () => afficherSucces(textes.misesAJour),
        envoiVerrouille,
      }),
    );
  }

  return (
    <VueInformationsGenerales
      etat={etat}
      envoiEnCours={envoiEnCours}
      refEncadre={refEncadre}
      onSaisie={(champ, valeur) => agir({ type: "saisie", champ, valeur })}
      onSortie={(champ) => agir({ type: "sortie", champ })}
      onEnvoi={envoyer}
    />
  );
}

// ---------------------------------------------------------------------------
// Chargement et erreur de lecture
// ---------------------------------------------------------------------------

/** Les informations n'ont pas pu être lues : message et « Réessayer » (même modèle que A2). */
export function EtatInformationsErreur() {
  return (
    <div
      data-slot="informations-erreur"
      role="alert"
      className="flex max-w-xl flex-col items-center rounded-lg border bg-background px-5 py-7 text-center shadow-soft"
    >
      <span
        aria-hidden="true"
        className="mb-3 flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger"
      >
        <CircleAlert />
      </span>
      <p className="mb-4 text-body font-semibold text-urgent-fg">{textes.erreur}</p>
      <BoutonReessayer />
    </div>
  );
}

/**
 * Squelette de l'écran A3 (DESIGN.md, Squelette) : le titre, les trois
 * champs (étiquette, champ, aperçu) et le bouton en gris, visibles
 * seulement après 300 ms, sans animation.
 */
export function SqueletteInformations() {
  return (
    <div data-slot="squelette" role="status" className="animate-apres-300ms flex flex-col gap-5">
      <span className="sr-only">{textes.chargement}</span>
      <div className="h-8 w-64 max-w-full rounded-sm bg-border" />
      <div className="flex max-w-xl flex-col gap-4 rounded-lg border bg-background p-5 shadow-soft">
        {CHAMPS_PARAMETRES.map((champ) => (
          <div key={champ} data-slot="champ-squelette" className="flex flex-col gap-1.5">
            <div className="h-3 w-48 rounded-sm bg-border" />
            <div className="h-control w-full rounded-sm bg-border" />
            <div className="h-3 w-72 max-w-full rounded-sm bg-border" />
          </div>
        ))}
        <div className="mt-2 h-control w-32 rounded-md bg-border" />
      </div>
    </div>
  );
}

"use client";

import { Check, CircleAlert, Copy, KeyRound, LoaderCircle, RefreshCw } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useEffect, useReducer, useRef, useState, useTransition, type FormEvent, type Ref } from "react";

import { Champ } from "@/components/formulaire/champ";
import { premierMot } from "@/components/interne/etat-compte";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { afficherSucces } from "@/components/ui/sonner";
import { actionReinitialiserMotDePasse } from "@/server/actions/reinitialiser-mot-de-passe";
import type { MotDePasseReinitialise } from "@/server/admin";
import { MESSAGES_ACCES_REFUSE, MESSAGES_COMPTE, MESSAGES_COMPTES } from "@/shared/messages";
import { genererMotDePasseTemporaire } from "@/shared/mot-de-passe-temporaire";
import { echec, type Reponse } from "@/shared/reponse";
import { schemaReinitialisation } from "@/shared/schemas/compte";

// « Réinitialiser le mot de passe » de la colonne Actions de l'écran A1
// (story 3.5 ; EXPERIENCE.md, A1 ; FR-23) : un bouton sur chaque ligne, et
// sa fenêtre.
//
// - Fenêtre « Réinitialiser le mot de passe de Lucas Bernard » : texte
//   « L'ancien mot de passe ne fonctionnera plus. Lucas devra choisir… »,
//   champ « Nouveau mot de passe temporaire * » avec « Générer » (tiré dans
//   le navigateur, Web Crypto, visible en clair), boutons « Annuler » et
//   « Réinitialiser » (« Réinitialisation… » pendant l'envoi). Moins de 12
//   caractères : « 12 caractères minimum » sous le champ, rien n'est envoyé
//   (schéma partagé ; la Server Function revérifie, AD-11).
// - Après la réinitialisation : le mot de passe s'affiche une seule fois,
//   avec « Copier » (puis « Copié ») et un seul bouton « Fermer » ; toast
//   « Mot de passe réinitialisé », comme à la création. Le tableau ne change
//   pas : pas de `refresh()`.
// - Panne : encadré « Le mot de passe n'a pas pu être réinitialisé.
//   Réessayez. », saisie gardée.
// - Fermeture (Échap, « Annuler », « Fermer ») : la saisie et le mot de passe
//   sont oubliés. Pas de fermeture pendant l'envoi, ni par un clic à côté de
//   la fenêtre. Un double clic n'envoie qu'une fois (AD-20).
// - Sélection : sur le champ à l'ouverture et après un refus, sur « Copier »
//   après la réinitialisation, sur l'encadré après une panne.
//
// - `reduireReinitialisation` : ce qui change à chaque geste (exporté,
//   essayé seul) ; `preparerEnvoiReinitialisation`, `envoyerReinitialisation`,
//   `actionApresReponseReinitialisation`, `actionFermetureReinitialisation`,
//   `changerOuvertureReinitialisation` : l'envoi et la fermeture, essayés
//   seuls.
// - `VueReinitialiserMotDePasse` : le contenu de la fenêtre, sans état.
// - `ReinitialiserMotDePasse` : le bouton, la fenêtre et la Server Function.
//
// Le mot de passe n'est gardé que dans l'état de ce composant, jamais dans
// l'adresse, le stockage du navigateur ou la réponse du serveur.

/** Ce que la ligne montre du compte. */
export type CompteReinitialisation = { id: string; nom: string };

/** Identifiant du champ du mot de passe, unique sur la page (une fenêtre par ligne). */
export const idChampReinitialisation = (compteId: string) => `reinitialiser-${compteId}-motDePasseTemporaire`;

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export type EtatReinitialisation = {
  /** Saisie du champ « Nouveau mot de passe temporaire ». */
  motDePasse: string;
  /** Message sous le champ (« 12 caractères minimum »). */
  erreur: string | null;
  /**
   * L'envoi a échoué : message de l'encadré (panne, ou « Accès refusé. »),
   * saisie gardée ; `null` sinon.
   */
  panne: string | null;
  /** Réinitialisation faite : le mot de passe, affiché une seule fois. */
  reinitialise: string | null;
  /** « Copier » a réussi : le bouton dit « Copié ». */
  copie: boolean;
  /** Augmente chaque fois que l'encadré de panne doit recevoir la sélection. */
  appelsEncadre: number;
  /** Augmente chaque fois que le champ doit recevoir la sélection (refus). */
  appelsChamp: number;
};

export type ActionReinitialisation =
  | { type: "saisie"; valeur: string }
  | { type: "generation"; motDePasse: string }
  | { type: "envoi" }
  | { type: "refus"; message: string }
  | { type: "panne"; message: string }
  | { type: "reussite"; motDePasse: string }
  | { type: "copie" }
  | { type: "reinitialisation" };

export const ETAT_REINITIALISATION_INITIAL: EtatReinitialisation = {
  motDePasse: "",
  erreur: null,
  panne: null,
  reinitialise: null,
  copie: false,
  appelsEncadre: 0,
  appelsChamp: 0,
};

/** Message sous le champ selon le schéma partagé, pour ce mot de passe. */
function erreurDuMotDePasse(motDePasse: string): string | null {
  const resultat = schemaReinitialisation.shape.motDePasseTemporaire.safeParse(motDePasse);
  return resultat.success ? null : (resultat.error.issues[0]?.message ?? MESSAGES_COMPTE.motDePasseTropCourt);
}

/** Après une saisie : un message affiché disparaît dès que le champ est corrigé. */
function apresSaisie(etat: EtatReinitialisation, motDePasse: string): EtatReinitialisation {
  return { ...etat, motDePasse, erreur: etat.erreur ? erreurDuMotDePasse(motDePasse) : null };
}

export function reduireReinitialisation(
  etat: EtatReinitialisation,
  action: ActionReinitialisation,
): EtatReinitialisation {
  switch (action.type) {
    case "saisie":
      return apresSaisie(etat, action.valeur);
    case "generation":
      return apresSaisie(etat, action.motDePasse);
    case "envoi":
      return { ...etat, erreur: null, panne: null };
    case "refus":
      return { ...etat, erreur: action.message, panne: null, appelsChamp: etat.appelsChamp + 1 };
    case "panne":
      return { ...etat, panne: action.message, appelsEncadre: etat.appelsEncadre + 1 };
    case "reussite":
      // La saisie est oubliée ; seul le mot de passe affiché reste, jusqu'à
      // la fermeture de la fenêtre.
      return { ...ETAT_REINITIALISATION_INITIAL, reinitialise: action.motDePasse };
    case "copie":
      return etat.reinitialise ? { ...etat, copie: true } : etat;
    case "reinitialisation":
      return ETAT_REINITIALISATION_INITIAL;
  }
}

/**
 * Début d'un envoi (clic sur « Réinitialiser ») :
 * - verrou fermé (envoi déjà en cours, double clic) : `ignore` ;
 * - moins de 12 caractères : `refus` avec le message, rien n'est envoyé,
 *   verrou laissé ouvert ;
 * - sinon : `envoi`, et le verrou est fermé.
 */
export function preparerEnvoiReinitialisation(
  motDePasse: string,
  envoiVerrouille: { current: boolean },
): { type: "ignore" } | { type: "refus"; message: string } | { type: "envoi" } {
  if (envoiVerrouille.current) return { type: "ignore" };
  const erreur = erreurDuMotDePasse(motDePasse);
  if (erreur) return { type: "refus", message: erreur };
  envoiVerrouille.current = true;
  return { type: "envoi" };
}

/**
 * Ce que la fenêtre fait de la réponse de la Server Function : réussite →
 * mot de passe affiché une seule fois ; mot de passe refusé par le serveur
 * → message sous le champ ; accès refusé → « Accès refusé. » dans l'encadré ;
 * toute autre réponse → encadré de panne (message de l'UX, jamais le message
 * technique).
 */
export function actionApresReponseReinitialisation(
  reponse: Reponse<MotDePasseReinitialise>,
  motDePasse: string,
): ActionReinitialisation {
  if (reponse.ok) return { type: "reussite", motDePasse };
  if (reponse.code === "VALIDATION" && reponse.champs?.motDePasseTemporaire) {
    return { type: "refus", message: reponse.champs.motDePasseTemporaire };
  }
  if (reponse.code === "ACCES_REFUSE") return { type: "panne", message: MESSAGES_ACCES_REFUSE.action };
  return { type: "panne", message: MESSAGES_COMPTE.reinitialisationImpossible };
}

/**
 * Fermeture demandée (Échap, « Annuler », « Fermer ») : refusée pendant
 * l'envoi (`null`) ; sinon l'action qui oublie la saisie et le mot de passe.
 */
export function actionFermetureReinitialisation(envoiVerrouille: { current: boolean }): ActionReinitialisation | null {
  return envoiVerrouille.current ? null : { type: "reinitialisation" };
}

/**
 * Ouverture ou fermeture demandée (bouton de la ligne, Échap, « Annuler »,
 * « Fermer ») : une fermeture pendant l'envoi est ignorée ; une fermeture
 * hors envoi oublie d'abord la saisie et le mot de passe affiché, puis
 * ferme ; une ouverture ouvre seulement.
 */
export function changerOuvertureReinitialisation(
  ouvrir: boolean,
  envoiVerrouille: { current: boolean },
  deps: { agir: (action: ActionReinitialisation) => void; setOuverte: (ouverte: boolean) => void },
): void {
  if (!ouvrir) {
    const fermeture = actionFermetureReinitialisation(envoiVerrouille);
    if (!fermeture) return;
    deps.agir(fermeture);
  }
  deps.setOuverte(ouvrir);
}

/** Ce dont l'envoi a besoin : passé en paramètre pour pouvoir être essayé seul. */
export type DependancesReinitialisation = {
  compteId: string;
  /** Mot de passe déjà vérifié par le navigateur. */
  motDePasse: string;
  /** La Server Function (`actionReinitialiserMotDePasse`). */
  reinitialiser: (saisie: {
    compteId: string;
    motDePasseTemporaire: string;
  }) => Promise<Reponse<MotDePasseReinitialise>>;
  agir: (action: ActionReinitialisation) => void;
  /** Après une réussite : toast « Mot de passe réinitialisé ». */
  apresReussite: () => void;
  /** Fermé pendant l'envoi : un second clic ne lance pas un second envoi. */
  envoiVerrouille: { current: boolean };
};

/**
 * Envoie le mot de passe et traite la réponse. Le verrou doit déjà être
 * fermé et l'action « envoi » appliquée. Le verrou est rouvert à la fin,
 * quelle que soit la réponse. Un réseau coupé donne la même suite qu'une
 * panne ; une redirection du serveur (session terminée) est relancée pour
 * que Next.js change de page.
 */
export async function envoyerReinitialisation({
  compteId,
  motDePasse,
  reinitialiser,
  agir,
  apresReussite,
  envoiVerrouille,
}: DependancesReinitialisation): Promise<void> {
  let reponse: Reponse<MotDePasseReinitialise>;
  try {
    reponse = await reinitialiser({ compteId, motDePasseTemporaire: motDePasse });
  } catch (erreur) {
    try {
      unstable_rethrow(erreur);
    } catch (redirection) {
      envoiVerrouille.current = false;
      throw redirection;
    }
    reponse = echec("ERREUR_INTERNE", MESSAGES_COMPTE.reinitialisationImpossible);
  }

  const suite = actionApresReponseReinitialisation(reponse, motDePasse);
  agir(suite);
  envoiVerrouille.current = false;
  if (suite.type === "reussite") apresReussite();
}

// ---------------------------------------------------------------------------
// Fenêtre (sans état)
// ---------------------------------------------------------------------------

const textes = MESSAGES_COMPTES.reinitialisation;

/** Encadré de panne : rien n'est perdu, le même envoi peut être relancé. */
function EncadrePanne({ message, ref }: { message: string; ref?: Ref<HTMLDivElement> }) {
  return (
    <Alert ref={ref} variant="erreur" tabIndex={-1} data-slot="panne-reinitialisation" className="mb-5">
      <AlertTitle>
        <CircleAlert aria-hidden="true" />
        {message}
      </AlertTitle>
    </Alert>
  );
}

/** Le nouveau mot de passe temporaire, affiché une seule fois. */
function MotDePasseAffiche({
  idChamp,
  motDePasse,
  copie,
  refCopier,
  onCopier,
  onFermer,
}: {
  idChamp: string;
  motDePasse: string;
  copie: boolean;
  refCopier?: Ref<HTMLButtonElement>;
  onCopier?: () => void;
  onFermer?: () => void;
}) {
  const id = `${idChamp}-affiche`;
  return (
    <div data-slot="mot-de-passe-reinitialise" className="flex flex-col">
      {/* Le toast est hors de la fenêtre, cachée aux lecteurs d'écran tant
          qu'elle est ouverte : la réussite est annoncée ici aussi. */}
      <p role="status" aria-live="polite" data-slot="annonce-reinitialisation" className="sr-only">
        {textes.motDePasseReinitialise}
      </p>
      <Label htmlFor={id} className="mb-1.5">
        {textes.motDePasse}
      </Label>
      <div className="mb-6 flex items-center gap-2.5">
        {/* Lecture seule : il se sélectionne pour être recopié à la main. */}
        <Input
          id={id}
          data-slot="mot-de-passe-affiche"
          readOnly
          value={motDePasse}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 bg-surface-muted font-mono"
          onFocus={(evenement) => evenement.currentTarget.select()}
        />
        <Button ref={refCopier} variant="secondaire" data-slot="copier" onClick={onCopier}>
          {copie ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copie ? textes.copie : textes.copier}
        </Button>
      </div>
      {/* « Copié » est annoncé aux lecteurs d'écran. */}
      <span aria-live="polite" className="sr-only">
        {copie ? textes.copie : ""}
      </span>

      <DialogFooter>
        <Button data-slot="fermer" onClick={onFermer}>
          {textes.fermer}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function VueReinitialiserMotDePasse({
  compte,
  etat,
  envoiEnCours = false,
  refEncadre,
  refChamp,
  refCopier,
  onSaisie,
  onGenerer,
  onEnvoi,
  onAnnuler,
  onCopier,
}: {
  compte: CompteReinitialisation;
  etat: EtatReinitialisation;
  envoiEnCours?: boolean;
  /** Encadré de panne, pour lui donner la sélection. */
  refEncadre?: Ref<HTMLDivElement>;
  /** Champ du mot de passe, sélectionné à l'ouverture et après un refus. */
  refChamp?: Ref<HTMLInputElement>;
  /** « Copier », sélectionné après la réinitialisation. */
  refCopier?: Ref<HTMLButtonElement>;
  onSaisie?: (valeur: string) => void;
  onGenerer?: () => void;
  onEnvoi?: (evenement: FormEvent<HTMLFormElement>) => void;
  /** « Annuler » et « Fermer ». */
  onAnnuler?: () => void;
  onCopier?: () => void;
}) {
  const idChamp = idChampReinitialisation(compte.id);

  return (
    <>
      <DialogTitle>{textes.titre(compte.nom)}</DialogTitle>
      <DialogDescription>{textes.texte(premierMot(compte.nom))}</DialogDescription>

      {etat.reinitialise ? (
        <MotDePasseAffiche
          idChamp={idChamp}
          motDePasse={etat.reinitialise}
          copie={etat.copie}
          refCopier={refCopier}
          onCopier={onCopier}
          onFermer={onAnnuler}
        />
      ) : (
        <form
          noValidate // Les messages sont ceux de l'UX, pas ceux du navigateur.
          onSubmit={onEnvoi}
          aria-busy={envoiEnCours || undefined}
          data-slot="formulaire-reinitialisation"
          className="flex flex-col"
        >
          {etat.panne ? <EncadrePanne message={etat.panne} ref={refEncadre} /> : null}

          {/* Pendant l'envoi, la saisie est figée. */}
          <fieldset disabled={envoiEnCours} className="mb-6 flex min-w-0 flex-col">
            <Champ
              id={idChamp}
              etiquette={textes.motDePasse}
              obligatoire
              erreur={etat.erreur ?? undefined}
              apres={
                <Button
                  variant="secondaire"
                  data-slot="generer"
                  aria-label={textes.genererNom}
                  onClick={onGenerer}
                >
                  <RefreshCw aria-hidden="true" />
                  {textes.generer}
                </Button>
              }
            >
              {/* En clair : l'administrateur le transmet lui-même. */}
              <Input
                ref={refChamp}
                name="motDePasseTemporaire"
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="font-mono"
                value={etat.motDePasse}
                onChange={(e) => onSaisie?.(e.target.value)}
              />
            </Champ>
          </fieldset>

          <DialogFooter>
            <Button variant="secondaire" data-slot="annuler" disabled={envoiEnCours} onClick={onAnnuler}>
              {textes.annuler}
            </Button>
            {/* Actif tant qu'aucun envoi n'est en cours : la saisie est
                vérifiée au clic, le bouton n'est jamais grisé d'avance. */}
            <Button type="submit" data-slot="confirmer-reinitialisation" disabled={envoiEnCours}>
              {envoiEnCours ? (
                <>
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                  {textes.reinitialisationEnCours}
                </>
              ) : (
                textes.reinitialiser
              )}
            </Button>
          </DialogFooter>
        </form>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Bouton et fenêtre (avec état)
// ---------------------------------------------------------------------------

export function ReinitialiserMotDePasse({ compte }: { compte: CompteReinitialisation }) {
  const [ouverte, setOuverte] = useState(false);
  const [etat, agir] = useReducer(reduireReinitialisation, ETAT_REINITIALISATION_INITIAL);
  const [envoiEnCours, demarrerEnvoi] = useTransition();
  // Un second clic avant la réponse ne lance pas un second envoi.
  const envoiVerrouille = useRef(false);
  const refEncadre = useRef<HTMLDivElement>(null);
  const refChamp = useRef<HTMLInputElement>(null);
  const refCopier = useRef<HTMLButtonElement>(null);

  // Après une panne, la sélection passe à l'encadré : il est lu par les
  // lecteurs d'écran.
  useEffect(() => {
    if (etat.appelsEncadre > 0) refEncadre.current?.focus();
  }, [etat.appelsEncadre]);

  // Après un refus (« 12 caractères minimum »), la sélection revient au
  // champ, qui annonce son message.
  useEffect(() => {
    if (etat.appelsChamp > 0) refChamp.current?.focus();
  }, [etat.appelsChamp]);

  // Après la réinitialisation, la sélection passe à « Copier ».
  const reinitialise = etat.reinitialise !== null;
  useEffect(() => {
    if (reinitialise) refCopier.current?.focus();
  }, [reinitialise]);

  function changerOuverture(ouvrir: boolean) {
    changerOuvertureReinitialisation(ouvrir, envoiVerrouille, { agir, setOuverte });
  }

  function envoyer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const debut = preparerEnvoiReinitialisation(etat.motDePasse, envoiVerrouille);
    if (debut.type === "ignore") return;
    if (debut.type === "refus") {
      agir({ type: "refus", message: debut.message });
      return;
    }

    agir({ type: "envoi" });
    const motDePasse = etat.motDePasse;
    demarrerEnvoi(() =>
      envoyerReinitialisation({
        compteId: compte.id,
        motDePasse,
        reinitialiser: actionReinitialiserMotDePasse,
        agir,
        apresReussite: () => afficherSucces(textes.motDePasseReinitialise),
        envoiVerrouille,
      }),
    );
  }

  async function copier() {
    if (!etat.reinitialise) return;
    try {
      await navigator.clipboard.writeText(etat.reinitialise);
      agir({ type: "copie" });
    } catch {
      // Presse-papiers refusé : le mot de passe reste affiché, à recopier.
    }
  }

  return (
    <Dialog open={ouverte} onOpenChange={changerOuverture}>
      <DialogTrigger asChild>
        <Button
          variant="secondaire"
          size="sm"
          data-slot="reinitialiser-mot-de-passe"
          aria-label={textes.boutonNom(compte.nom)}
        >
          <KeyRound aria-hidden="true" />
          {textes.bouton}
        </Button>
      </DialogTrigger>
      <DialogContent
        data-slot="fenetre-reinitialiser-mot-de-passe"
        onOpenAutoFocus={(evenement) => {
          evenement.preventDefault();
          refChamp.current?.focus();
        }}
        onInteractOutside={(evenement) => evenement.preventDefault()}
      >
        <VueReinitialiserMotDePasse
          compte={compte}
          etat={etat}
          envoiEnCours={envoiEnCours}
          refEncadre={refEncadre}
          refChamp={refChamp}
          refCopier={refCopier}
          onSaisie={(valeur) => agir({ type: "saisie", valeur })}
          onGenerer={() => agir({ type: "generation", motDePasse: genererMotDePasseTemporaire() })}
          onEnvoi={envoyer}
          onAnnuler={() => changerOuverture(false)}
          onCopier={copier}
        />
      </DialogContent>
    </Dialog>
  );
}

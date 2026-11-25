"use client";

import { Check, CircleAlert, Copy, LoaderCircle, RefreshCw, UserPlus } from "lucide-react";
import { useEffect, useReducer, useRef, useState, useTransition, type FormEvent, type Ref } from "react";

import { Champ } from "@/components/formulaire/champ";
import { ResumeErreurs } from "@/components/formulaire/resume-erreurs";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { afficherSucces } from "@/components/ui/sonner";
import { actionCreerCompte } from "@/server/actions/creer-compte";
import type { CompteCree } from "@/server/admin";
import { FORME_EMAIL, LIBELLES_ROLES, ROLES, type Role } from "@/shared/constantes";
import { MESSAGE_ERREUR_INATTENDUE, MESSAGES_COMPTE, MESSAGES_COMPTES } from "@/shared/messages";
import { genererMotDePasseTemporaire } from "@/shared/mot-de-passe-temporaire";
import { echec, type ErreursChamps, type Reponse } from "@/shared/reponse";
import { CHAMPS_COMPTE, validerCompte } from "@/shared/schemas/compte";

// « Créer un compte » de l'écran A1 (story 3.2 ; EXPERIENCE.md, A1 ; FR-21,
// RM-8) : le bouton principal à côté du titre « Comptes », et sa fenêtre.
//
// - Formulaire : Nom *, Email *, Rôle * (Collaborateur d'avance), Mot de
//   passe temporaire * avec « Générer » (tiré dans le navigateur, Web Crypto,
//   visible en clair), l'aide « Transmettez ce mot de passe vous-même… ».
//   Vérifié dans le navigateur par le schéma partagé pour les messages ; la
//   Server Function revérifie (AD-11).
// - Après la création : le mot de passe s'affiche une seule fois, avec
//   « Copier » (puis « Copié »), le toast « Compte créé » apparaît et le
//   tableau se met à jour (`refresh()` dans la Server Function). Un seul
//   bouton : « Fermer ».
// - Fermeture (Échap, « Annuler », « Fermer ») : le formulaire repart vierge
//   et le mot de passe est oublié. Pas de fermeture pendant l'envoi : un
//   compte créé dont le mot de passe n'aurait pas été vu serait perdu. Un
//   clic à côté de la fenêtre ne la ferme pas (saisie ou mot de passe perdus).
// - Sélection : sur « Nom » à l'ouverture, sur « Copier » après la création,
//   sur l'encadré du haut après un refus ou une panne.
//
// - `reduireCreation` : ce qui change à chaque geste (exporté, essayé seul).
// - `VueCreerCompte` : le contenu de la fenêtre, sans état.
// - `CreerCompte` : relie les deux et appelle la Server Function (AD-1).
//
// Le mot de passe n'est gardé que dans l'état de ce composant, jamais dans
// l'adresse, le stockage du navigateur ou la réponse du serveur.

export type ChampCompte = (typeof CHAMPS_COMPTE)[number];

export type ValeursCompte = {
  nom: string;
  email: string;
  role: Role;
  motDePasseTemporaire: string;
};

export const VALEURS_COMPTE_VIDES: ValeursCompte = {
  nom: "",
  email: "",
  role: "collaborateur",
  motDePasseTemporaire: "",
};

/** Identifiant de chaque champ dans la page (visé par le résumé d'erreurs). */
export const idChampCompte = (champ: ChampCompte) => `compte-${champ}`;

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export type EtatCreation = {
  valeurs: ValeursCompte;
  /** Message affiché sous chaque champ en erreur. */
  erreurs: ErreursChamps;
  /** Le résumé du haut apparaît après un envoi refusé, pas avant. */
  resumeVisible: boolean;
  /** L'envoi a échoué (panne) : encadré « Le compte n'a pas pu être créé. Réessayez. » */
  panne: boolean;
  /** Compte créé : son mot de passe temporaire, affiché une seule fois. */
  cree: (CompteCree & { motDePasseTemporaire: string }) | null;
  /** « Copier » a réussi : le bouton dit « Copié ». */
  copie: boolean;
  /** Augmente chaque fois que l'encadré du haut doit recevoir la sélection. */
  appelsEncadre: number;
};

export type ActionCreation =
  | { type: "saisie"; champ: ChampCompte; valeur: string }
  | { type: "sortie"; champ: ChampCompte }
  | { type: "generation"; motDePasse: string }
  | { type: "envoi" }
  | { type: "refus"; champs: ErreursChamps }
  | { type: "panne" }
  | { type: "reussite"; compte: CompteCree; motDePasseTemporaire: string }
  | { type: "copie" }
  | { type: "reinitialisation" };

export const ETAT_CREATION_INITIAL: EtatCreation = {
  valeurs: VALEURS_COMPTE_VIDES,
  erreurs: {},
  resumeVisible: false,
  panne: false,
  cree: null,
  copie: false,
  appelsEncadre: 0,
};

/** Erreur d'un champ selon le schéma partagé, pour les valeurs données. */
function erreurDuChamp(champ: ChampCompte, valeurs: ValeursCompte): string | undefined {
  const validation = validerCompte(valeurs);
  return validation.ok ? undefined : validation.champs[champ];
}

function avecErreur(erreurs: ErreursChamps, champ: ChampCompte, message: string | undefined): ErreursChamps {
  const suivantes = { ...erreurs };
  if (message) suivantes[champ] = message;
  else delete suivantes[champ];
  return suivantes;
}

/** Après une correction : le résumé reste tant qu'il reste une erreur. */
function apresCorrection(etat: EtatCreation, valeurs: ValeursCompte, champ: ChampCompte): EtatCreation {
  // Un message disparaît dès que le champ est corrigé ; tant qu'il ne l'est
  // pas, il dit ce qui reste à corriger.
  const erreurs = etat.erreurs[champ] ? avecErreur(etat.erreurs, champ, erreurDuChamp(champ, valeurs)) : etat.erreurs;
  return {
    ...etat,
    valeurs,
    erreurs,
    resumeVisible: etat.resumeVisible && Object.keys(erreurs).length > 0,
  };
}

export function reduireCreation(etat: EtatCreation, action: ActionCreation): EtatCreation {
  switch (action.type) {
    case "saisie":
      return apresCorrection(etat, { ...etat.valeurs, [action.champ]: action.valeur }, action.champ);
    case "generation":
      return apresCorrection(
        etat,
        { ...etat.valeurs, motDePasseTemporaire: action.motDePasse },
        "motDePasseTemporaire",
      );
    case "sortie": {
      // Seul le format de l'email est vérifié à la sortie du champ ; le reste
      // (champ vide compris) l'est à l'envoi.
      if (action.champ !== "email") return etat;
      const email = etat.valeurs.email.trim();
      if (email === "" || FORME_EMAIL.test(email)) return etat;
      return { ...etat, erreurs: avecErreur(etat.erreurs, "email", erreurDuChamp("email", etat.valeurs)) };
    }
    case "envoi":
      // La vérification du navigateur est passée : seules restaient les
      // erreurs du serveur (email déjà pris), effacées pour le nouvel envoi.
      return { ...etat, panne: false, erreurs: {}, resumeVisible: false };
    case "refus":
      return {
        ...etat,
        erreurs: action.champs,
        resumeVisible: true,
        panne: false,
        appelsEncadre: etat.appelsEncadre + 1,
      };
    case "panne":
      return { ...etat, panne: true, resumeVisible: false, appelsEncadre: etat.appelsEncadre + 1 };
    case "reussite":
      // La saisie est oubliée ; seul le compte créé et son mot de passe
      // restent, jusqu'à la fermeture de la fenêtre.
      return {
        ...ETAT_CREATION_INITIAL,
        cree: { ...action.compte, motDePasseTemporaire: action.motDePasseTemporaire },
      };
    case "copie":
      return etat.cree ? { ...etat, copie: true } : etat;
    case "reinitialisation":
      return ETAT_CREATION_INITIAL;
  }
}

/** Erreurs d'un formulaire, dans l'ordre de l'écran (résumé d'erreurs). */
export function listerErreursCompte(champs: ErreursChamps): { champ: string; message: string }[] {
  return CHAMPS_COMPTE.flatMap((champ) =>
    champs[champ] ? [{ champ: idChampCompte(champ), message: champs[champ] }] : [],
  );
}

/**
 * Ce que la fenêtre fait de la réponse de la Server Function : réussite →
 * mot de passe affiché une seule fois ; erreur de saisie ou email déjà pris
 * (avec leurs champs) → messages sous les champs ; toute autre réponse →
 * encadré de panne (message de l'UX, jamais le message technique).
 */
export function actionApresReponseCreation(
  reponse: Reponse<CompteCree>,
  motDePasseTemporaire: string,
): ActionCreation {
  if (reponse.ok) return { type: "reussite", compte: reponse.donnees, motDePasseTemporaire };
  if ((reponse.code === "VALIDATION" || reponse.code === "CONFLIT") && reponse.champs) {
    return { type: "refus", champs: reponse.champs };
  }
  return { type: "panne" };
}

/**
 * Début d'un envoi (clic sur « Créer le compte ») :
 * - verrou fermé (envoi déjà en cours, double clic) : `ignore` ;
 * - saisie refusée par le navigateur : `refus` avec ses champs, rien n'est
 *   envoyé, verrou laissé ouvert ;
 * - sinon : `envoi`, et le verrou est fermé.
 */
export function preparerEnvoiCreation(
  valeurs: ValeursCompte,
  envoiVerrouille: { current: boolean },
): { type: "ignore" } | { type: "refus"; champs: ErreursChamps } | { type: "envoi" } {
  if (envoiVerrouille.current) return { type: "ignore" };
  const validation = validerCompte(valeurs);
  if (!validation.ok) return { type: "refus", champs: validation.champs };
  envoiVerrouille.current = true;
  return { type: "envoi" };
}

/**
 * Fermeture demandée (Échap, « Annuler », « Fermer ») : refusée pendant
 * l'envoi (`null`) ; sinon l'action qui remet le formulaire à neuf et
 * oublie le mot de passe.
 */
export function actionFermeture(envoiVerrouille: { current: boolean }): ActionCreation | null {
  return envoiVerrouille.current ? null : { type: "reinitialisation" };
}

/** Ce dont l'envoi a besoin : passé en paramètre pour pouvoir être essayé seul. */
export type DependancesCreation = {
  /** Saisie déjà vérifiée par le navigateur. */
  valeurs: ValeursCompte;
  /** La Server Function (`actionCreerCompte`). */
  creer: (valeurs: ValeursCompte) => Promise<Reponse<CompteCree>>;
  agir: (action: ActionCreation) => void;
  /** Après une réussite : toast « Compte créé ». */
  apresReussite: () => void;
  /** Fermé pendant l'envoi : un second clic ne lance pas un second envoi. */
  envoiVerrouille: { current: boolean };
};

/**
 * Envoie la saisie et traite la réponse. Le verrou doit déjà être fermé et
 * l'action « envoi » appliquée. Le verrou est rouvert à la fin, quelle que
 * soit la réponse.
 */
export async function envoyerCreation({
  valeurs,
  creer,
  agir,
  apresReussite,
  envoiVerrouille,
}: DependancesCreation): Promise<void> {
  let reponse: Reponse<CompteCree>;
  try {
    reponse = await creer(valeurs);
  } catch {
    // Réseau coupé ou serveur injoignable : même message qu'une panne.
    reponse = echec("ERREUR_INTERNE", MESSAGE_ERREUR_INATTENDUE);
  }

  const suite = actionApresReponseCreation(reponse, valeurs.motDePasseTemporaire);
  agir(suite);
  envoiVerrouille.current = false;
  if (suite.type === "reussite") apresReussite();
}

// ---------------------------------------------------------------------------
// Fenêtre (sans état)
// ---------------------------------------------------------------------------

const textes = MESSAGES_COMPTES.creation;

/** Champ du mot de passe affiché après la création. */
const ID_MOT_DE_PASSE_CREE = "compte-mot-de-passe-cree";

/** Encadré de panne : rien n'est perdu, le même envoi peut être relancé. */
function EncadrePanne({ ref }: { ref?: Ref<HTMLDivElement> }) {
  return (
    <Alert ref={ref} variant="erreur" tabIndex={-1} data-slot="panne-creation" className="mb-5">
      <AlertTitle>
        <CircleAlert aria-hidden="true" />
        {MESSAGES_COMPTE.creationImpossible}
      </AlertTitle>
    </Alert>
  );
}

/** Le compte créé et son mot de passe temporaire, affiché une seule fois. */
function CompteCreeAffiche({
  cree,
  copie,
  refCopier,
  onCopier,
  onFermer,
}: {
  cree: NonNullable<EtatCreation["cree"]>;
  copie: boolean;
  refCopier?: Ref<HTMLButtonElement>;
  onCopier?: () => void;
  onFermer?: () => void;
}) {
  return (
    <div data-slot="compte-cree" className="flex flex-col">
      {/* Le toast est hors de la fenêtre, cachée aux lecteurs d'écran tant
          qu'elle est ouverte : la réussite est annoncée ici aussi. */}
      <p role="status" aria-live="polite" data-slot="annonce-compte-cree" className="sr-only">
        {textes.compteCree}
      </p>
      <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
        <dt className="text-text-muted">{textes.nom}</dt>
        <dd className="min-w-0 font-semibold break-words">{cree.nom}</dd>
        <dt className="text-text-muted">{textes.email}</dt>
        <dd className="min-w-0 break-all">{cree.email}</dd>
        <dt className="text-text-muted">{textes.role}</dt>
        <dd>{LIBELLES_ROLES[cree.role]}</dd>
      </dl>

      <Label htmlFor={ID_MOT_DE_PASSE_CREE} className="mb-1.5">
        {textes.motDePasse}
      </Label>
      <div className="flex items-center gap-2.5">
        {/* Lecture seule : il se sélectionne pour être recopié à la main. */}
        <Input
          id={ID_MOT_DE_PASSE_CREE}
          data-slot="mot-de-passe-cree"
          readOnly
          value={cree.motDePasseTemporaire}
          aria-describedby={`${ID_MOT_DE_PASSE_CREE}-aide`}
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
      <p id={`${ID_MOT_DE_PASSE_CREE}-aide`} className="mt-1.5 mb-6 text-caption text-text-muted">
        {textes.aide}
      </p>

      <DialogFooter>
        <Button data-slot="fermer" onClick={onFermer}>
          {textes.fermer}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function VueCreerCompte({
  etat,
  envoiEnCours = false,
  refEncadre,
  refNom,
  refCopier,
  onSaisie,
  onSortie,
  onGenerer,
  onEnvoi,
  onAnnuler,
  onCopier,
}: {
  etat: EtatCreation;
  envoiEnCours?: boolean;
  /** Encadré du haut (résumé d'erreurs ou panne), pour lui donner la sélection. */
  refEncadre?: Ref<HTMLDivElement>;
  /** Champ « Nom », sélectionné à l'ouverture. */
  refNom?: Ref<HTMLInputElement>;
  /** « Copier », sélectionné après la création. */
  refCopier?: Ref<HTMLButtonElement>;
  onSaisie?: (champ: ChampCompte, valeur: string) => void;
  onSortie?: (champ: ChampCompte) => void;
  onGenerer?: () => void;
  onEnvoi?: (evenement: FormEvent<HTMLFormElement>) => void;
  /** « Annuler » et « Fermer ». */
  onAnnuler?: () => void;
  onCopier?: () => void;
}) {
  const { valeurs, erreurs } = etat;
  const saisir = (champ: ChampCompte) => (valeur: string) => onSaisie?.(champ, valeur);

  return (
    <>
      <DialogTitle>{textes.titre}</DialogTitle>

      {etat.cree ? (
        <CompteCreeAffiche
          cree={etat.cree}
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
          data-slot="formulaire-compte"
          className="mt-3 flex flex-col"
        >
          {etat.panne ? (
            <EncadrePanne ref={refEncadre} />
          ) : etat.resumeVisible ? (
            <ResumeErreurs ref={refEncadre} erreurs={listerErreursCompte(erreurs)} className="mb-5" />
          ) : null}

          {/* Pendant l'envoi, la saisie est figée. */}
          <fieldset disabled={envoiEnCours} className="mb-6 flex min-w-0 flex-col gap-4">
            <Champ id={idChampCompte("nom")} etiquette={textes.nom} obligatoire erreur={erreurs.nom}>
              <Input
                ref={refNom}
                name="nom"
                autoComplete="off"
                value={valeurs.nom}
                onChange={(e) => saisir("nom")(e.target.value)}
              />
            </Champ>
            <Champ id={idChampCompte("email")} etiquette={textes.email} obligatoire erreur={erreurs.email}>
              <Input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={valeurs.email}
                onChange={(e) => saisir("email")(e.target.value)}
                onBlur={() => onSortie?.("email")}
              />
            </Champ>
            <Champ id={idChampCompte("role")} etiquette={textes.role} obligatoire erreur={erreurs.role}>
              <NativeSelect name="role" value={valeurs.role} onChange={(e) => saisir("role")(e.target.value)}>
                {ROLES.map((role) => (
                  <NativeSelectOption key={role} value={role}>
                    {LIBELLES_ROLES[role]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Champ>
            <Champ
              id={idChampCompte("motDePasseTemporaire")}
              etiquette={textes.motDePasse}
              obligatoire
              erreur={erreurs.motDePasseTemporaire}
              aide={textes.aide}
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
                name="motDePasseTemporaire"
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="font-mono"
                value={valeurs.motDePasseTemporaire}
                onChange={(e) => saisir("motDePasseTemporaire")(e.target.value)}
              />
            </Champ>
          </fieldset>

          <DialogFooter>
            <Button variant="secondaire" data-slot="annuler" disabled={envoiEnCours} onClick={onAnnuler}>
              {textes.annuler}
            </Button>
            {/* Actif tant qu'aucun envoi n'est en cours : la saisie est
                vérifiée au clic, le bouton n'est jamais grisé d'avance. */}
            <Button type="submit" disabled={envoiEnCours}>
              {envoiEnCours ? (
                <>
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                  {textes.creationEnCours}
                </>
              ) : (
                textes.creerLeCompte
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

export function CreerCompte() {
  const [ouverte, setOuverte] = useState(false);
  const [etat, agir] = useReducer(reduireCreation, ETAT_CREATION_INITIAL);
  const [envoiEnCours, demarrerEnvoi] = useTransition();
  // Un second clic avant la réponse ne lance pas un second envoi.
  const envoiVerrouille = useRef(false);
  const refEncadre = useRef<HTMLDivElement>(null);
  const refNom = useRef<HTMLInputElement>(null);
  const refCopier = useRef<HTMLButtonElement>(null);

  // Après un envoi refusé ou une panne, la sélection passe à l'encadré du
  // haut : il est lu par les lecteurs d'écran.
  useEffect(() => {
    if (etat.appelsEncadre > 0) refEncadre.current?.focus();
  }, [etat.appelsEncadre]);

  // Après la création, la sélection passe à « Copier ».
  const compteCree = etat.cree !== null;
  useEffect(() => {
    if (compteCree) refCopier.current?.focus();
  }, [compteCree]);

  function changerOuverture(ouvrir: boolean) {
    if (!ouvrir) {
      // Pas de fermeture pendant l'envoi ; sinon, formulaire vierge et mot
      // de passe oublié.
      const fermeture = actionFermeture(envoiVerrouille);
      if (!fermeture) return;
      agir(fermeture);
    }
    setOuverte(ouvrir);
  }

  function envoyer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const debut = preparerEnvoiCreation(etat.valeurs, envoiVerrouille);
    if (debut.type === "ignore") return;
    if (debut.type === "refus") {
      agir({ type: "refus", champs: debut.champs });
      return;
    }

    agir({ type: "envoi" });
    const valeurs = etat.valeurs;
    demarrerEnvoi(() =>
      envoyerCreation({
        valeurs,
        creer: actionCreerCompte,
        agir,
        apresReussite: () => afficherSucces(textes.compteCree),
        envoiVerrouille,
      }),
    );
  }

  async function copier() {
    if (!etat.cree) return;
    try {
      await navigator.clipboard.writeText(etat.cree.motDePasseTemporaire);
      agir({ type: "copie" });
    } catch {
      // Presse-papiers refusé : le mot de passe reste affiché, à recopier.
    }
  }

  return (
    <Dialog open={ouverte} onOpenChange={changerOuverture}>
      <DialogTrigger asChild>
        <Button data-slot="bouton-creer-compte">
          <UserPlus aria-hidden="true" />
          {MESSAGES_COMPTES.creerUnCompte}
        </Button>
      </DialogTrigger>
      <DialogContent
        // Le texte d'aide est relié au champ du mot de passe, pas à la fenêtre.
        aria-describedby={undefined}
        onOpenAutoFocus={(evenement) => {
          evenement.preventDefault();
          refNom.current?.focus();
        }}
        onInteractOutside={(evenement) => evenement.preventDefault()}
      >
        <VueCreerCompte
          etat={etat}
          envoiEnCours={envoiEnCours}
          refEncadre={refEncadre}
          refNom={refNom}
          refCopier={refCopier}
          onSaisie={(champ, valeur) => agir({ type: "saisie", champ, valeur })}
          onSortie={(champ) => agir({ type: "sortie", champ })}
          onGenerer={() => agir({ type: "generation", motDePasse: genererMotDePasseTemporaire() })}
          onEnvoi={envoyer}
          onAnnuler={() => changerOuverture(false)}
          onCopier={copier}
        />
      </DialogContent>
    </Dialog>
  );
}

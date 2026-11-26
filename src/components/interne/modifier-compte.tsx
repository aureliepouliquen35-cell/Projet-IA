"use client";

import { CircleAlert, LoaderCircle, Pencil } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useEffect, useEffectEvent, useReducer, useRef, useState, useTransition, type FormEvent, type Ref } from "react";

import { Champ } from "@/components/formulaire/champ";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { afficherSucces } from "@/components/ui/sonner";
import { actionModifierCompte } from "@/server/actions/modifier-compte";
import type { CompteModifie } from "@/server/admin";
import { LIBELLES_ROLES, ROLES, type Role } from "@/shared/constantes";
import { MESSAGES_ACCES_REFUSE, MESSAGES_COMPTE, MESSAGES_COMPTES } from "@/shared/messages";
import { echec, type ErreursChamps, type Reponse } from "@/shared/reponse";
import { validerModificationCompte } from "@/shared/schemas/compte";

// « Modifier » de la colonne Actions de l'écran A1, en premier (story 3.3 ;
// EXPERIENCE.md, A1 ; FR-22, FR-25, RM-9) : un bouton sur chaque ligne, et
// sa fenêtre.
//
// - Fenêtre « Modifier le compte de Lucas Bernard » : Nom * (prérempli),
//   l'email affiché en texte (il ne peut pas être modifié), Rôle * (liste,
//   comme à la création) ; boutons « Annuler » et « Enregistrer »
//   (« Enregistrement… » pendant l'envoi). Nom vide ou trop long : message
//   sous le champ (textes de la création), rien n'est envoyé (schéma
//   partagé ; la Server Function revérifie, AD-11).
// - Réussite (même sans rien changer) : fenêtre fermée, toast « Compte
//   modifié » ; le tableau se met à jour par `refresh()` dans la Server
//   Function. Un administrateur qui se passe lui-même collaborateur voit
//   ensuite S1 et son menu sans Administration.
// - Dernier administrateur actif : « Impossible : il doit rester au moins un
//   administrateur actif. » dans la fenêtre, qui reste ouverte ; rien ne
//   change. Panne : « Le compte n'a pas pu être modifié. Réessayez. », saisie
//   gardée.
// - Accès refusé (administrateur rétrogradé entre-temps) : la Server
//   Function recalcule la page (`refresh()`), qui devient S1 ; la fenêtre
//   disparaît avec le tableau. Compte introuvable : le tableau recalculé
//   montre l'état réel. Dans les deux cas, l'encadré de la fenêtre n'est
//   pas ce que l'utilisateur voit.
// - Fermeture (Échap, « Annuler ») : la saisie est oubliée (les valeurs
//   restent affichées pendant l'animation de fermeture, puis sont rechargées
//   depuis le compte à la réouverture). Pas de fermeture
//   pendant l'envoi, ni par un clic à côté de la fenêtre. Un double clic
//   n'envoie qu'une fois (AD-20).
// - Sélection : sur le champ Nom à l'ouverture et après un refus, sur
//   l'encadré après un refus du serveur ou une panne.
//
// - `reduireModification` : ce qui change à chaque geste (exporté, essayé
//   seul) ; `preparerEnvoiModification`, `envoyerModification`,
//   `actionApresReponseModification`, `changerOuvertureModification` :
//   l'envoi, l'ouverture et la fermeture, essayés seuls.
// - `VueModifierCompte` : le contenu de la fenêtre, sans état.
// - `ModifierCompte` : le bouton, la fenêtre et la Server Function.

/** Ce que la ligne montre du compte. */
export type CompteModification = { id: string; nom: string; email: string; role: Role };

/** Champs modifiables, dans l'ordre de la fenêtre. */
export type ChampModification = "nom" | "role";

export type ValeursModification = { nom: string; role: Role };

/** Identifiant d'un champ de la fenêtre, unique sur la page (une fenêtre par ligne). */
export const idChampModification = (compteId: string, champ: ChampModification) => `modifier-${compteId}-${champ}`;

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export type EtatModification = {
  valeurs: ValeursModification;
  /** Message sous chaque champ en erreur. */
  erreurs: ErreursChamps;
  /**
   * L'envoi a été refusé ou a échoué : message de l'encadré (dernier
   * administrateur, « Accès refusé. », panne), saisie gardée ; `null` sinon.
   */
  panne: string | null;
  /** Augmente chaque fois que l'encadré doit recevoir la sélection. */
  appelsEncadre: number;
  /** Augmente chaque fois qu'un champ en erreur doit recevoir la sélection. */
  appelsChamp: number;
};

export type ActionModification =
  | { type: "ouverture"; valeurs: ValeursModification }
  | { type: "saisie"; champ: ChampModification; valeur: string }
  | { type: "envoi" }
  | { type: "refus"; champs: ErreursChamps }
  | { type: "panne"; message: string }
  | { type: "reussite" }
  | { type: "reinitialisation" };

export const ETAT_MODIFICATION_INITIAL: EtatModification = {
  valeurs: { nom: "", role: "collaborateur" },
  erreurs: {},
  panne: null,
  appelsEncadre: 0,
  appelsChamp: 0,
};

/** Valeurs de départ de la fenêtre : celles du compte. */
export const valeursDuCompte = (compte: CompteModification): ValeursModification => ({
  nom: compte.nom,
  role: compte.role,
});

/** Erreurs des champs modifiables selon le schéma partagé (l'identifiant n'est pas un champ). */
function erreursDesValeurs(valeurs: ValeursModification): ErreursChamps {
  // Un identifiant valide quelconque : seul le nom et le rôle sont vérifiés ici.
  const validation = validerModificationCompte({ compteId: "00000000-0000-4000-8000-000000000000", ...valeurs });
  if (validation.ok) return {};
  const erreurs: ErreursChamps = {};
  if (validation.champs.nom) erreurs.nom = validation.champs.nom;
  if (validation.champs.role) erreurs.role = validation.champs.role;
  return erreurs;
}

export function reduireModification(etat: EtatModification, action: ActionModification): EtatModification {
  switch (action.type) {
    case "ouverture":
      return { ...ETAT_MODIFICATION_INITIAL, valeurs: action.valeurs };
    case "saisie": {
      const valeurs = { ...etat.valeurs, [action.champ]: action.valeur } as ValeursModification;
      // Un message affiché disparaît dès que le champ est corrigé ; tant
      // qu'il ne l'est pas, il dit ce qui reste à corriger.
      const erreurs = { ...etat.erreurs };
      if (erreurs[action.champ]) {
        const message = erreursDesValeurs(valeurs)[action.champ];
        if (message) erreurs[action.champ] = message;
        else delete erreurs[action.champ];
      }
      return { ...etat, valeurs, erreurs };
    }
    case "envoi":
      return { ...etat, erreurs: {}, panne: null };
    case "refus":
      return { ...etat, erreurs: action.champs, panne: null, appelsChamp: etat.appelsChamp + 1 };
    case "panne":
      return { ...etat, panne: action.message, appelsEncadre: etat.appelsEncadre + 1 };
    case "reussite":
    case "reinitialisation":
      // Messages oubliés ; les valeurs restent affichées pendant l'animation
      // de fermeture (l'ouverture suivante les recharge depuis le compte).
      return { ...ETAT_MODIFICATION_INITIAL, valeurs: etat.valeurs };
  }
}

/**
 * Début d'un envoi (clic sur « Enregistrer ») :
 * - verrou fermé (envoi déjà en cours, double clic) : `ignore` ;
 * - nom ou rôle refusé par le schéma partagé : `refus` avec les messages,
 *   rien n'est envoyé, verrou laissé ouvert ;
 * - sinon : `envoi`, et le verrou est fermé.
 */
export function preparerEnvoiModification(
  valeurs: ValeursModification,
  envoiVerrouille: { current: boolean },
): { type: "ignore" } | { type: "refus"; champs: ErreursChamps } | { type: "envoi" } {
  if (envoiVerrouille.current) return { type: "ignore" };
  const erreurs = erreursDesValeurs(valeurs);
  if (Object.keys(erreurs).length > 0) return { type: "refus", champs: erreurs };
  envoiVerrouille.current = true;
  return { type: "envoi" };
}

/**
 * Ce que la fenêtre fait de la réponse de la Server Function. Les textes
 * affichés sont ceux de l'UX, jamais un message technique :
 * - réussite : fenêtre fermée, toast ;
 * - nom ou rôle refusé par le serveur : messages sous les champs ;
 * - dernier administrateur : le message exact dans l'encadré ;
 * - accès refusé : « Accès refusé. » dans l'encadré (en pratique, la page
 *   recalculée par la Server Function devient aussitôt S1) ;
 * - toute autre réponse : « Le compte n'a pas pu être modifié. Réessayez. ».
 */
export function actionApresReponseModification(reponse: Reponse<CompteModifie>): ActionModification {
  if (reponse.ok) return { type: "reussite" };
  if (reponse.code === "VALIDATION" && (reponse.champs?.nom || reponse.champs?.role)) {
    const champs: ErreursChamps = {};
    if (reponse.champs.nom) champs.nom = reponse.champs.nom;
    if (reponse.champs.role) champs.role = reponse.champs.role;
    return { type: "refus", champs };
  }
  if (reponse.code === "CONFLIT") return { type: "panne", message: MESSAGES_COMPTE.dernierAdministrateur };
  if (reponse.code === "ACCES_REFUSE") return { type: "panne", message: MESSAGES_ACCES_REFUSE.action };
  return { type: "panne", message: MESSAGES_COMPTE.modificationImpossible };
}

/**
 * Ouverture ou fermeture demandée (bouton de la ligne, Échap, « Annuler ») :
 * - ouverture : la saisie repart des valeurs actuelles du compte ;
 * - fermeture pendant l'envoi : ignorée (la réponse doit pouvoir s'afficher) ;
 * - fermeture hors envoi : la saisie est oubliée, puis la fenêtre se ferme.
 */
export function changerOuvertureModification(
  ouvrir: boolean,
  compte: CompteModification,
  envoiVerrouille: { current: boolean },
  deps: { agir: (action: ActionModification) => void; setOuverte: (ouverte: boolean) => void },
): void {
  if (ouvrir) {
    deps.agir({ type: "ouverture", valeurs: valeursDuCompte(compte) });
  } else {
    if (envoiVerrouille.current) return;
    deps.agir({ type: "reinitialisation" });
  }
  deps.setOuverte(ouvrir);
}

/** Ce dont l'envoi a besoin : passé en paramètre pour pouvoir être essayé seul. */
export type DependancesModification = {
  compteId: string;
  /** Nom et rôle déjà vérifiés par le navigateur. */
  valeurs: ValeursModification;
  /** La Server Function (`actionModifierCompte`). */
  modifier: (saisie: { compteId: string; nom: string; role: Role }) => Promise<Reponse<CompteModifie>>;
  agir: (action: ActionModification) => void;
  /** Après une réussite : fenêtre fermée, toast « Compte modifié ». */
  apresReussite: () => void;
  /** Fermé pendant l'envoi : un second clic ne lance pas un second envoi. */
  envoiVerrouille: { current: boolean };
};

/**
 * Envoie le nom et le rôle et traite la réponse. Le verrou doit déjà être
 * fermé et l'action « envoi » appliquée. Le verrou est rouvert à la fin,
 * quelle que soit la réponse. Un réseau coupé donne la même suite qu'une
 * panne ; une redirection du serveur (session terminée) est relancée pour
 * que Next.js change de page.
 */
export async function envoyerModification({
  compteId,
  valeurs,
  modifier,
  agir,
  apresReussite,
  envoiVerrouille,
}: DependancesModification): Promise<void> {
  let reponse: Reponse<CompteModifie>;
  try {
    reponse = await modifier({ compteId, nom: valeurs.nom, role: valeurs.role });
  } catch (erreur) {
    try {
      unstable_rethrow(erreur);
    } catch (redirection) {
      envoiVerrouille.current = false;
      throw redirection;
    }
    reponse = echec("ERREUR_INTERNE", MESSAGES_COMPTE.modificationImpossible);
  }

  const suite = actionApresReponseModification(reponse);
  agir(suite);
  envoiVerrouille.current = false;
  if (suite.type === "reussite") apresReussite();
}

// ---------------------------------------------------------------------------
// Fenêtre (sans état)
// ---------------------------------------------------------------------------

const textes = MESSAGES_COMPTES.modification;

/** Encadré du refus ou de la panne : rien n'est perdu, le même envoi peut être relancé. */
function EncadrePanne({ message, ref }: { message: string; ref?: Ref<HTMLDivElement> }) {
  return (
    <Alert ref={ref} variant="erreur" tabIndex={-1} data-slot="panne-modification" className="mb-5">
      <AlertTitle>
        <CircleAlert aria-hidden="true" />
        {message}
      </AlertTitle>
    </Alert>
  );
}

export function VueModifierCompte({
  compte,
  etat,
  envoiEnCours = false,
  refEncadre,
  refNom,
  refRole,
  onSaisie,
  onEnvoi,
  onAnnuler,
}: {
  compte: CompteModification;
  etat: EtatModification;
  envoiEnCours?: boolean;
  /** Encadré du refus ou de la panne, pour lui donner la sélection. */
  refEncadre?: Ref<HTMLDivElement>;
  /** Champ Nom, sélectionné à l'ouverture et après un refus. */
  refNom?: Ref<HTMLInputElement>;
  /** Liste Rôle, sélectionnée après un refus qui ne touche qu'elle. */
  refRole?: Ref<HTMLSelectElement>;
  onSaisie?: (champ: ChampModification, valeur: string) => void;
  onEnvoi?: (evenement: FormEvent<HTMLFormElement>) => void;
  onAnnuler?: () => void;
}) {
  const { valeurs, erreurs } = etat;

  return (
    <>
      <DialogTitle>{textes.titre(compte.nom)}</DialogTitle>

      <form
        noValidate // Les messages sont ceux de l'UX, pas ceux du navigateur.
        onSubmit={onEnvoi}
        aria-busy={envoiEnCours || undefined}
        data-slot="formulaire-modification"
        className="mt-3 flex flex-col"
      >
        {etat.panne ? <EncadrePanne message={etat.panne} ref={refEncadre} /> : null}

        {/* Pendant l'envoi, la saisie est figée. */}
        <fieldset disabled={envoiEnCours} className="mb-6 flex min-w-0 flex-col gap-4">
          <Champ id={idChampModification(compte.id, "nom")} etiquette={textes.nom} obligatoire erreur={erreurs.nom}>
            <Input
              ref={refNom}
              name="nom"
              autoComplete="off"
              value={valeurs.nom}
              onChange={(e) => onSaisie?.("nom", e.target.value)}
            />
          </Champ>

          {/* L'email est affiché, jamais modifiable (FR-22) : du texte, pas un champ. */}
          <dl data-slot="email-compte" className="flex flex-col">
            <dt className="mb-1.5 text-label font-semibold text-text">{textes.email}</dt>
            <dd className="text-body-sm break-all text-text-muted">{compte.email}</dd>
          </dl>

          <Champ id={idChampModification(compte.id, "role")} etiquette={textes.role} obligatoire erreur={erreurs.role}>
            <NativeSelect ref={refRole} name="role" value={valeurs.role} onChange={(e) => onSaisie?.("role", e.target.value)}>
              {ROLES.map((role) => (
                <NativeSelectOption key={role} value={role}>
                  {LIBELLES_ROLES[role]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Champ>
        </fieldset>

        <DialogFooter>
          <Button variant="secondaire" data-slot="annuler" disabled={envoiEnCours} onClick={onAnnuler}>
            {textes.annuler}
          </Button>
          {/* Actif tant qu'aucun envoi n'est en cours : la saisie est
              vérifiée au clic, le bouton n'est jamais grisé d'avance. */}
          <Button type="submit" data-slot="enregistrer-modification" disabled={envoiEnCours}>
            {envoiEnCours ? (
              <>
                <LoaderCircle aria-hidden="true" className="animate-spin" />
                {textes.enregistrementEnCours}
              </>
            ) : (
              textes.enregistrer
            )}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
// Bouton et fenêtre (avec état)
// ---------------------------------------------------------------------------

export function ModifierCompte({ compte }: { compte: CompteModification }) {
  const [ouverte, setOuverte] = useState(false);
  const [etat, agir] = useReducer(reduireModification, ETAT_MODIFICATION_INITIAL);
  const [envoiEnCours, demarrerEnvoi] = useTransition();
  // Un second clic avant la réponse ne lance pas un second envoi.
  const envoiVerrouille = useRef(false);
  const refEncadre = useRef<HTMLDivElement>(null);
  const refNom = useRef<HTMLInputElement>(null);
  const refRole = useRef<HTMLSelectElement>(null);

  // Après un refus du serveur ou une panne, la sélection passe à l'encadré :
  // il est lu par les lecteurs d'écran.
  useEffect(() => {
    if (etat.appelsEncadre > 0) refEncadre.current?.focus();
  }, [etat.appelsEncadre]);

  // Après un refus de la saisie, la sélection revient au premier champ en
  // erreur, qui annonce son message. Seulement à chaque refus : une saisie
  // qui corrige le nom ne déplace pas la sélection.
  const selectionnerChampEnErreur = useEffectEvent(() => {
    if (etat.erreurs.nom) refNom.current?.focus();
    else refRole.current?.focus();
  });
  useEffect(() => {
    if (etat.appelsChamp > 0) selectionnerChampEnErreur();
  }, [etat.appelsChamp]);

  function changerOuverture(ouvrir: boolean) {
    changerOuvertureModification(ouvrir, compte, envoiVerrouille, { agir, setOuverte });
  }

  function envoyer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const debut = preparerEnvoiModification(etat.valeurs, envoiVerrouille);
    if (debut.type === "ignore") return;
    if (debut.type === "refus") {
      agir({ type: "refus", champs: debut.champs });
      return;
    }

    agir({ type: "envoi" });
    const valeurs = etat.valeurs;
    demarrerEnvoi(() =>
      envoyerModification({
        compteId: compte.id,
        valeurs,
        modifier: actionModifierCompte,
        agir,
        apresReussite: () => {
          setOuverte(false);
          afficherSucces(textes.compteModifie);
        },
        envoiVerrouille,
      }),
    );
  }

  return (
    <Dialog open={ouverte} onOpenChange={changerOuverture}>
      <DialogTrigger asChild>
        <Button variant="secondaire" size="sm" data-slot="modifier-compte" aria-label={textes.boutonNom(compte.nom)}>
          <Pencil aria-hidden="true" />
          {textes.bouton}
        </Button>
      </DialogTrigger>
      <DialogContent
        data-slot="fenetre-modifier-compte"
        aria-describedby={undefined}
        onOpenAutoFocus={(evenement) => {
          evenement.preventDefault();
          refNom.current?.focus();
        }}
        onInteractOutside={(evenement) => evenement.preventDefault()}
      >
        <VueModifierCompte
          compte={compte}
          etat={etat}
          envoiEnCours={envoiEnCours}
          refEncadre={refEncadre}
          refNom={refNom}
          refRole={refRole}
          onSaisie={(champ, valeur) => agir({ type: "saisie", champ, valeur })}
          onEnvoi={envoyer}
          onAnnuler={() => changerOuverture(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

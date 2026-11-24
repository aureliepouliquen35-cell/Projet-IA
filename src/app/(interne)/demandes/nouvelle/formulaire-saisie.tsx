"use client";

import {
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef, useTransition, type FormEvent, type ReactNode, type Ref } from "react";

import { Champ, ChampCase } from "@/components/formulaire/champ";
import { MentionDonnees } from "@/components/formulaire/mention-donnees";
import { ResumeErreurs } from "@/components/formulaire/resume-erreurs";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { afficherSucces } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { actionSaisirDemande } from "@/server/actions/saisir-demande";
import { adresseDetail } from "@/shared/adresse-liste";
import {
  CANAUX_SAISIE,
  compterCaracteres,
  FORME_EMAIL,
  LONGUEUR_MINIMALE_DESCRIPTION,
  LONGUEURS_MAXIMALES,
  type CanalSaisie,
} from "@/shared/constantes";
import { LIBELLES_CANAUX } from "@/shared/libelles";
import { MESSAGE_ERREUR_INATTENDUE, MESSAGES_SAISIE, messageDemandeCreee } from "@/shared/messages";
import { nouveauNumeroEnvoi } from "@/shared/numero-envoi";
import { echec, type ErreursChamps, type Reponse } from "@/shared/reponse";
import {
  erreurDuChampSaisie,
  listerErreursSaisie,
  validerSaisieInterne,
  VALEURS_SAISIE_VIDES,
  type ChampSaisie,
  type ValeursSaisie,
} from "@/shared/schemas/saisie";

// Formulaire de l'écran I5 « Nouvelle demande » (EXPERIENCE.md, FR-30) :
// le formulaire public P1, avec en plus le canal (en premier) et la case
// « La personne a été informée de l'usage de ses données », dont le lien
// « Texte à lui lire » déplie la mention de P1.
//
// - `reduireSaisie` : ce qui change à chaque geste (saisie, sortie d'un
//   champ, envoi refusé, panne, réussite). Rien de saisi n'y est effacé,
//   sauf après une réussite : le formulaire repart vierge.
// - `VueFormulaireSaisie` : l'écran, sans état.
// - `FormulaireSaisie` : relie les deux, appelle la Server Function (AD-1)
//   avec le numéro d'envoi (AD-20), puis, à la réussite, affiche le toast
//   « Demande NOVA-… créée » et passe au détail I4 de la demande. Le toast
//   est posé dans le navigateur juste avant le changement de page : le
//   `Toaster` du layout racine le garde à l'écran. Rien ne passe par
//   l'adresse, à part la référence de la page de détail.
//
// Les champs sont contrôlés et l'envoi passe par `onSubmit` : avec
// `<form action>`, React 19 viderait les champs après l'action.

type Categorie = { id: string; nom: string };

/** Identifiant de la mention dépliée par « Texte à lui lire ». */
const ID_TEXTE_A_LIRE = "texte-a-lire";

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export type EtatSaisie = {
  valeurs: ValeursSaisie;
  /** Message affiché sous chaque champ en erreur. */
  erreurs: ErreursChamps;
  /** Le résumé du haut apparaît après un envoi refusé, pas avant. */
  resumeVisible: boolean;
  /** L'envoi a échoué (panne) : encadré « La demande n'a pas pu être enregistrée. » */
  panne: boolean;
  /** Demande enregistrée, passage au détail en cours : le formulaire reste figé. */
  redirection: boolean;
  /** « Texte à lui lire » déplié. */
  texteOuvert: boolean;
  /** Augmente chaque fois que l'encadré du haut doit recevoir la sélection. */
  appelsEncadre: number;
};

export type ActionSaisie =
  | { type: "saisie"; champ: ChampSaisie; valeur: string | boolean }
  | { type: "sortie"; champ: ChampSaisie }
  | { type: "texte" }
  | { type: "envoi" }
  | { type: "refus"; champs: ErreursChamps }
  | { type: "panne" }
  | { type: "reussite"; reference: string }
  | { type: "reinitialisation" };

export const ETAT_SAISIE_INITIAL: EtatSaisie = {
  valeurs: VALEURS_SAISIE_VIDES,
  erreurs: {},
  resumeVisible: false,
  panne: false,
  redirection: false,
  texteOuvert: false,
  appelsEncadre: 0,
};

function avecErreur(erreurs: ErreursChamps, champ: ChampSaisie, message: string | undefined): ErreursChamps {
  const suivantes = { ...erreurs };
  if (message) suivantes[champ] = message;
  else delete suivantes[champ];
  return suivantes;
}

export function reduireSaisie(etat: EtatSaisie, action: ActionSaisie): EtatSaisie {
  switch (action.type) {
    case "saisie": {
      const valeurs = { ...etat.valeurs, [action.champ]: action.valeur };
      // Un message d'erreur disparaît dès que le champ est corrigé ; tant
      // qu'il ne l'est pas, il dit ce qui reste à corriger.
      const erreurs = etat.erreurs[action.champ]
        ? avecErreur(etat.erreurs, action.champ, erreurDuChampSaisie(action.champ, valeurs))
        : etat.erreurs;
      return {
        ...etat,
        valeurs,
        erreurs,
        resumeVisible: etat.resumeVisible && Object.keys(erreurs).length > 0,
      };
    }
    case "sortie": {
      // Seul le format de l'email est vérifié à la sortie du champ ; tout le
      // reste (champ vide compris) l'est à l'envoi.
      if (action.champ !== "email") return etat;
      const email = etat.valeurs.email.trim();
      if (email === "" || FORME_EMAIL.test(email)) return etat;
      return { ...etat, erreurs: avecErreur(etat.erreurs, "email", erreurDuChampSaisie("email", etat.valeurs)) };
    }
    case "texte":
      return { ...etat, texteOuvert: !etat.texteOuvert };
    case "envoi":
      return { ...etat, panne: false };
    case "refus":
      return {
        ...etat,
        erreurs: action.champs,
        resumeVisible: true,
        panne: false,
        appelsEncadre: etat.appelsEncadre + 1,
      };
    case "panne":
      return { ...etat, panne: true, appelsEncadre: etat.appelsEncadre + 1 };
    case "reussite":
      // La saisie reste affichée, figée, jusqu'à l'arrivée du détail.
      return { ...etat, panne: false, redirection: true };
    case "reinitialisation":
      // Appliquée avec le passage au détail : un retour arrière retrouve un
      // formulaire vierge, prêt pour une autre demande.
      return ETAT_SAISIE_INITIAL;
  }
}

/**
 * Ce que le formulaire fait de la réponse de la Server Function :
 * réussite → toast et détail ; erreur de saisie avec ses champs → résumé
 * d'erreurs ; toute autre réponse → encadré de panne (message de l'UX,
 * jamais le message technique de la réponse).
 */
export function actionApresReponseSaisie(reponse: Reponse<{ reference: string }>): ActionSaisie {
  if (reponse.ok) return { type: "reussite", reference: reponse.donnees.reference };
  if (reponse.code === "VALIDATION" && reponse.champs) return { type: "refus", champs: reponse.champs };
  return { type: "panne" };
}

/** Ce dont l'envoi a besoin : passé en paramètre pour pouvoir être essayé seul. */
export type DependancesSaisie = {
  /** Saisie déjà vérifiée par le navigateur. */
  valeurs: ValeursSaisie;
  /** La Server Function (`actionSaisirDemande`). */
  saisir: (valeurs: ValeursSaisie, numeroEnvoi: string) => Promise<Reponse<{ reference: string }>>;
  agir: (action: ActionSaisie) => void;
  /** Après une réussite : toast puis passage au détail de la demande. */
  apresReussite: (reference: string) => void;
  /** Lance une mise à jour non urgente (`startTransition`). */
  enTransition: (miseAJour: () => void) => void;
  /** Numéro d'envoi du formulaire affiché, tiré à son affichage. */
  numeroEnvoi: { current: string | null };
  /** Fermé pendant l'envoi : un second clic ne lance pas un second envoi. */
  envoiVerrouille: { current: boolean };
  tirer?: () => string;
};

/**
 * Envoie la saisie et traite la réponse (AD-1, AD-20). Le verrou doit déjà
 * être fermé et l'action « envoi » appliquée.
 *
 * - Échec (refus, panne, appel qui lève une exception) : l'action
 *   correspondante, le **même** numéro d'envoi pour le prochain essai (une
 *   demande arrivée malgré une réponse perdue n'est pas créée deux fois),
 *   verrou ouvert.
 * - Réussite : formulaire figé, nouveau numéro d'envoi, puis, ensemble, le
 *   formulaire vierge (verrou ouvert), le toast et le passage au détail.
 */
export async function envoyerSaisie({
  valeurs,
  saisir,
  agir,
  apresReussite,
  enTransition,
  numeroEnvoi,
  envoiVerrouille,
  tirer = nouveauNumeroEnvoi,
}: DependancesSaisie): Promise<void> {
  // Normalement tiré à l'affichage ; au cas où l'envoi le précéderait.
  numeroEnvoi.current ??= tirer();
  const numero = numeroEnvoi.current;

  let reponse: Reponse<{ reference: string }>;
  try {
    reponse = await saisir(valeurs, numero);
  } catch {
    // Réseau coupé ou serveur injoignable : même message qu'une panne.
    reponse = echec("ERREUR_INTERNE", MESSAGE_ERREUR_INATTENDUE);
  }

  const suite = actionApresReponseSaisie(reponse);
  agir(suite);
  if (suite.type !== "reussite") {
    envoiVerrouille.current = false;
    return;
  }

  numeroEnvoi.current = tirer();
  enTransition(() => {
    agir({ type: "reinitialisation" });
    envoiVerrouille.current = false;
    apresReussite(suite.reference);
  });
}

// ---------------------------------------------------------------------------
// Écran (sans état)
// ---------------------------------------------------------------------------

/** Astérisque des champs obligatoires (le contrôle porte aussi `required`). */
const Asterisque = () => (
  <span aria-hidden="true" className="text-danger">
    {" *"}
  </span>
);

const ICONES_CANAUX: Record<CanalSaisie, ReactNode> = {
  telephone: <Phone aria-hidden="true" className="size-4 text-text-muted" />,
  email: <Mail aria-hidden="true" className="size-4 text-text-muted" />,
};

/**
 * Identifiant de chaque bouton radio du canal. Le premier porte `canal` :
 * c'est lui que vise le lien du résumé d'erreurs.
 */
export const idCanal = (canal: CanalSaisie) => (canal === CANAUX_SAISIE[0] ? "canal" : `canal-${canal}`);

/**
 * Choix du canal (FR-30) : deux boutons radio, aucun choisi d'avance, chacun
 * avec son libellé cliquable. Le message d'erreur est relié aux deux.
 */
function ChoixCanal({
  valeur,
  erreur,
  desactive,
  onChoix,
}: {
  valeur: ValeursSaisie["canal"];
  erreur?: string;
  desactive: boolean;
  onChoix?: (canal: CanalSaisie) => void;
}) {
  return (
    <fieldset disabled={desactive} data-slot="choix-canal" className="mb-6 flex min-w-0 flex-col">
      <legend className="mb-1.5 text-label text-text">
        {MESSAGES_SAISIE.canal}
        <Asterisque />
      </legend>
      <div className="grid grid-cols-2 gap-3">
        {CANAUX_SAISIE.map((canal) => (
          <label
            key={canal}
            htmlFor={idCanal(canal)}
            className={cn(
              "flex h-control cursor-pointer items-center gap-2.5 rounded-sm border border-border-input bg-background px-3 text-body text-text has-checked:border-primary has-checked:bg-primary-soft has-disabled:cursor-not-allowed has-disabled:opacity-50",
              erreur && "border-2 border-danger px-[11px]",
            )}
          >
            <input
              type="radio"
              id={idCanal(canal)}
              name="canal"
              value={canal}
              required
              checked={valeur === canal}
              onChange={() => onChoix?.(canal)}
              // `aria-invalid` n'est pas permis sur un bouton radio : le
              // message d'erreur lui est relié.
              aria-describedby={erreur ? "canal-erreur" : undefined}
              className="size-4.5 shrink-0 accent-primary"
            />
            {ICONES_CANAUX[canal]}
            {LIBELLES_CANAUX[canal]}
          </label>
        ))}
      </div>
      <div aria-live="polite">
        {erreur ? (
          <p
            id="canal-erreur"
            data-slot="erreur-champ"
            className="mt-1.5 flex items-start gap-1.5 text-caption font-medium text-danger"
          >
            <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" />
            {erreur}
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}

/** Encadré de panne : rien n'est perdu, le même envoi peut être relancé. */
function EncadrePanne({ ref }: { ref?: Ref<HTMLDivElement> }) {
  return (
    <Alert ref={ref} variant="erreur" tabIndex={-1} data-slot="panne-saisie" className="mb-5">
      <AlertTitle>
        <CircleAlert aria-hidden="true" />
        {MESSAGES_SAISIE.panne}
      </AlertTitle>
    </Alert>
  );
}

export function VueFormulaireSaisie({
  categories,
  contactDonnees,
  etat,
  envoiEnCours: envoiDemande = false,
  refEncadre,
  onSaisie,
  onSortie,
  onTexte,
  onEnvoi,
}: {
  categories: Categorie[];
  contactDonnees: string;
  etat: EtatSaisie;
  envoiEnCours?: boolean;
  /** Encadré du haut (résumé d'erreurs ou panne), pour lui donner la sélection. */
  refEncadre?: Ref<HTMLDivElement>;
  onSaisie?: (champ: ChampSaisie, valeur: string | boolean) => void;
  onSortie?: (champ: ChampSaisie) => void;
  onTexte?: () => void;
  onEnvoi?: (evenement: FormEvent<HTMLFormElement>) => void;
}) {
  const { valeurs, erreurs } = etat;
  // Après une réussite, le formulaire reste dans l'état « envoi » jusqu'au détail.
  const envoiEnCours = envoiDemande || etat.redirection;
  const saisir = (champ: ChampSaisie) => (valeur: string | boolean) => onSaisie?.(champ, valeur);

  return (
    <form
      noValidate // Les messages sont ceux de l'UX, pas ceux du navigateur.
      onSubmit={onEnvoi}
      aria-busy={envoiEnCours || undefined}
      data-slot="formulaire-saisie"
      className="flex flex-col"
    >
      {etat.panne ? (
        <EncadrePanne ref={refEncadre} />
      ) : etat.resumeVisible ? (
        <ResumeErreurs ref={refEncadre} erreurs={listerErreursSaisie(erreurs)} className="mb-5" />
      ) : null}

      <p className="mb-5 text-caption text-text-muted">
        Les champs marqués <span className="text-danger">*</span> sont obligatoires.
      </p>

      <ChoixCanal
        valeur={valeurs.canal}
        erreur={erreurs.canal}
        desactive={envoiEnCours}
        onChoix={(canal) => saisir("canal")(canal)}
      />

      {/* Pendant l'envoi, la saisie est figée : ce qui serait tapé à ce
          moment-là ne partirait pas avec la demande. */}
      <fieldset disabled={envoiEnCours} className="mb-6 flex min-w-0 flex-col gap-4">
        <legend className="mb-3 flex items-center gap-2 text-section-title text-text">
          <User aria-hidden="true" className="size-4.5 text-accent-nova" />
          {MESSAGES_SAISIE.blocDemandeur}
        </legend>
        <Champ id="nom" etiquette="Nom et prénom" obligatoire erreur={erreurs.nom}>
          <Input
            name="nom"
            autoComplete="off"
            value={valeurs.nom}
            onChange={(e) => saisir("nom")(e.target.value)}
          />
        </Champ>
        <Champ id="email" etiquette="Email" obligatoire erreur={erreurs.email}>
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
        <Champ id="telephone" etiquette="Téléphone" erreur={erreurs.telephone}>
          <Input
            name="telephone"
            type="tel"
            autoComplete="off"
            placeholder="Facultatif"
            value={valeurs.telephone}
            onChange={(e) => saisir("telephone")(e.target.value)}
          />
        </Champ>
        <Champ id="entreprise" etiquette="Entreprise" erreur={erreurs.entreprise}>
          <Input
            name="entreprise"
            autoComplete="off"
            placeholder="Facultatif"
            value={valeurs.entreprise}
            onChange={(e) => saisir("entreprise")(e.target.value)}
          />
        </Champ>
      </fieldset>

      <fieldset disabled={envoiEnCours} className="mb-5 flex min-w-0 flex-col gap-4">
        <legend className="mb-3 flex items-center gap-2 text-section-title text-text">
          <MessageSquare aria-hidden="true" className="size-4.5 text-accent-nova" />
          {MESSAGES_SAISIE.blocDemande}
        </legend>
        <Champ id="categorieId" etiquette="Catégorie" obligatoire erreur={erreurs.categorieId}>
          <NativeSelect
            name="categorieId"
            value={valeurs.categorieId}
            onChange={(e) => saisir("categorieId")(e.target.value)}
          >
            <NativeSelectOption value="">Choisissez une catégorie</NativeSelectOption>
            {categories.map(({ id, nom }) => (
              <NativeSelectOption key={id} value={id}>
                {nom}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Champ>
        <Champ
          id="objet"
          etiquette="Objet"
          obligatoire
          erreur={erreurs.objet}
          compteur={{ actuel: compterCaracteres(valeurs.objet.trim()), maximum: LONGUEURS_MAXIMALES.objet }}
        >
          <Input name="objet" value={valeurs.objet} onChange={(e) => saisir("objet")(e.target.value)} />
        </Champ>
        <Champ
          id="description"
          etiquette="Description"
          obligatoire
          erreur={erreurs.description}
          aide={`${LONGUEUR_MINIMALE_DESCRIPTION} caractères minimum`}
          compteur={{
            actuel: compterCaracteres(valeurs.description.trim()),
            maximum: LONGUEURS_MAXIMALES.description,
          }}
        >
          <Textarea
            name="description"
            rows={4}
            value={valeurs.description}
            onChange={(e) => saisir("description")(e.target.value)}
          />
        </Champ>
      </fieldset>

      {/* « Texte à lui lire » : la mention de P1, à lire à la personne avant
          de cocher la case. */}
      <div className="mb-3 flex flex-col">
        <Button
          variant="discret"
          className="-ml-2 self-start px-2"
          aria-expanded={etat.texteOuvert}
          aria-controls={ID_TEXTE_A_LIRE}
          data-slot="texte-a-lire"
          onClick={onTexte}
        >
          <ShieldCheck aria-hidden="true" />
          {MESSAGES_SAISIE.texteALire}
          <ChevronDown aria-hidden="true" className={cn("transition-transform", etat.texteOuvert && "rotate-180")} />
        </Button>
        <MentionDonnees
          id={ID_TEXTE_A_LIRE}
          contactDonnees={contactDonnees}
          className={cn("mt-1", !etat.texteOuvert && "hidden")}
        />
      </div>

      <ChampCase
        id="personneInformee"
        etiquette={MESSAGES_SAISIE.caseEtiquette}
        obligatoire
        erreur={erreurs.personneInformee}
        className="mb-5"
      >
        <Checkbox
          name="personneInformee"
          disabled={envoiEnCours}
          checked={valeurs.personneInformee}
          onCheckedChange={(cochee) => saisir("personneInformee")(cochee === true)}
        />
      </ChampCase>

      {/* Actif tant qu'aucun envoi n'est en cours : la saisie est vérifiée au
          clic, le bouton n'est jamais grisé d'avance. */}
      <Button type="submit" disabled={envoiEnCours} className="w-full">
        {envoiEnCours ? (
          <>
            <LoaderCircle aria-hidden="true" className="animate-spin" />
            {MESSAGES_SAISIE.enregistrementEnCours}
          </>
        ) : (
          MESSAGES_SAISIE.enregistrer
        )}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Formulaire (avec état)
// ---------------------------------------------------------------------------

export function FormulaireSaisie({ categories, contactDonnees }: { categories: Categorie[]; contactDonnees: string }) {
  const router = useRouter();
  const [etat, agir] = useReducer(reduireSaisie, ETAT_SAISIE_INITIAL);
  const [envoiEnCours, demarrerEnvoi] = useTransition();
  // Un second clic avant le nouvel affichage ne lance pas un second envoi.
  const envoiVerrouille = useRef(false);
  // Numéro d'envoi de la demande affichée (AD-20) : tiré à l'affichage du
  // formulaire, gardé pour les nouveaux essais après une panne ou un refus,
  // renouvelé après une réussite. Gardé dans une référence, jamais dans
  // l'adresse ni dans la page.
  const numeroEnvoi = useRef<string | null>(null);
  const refEncadre = useRef<HTMLDivElement>(null);

  // Tirage à l'affichage, dans le navigateur seulement : rien n'est rendu,
  // donc rien ne diffère entre le serveur et le navigateur.
  useEffect(() => {
    numeroEnvoi.current ??= nouveauNumeroEnvoi();
  }, []);

  // Après un envoi refusé ou une panne, la sélection passe à l'encadré du
  // haut : il est lu par les lecteurs d'écran et ramené à l'écran.
  useEffect(() => {
    if (etat.appelsEncadre > 0) refEncadre.current?.focus();
  }, [etat.appelsEncadre]);

  function envoyer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    if (envoiVerrouille.current) return;

    const validation = validerSaisieInterne(etat.valeurs);
    if (!validation.ok) {
      agir({ type: "refus", champs: validation.champs });
      return;
    }

    envoiVerrouille.current = true;
    agir({ type: "envoi" });
    const valeurs = etat.valeurs;
    demarrerEnvoi(() =>
      envoyerSaisie({
        valeurs,
        saisir: actionSaisirDemande,
        agir,
        apresReussite: (reference) => {
          afficherSucces(messageDemandeCreee(reference));
          router.push(adresseDetail(reference));
        },
        enTransition: demarrerEnvoi,
        numeroEnvoi,
        envoiVerrouille,
      }),
    );
  }

  return (
    <VueFormulaireSaisie
      categories={categories}
      contactDonnees={contactDonnees}
      etat={etat}
      envoiEnCours={envoiEnCours}
      refEncadre={refEncadre}
      onSaisie={(champ, valeur) => agir({ type: "saisie", champ, valeur })}
      onSortie={(champ) => agir({ type: "sortie", champ })}
      onTexte={() => agir({ type: "texte" })}
      onEnvoi={envoyer}
    />
  );
}

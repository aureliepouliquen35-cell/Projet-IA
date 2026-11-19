"use client";

import {
  CircleAlert,
  LoaderCircle,
  MessageSquare,
  Send,
  ShieldCheck,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useReducer,
  useRef,
  useTransition,
  type FormEvent,
  type Ref,
} from "react";

import { Champ, ChampCase } from "@/components/formulaire/champ";
import { ResumeErreurs } from "@/components/formulaire/resume-erreurs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { actionDeposerDemande } from "@/server/actions/deposer-demande";
import { lienTelephone, type ContactsNova } from "@/shared/contacts";
import {
  compterCaracteres,
  FORME_EMAIL,
  LONGUEUR_MINIMALE_DESCRIPTION,
  LONGUEURS_MAXIMALES,
} from "@/shared/constantes";
import { MESSAGE_ERREUR_INATTENDUE, MESSAGES_PANNE_DEPOT } from "@/shared/messages";
import { nouveauNumeroEnvoi } from "@/shared/numero-envoi";
import { echec, type ErreursChamps, type Reponse } from "@/shared/reponse";
import {
  erreurDuChamp,
  listerErreurs,
  validerDepot,
  VALEURS_DEPOT_VIDES,
  type ChampDepot,
  type ValeursDepot,
} from "@/shared/schemas/depot";

// Formulaire de dépôt P1 (EXPERIENCE.md), téléphone d'abord.
//
// - `reduireDepot` : ce qui change à chaque geste (saisie, sortie d'un champ,
//   envoi refusé, panne, réussite). Rien de saisi n'y est effacé, sauf après
//   une réussite : le formulaire repart vierge pour une autre demande.
// - `VueFormulaireDepot` : l'écran, sans état.
// - `FormulaireDepot` : relie les deux, appelle la Server Function (AD-1)
//   avec le numéro d'envoi (AD-20), puis passe à l'écran de confirmation P2.
//
// Les champs sont contrôlés et l'envoi passe par `onSubmit` : avec
// `<form action>`, React 19 viderait les champs après l'action.

type Categorie = { id: string; nom: string };

/** Adresse de l'écran de confirmation P2. Rien de la demande n'y figure (AD-20). */
export const ADRESSE_CONFIRMATION = "/confirmation";

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export type EtatDepot = {
  valeurs: ValeursDepot;
  /** Message affiché sous chaque champ en erreur. */
  erreurs: ErreursChamps;
  /** Le résumé du haut apparaît après un envoi refusé, pas avant. */
  resumeVisible: boolean;
  /** L'envoi a échoué (panne) : encadré « Votre demande n'a pas pu être envoyée ». */
  panne: boolean;
  /**
   * Demande enregistrée, passage à P2 en cours : le formulaire reste figé,
   * pour qu'aucun second envoi ne parte pendant ce temps.
   */
  redirection: boolean;
  /** Augmente chaque fois que l'encadré du haut doit recevoir la sélection. */
  appelsEncadre: number;
};

export type ActionDepot =
  | { type: "saisie"; champ: ChampDepot; valeur: string | boolean }
  | { type: "sortie"; champ: ChampDepot }
  | { type: "envoi" }
  | { type: "refus"; champs: ErreursChamps }
  | { type: "panne" }
  | { type: "reussite" }
  | { type: "reinitialisation" };

export const ETAT_DEPOT_INITIAL: EtatDepot = {
  valeurs: VALEURS_DEPOT_VIDES,
  erreurs: {},
  resumeVisible: false,
  panne: false,
  redirection: false,
  appelsEncadre: 0,
};

function avecErreur(
  erreurs: ErreursChamps,
  champ: ChampDepot,
  message: string | undefined,
): ErreursChamps {
  const suivantes = { ...erreurs };
  if (message) suivantes[champ] = message;
  else delete suivantes[champ];
  return suivantes;
}

export function reduireDepot(etat: EtatDepot, action: ActionDepot): EtatDepot {
  switch (action.type) {
    case "saisie": {
      const valeurs = { ...etat.valeurs, [action.champ]: action.valeur };
      // Un message d'erreur disparaît dès que le champ est corrigé ; tant
      // qu'il ne l'est pas, il dit ce qui reste à corriger.
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
      // Seul le format de l'email est vérifié à la sortie du champ ; tout le
      // reste (champ vide compris) l'est à l'envoi.
      if (action.champ !== "email") return etat;
      const email = etat.valeurs.email.trim();
      if (email === "" || FORME_EMAIL.test(email)) return etat;
      return {
        ...etat,
        erreurs: avecErreur(etat.erreurs, "email", erreurDuChamp("email", etat.valeurs)),
      };
    }
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
      return {
        ...etat,
        panne: true,
        appelsEncadre: etat.appelsEncadre + 1,
      };
    case "reussite":
      // La saisie reste affichée, figée, jusqu'à l'arrivée de P2.
      return { ...etat, panne: false, redirection: true };
    case "reinitialisation":
      // Appliquée avec le passage à P2 : un retour arrière retrouve un
      // formulaire vierge, prêt pour une autre demande.
      return ETAT_DEPOT_INITIAL;
  }
}

/**
 * Ce que le formulaire fait de la réponse de la Server Function :
 * réussite → passage à P2 ; erreur de saisie avec ses champs → résumé
 * d'erreurs ; toute autre réponse → encadré de panne (message de l'UX avec
 * le téléphone de Nova, jamais le message technique de la réponse).
 */
export function actionApresReponse(reponse: Reponse<unknown>): ActionDepot {
  if (reponse.ok) return { type: "reussite" };
  if (reponse.code === "VALIDATION" && reponse.champs) {
    return { type: "refus", champs: reponse.champs };
  }
  return { type: "panne" };
}

/**
 * Numéro d'envoi à garder après une réponse (AD-20) : le même après un refus
 * ou une panne, pour qu'un nouvel essai ne crée pas de deuxième demande si la
 * première est arrivée ; un nouveau après une réussite, pour que la prochaine
 * demande ait le sien.
 */
export function numeroApresReponse(
  suite: ActionDepot,
  numero: string,
  tirer: () => string = nouveauNumeroEnvoi,
): string {
  return suite.type === "reussite" ? tirer() : numero;
}

/** Ce dont l'envoi a besoin : passé en paramètre pour pouvoir être essayé seul. */
export type DependancesEnvoi = {
  /** Saisie déjà vérifiée par le navigateur. */
  valeurs: ValeursDepot;
  /** La Server Function (`actionDeposerDemande`). */
  deposer: (valeurs: ValeursDepot, numeroEnvoi: string) => Promise<Reponse<unknown>>;
  agir: (action: ActionDepot) => void;
  /** Passage à une autre page (`router.push`). */
  naviguer: (adresse: string) => void;
  /** Lance une mise à jour non urgente (`startTransition`). */
  enTransition: (miseAJour: () => void) => void;
  /** Numéro d'envoi du formulaire affiché, tiré à son affichage. */
  numeroEnvoi: { current: string | null };
  /** Fermé pendant l'envoi : un second clic ne lance pas un second envoi. */
  envoiVerrouille: { current: boolean };
  tirer?: () => string;
};

/**
 * Envoie la demande et traite la réponse (AD-1, AD-20). Le verrou doit déjà
 * être fermé et l'action « envoi » appliquée.
 *
 * - Échec (refus, panne, appel qui lève une exception) : l'action
 *   correspondante, le même numéro d'envoi pour le prochain essai, verrou
 *   ouvert.
 * - Réussite : formulaire figé, nouveau numéro d'envoi, puis, ensemble, le
 *   formulaire vierge (verrou ouvert) et le passage à P2.
 */
export async function envoyerDepot({
  valeurs,
  deposer,
  agir,
  naviguer,
  enTransition,
  numeroEnvoi,
  envoiVerrouille,
  tirer = nouveauNumeroEnvoi,
}: DependancesEnvoi): Promise<void> {
  // Normalement tiré à l'affichage ; au cas où l'envoi le précéderait.
  numeroEnvoi.current ??= tirer();
  const numero = numeroEnvoi.current;

  let reponse: Reponse<unknown>;
  try {
    reponse = await deposer(valeurs, numero);
  } catch {
    // Réseau coupé ou serveur injoignable : même message qu'une panne.
    reponse = echec("ERREUR_INTERNE", MESSAGE_ERREUR_INATTENDUE);
  }

  const suite = actionApresReponse(reponse);
  numeroEnvoi.current = numeroApresReponse(suite, numero, tirer);
  agir(suite);
  if (suite.type !== "reussite") {
    envoiVerrouille.current = false;
    return;
  }

  // Demande enregistrée : le formulaire repart vierge en même temps que P2
  // s'affiche. Vierge, il peut être rouvert sans risque de double envoi.
  enTransition(() => {
    agir({ type: "reinitialisation" });
    envoiVerrouille.current = false;
    naviguer(ADRESSE_CONFIRMATION);
  });
}

// ---------------------------------------------------------------------------
// Écran (sans état)
// ---------------------------------------------------------------------------

/** Email du contact données : un lien si c'en est un, sinon un simple texte. */
function ContactDonnees({ contact }: { contact: string }) {
  if (!FORME_EMAIL.test(contact)) return <>{contact}</>;
  return (
    <a href={`mailto:${contact}`} className="font-medium text-primary underline">
      {contact}
    </a>
  );
}

/**
 * Encadré de panne (P1, « Erreur technique ») : le message de l'UX, avec le
 * téléphone de Nova, ou son email de contact s'il n'y a pas de téléphone.
 */
function EncadrePanne({ contacts, ref }: { contacts: ContactsNova; ref?: Ref<HTMLDivElement> }) {
  const { titre, suite, appel, ecrit } = MESSAGES_PANNE_DEPOT;
  return (
    <Alert ref={ref} variant="erreur" tabIndex={-1} className="mb-5">
      <AlertTitle>
        <CircleAlert aria-hidden="true" />
        {titre}
      </AlertTitle>
      <AlertDescription>
        {suite}{" "}
        {contacts.telephone ? (
          <>
            {appel}{" "}
            <a href={lienTelephone(contacts.telephone)} className="whitespace-nowrap">
              {contacts.telephone}
            </a>
            .
          </>
        ) : (
          <>
            {ecrit}{" "}
            <a href={`mailto:${contacts.emailContact}`} className="break-all">
              {contacts.emailContact}
            </a>
            .
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function VueFormulaireDepot({
  categories,
  contactDonnees,
  contacts,
  etat,
  envoiEnCours: envoiDemande = false,
  refEncadre,
  onSaisie,
  onSortie,
  onEnvoi,
}: {
  categories: Categorie[];
  contactDonnees: string;
  /** Contacts de Nova, montrés dans l'encadré de panne (FR-31). */
  contacts: ContactsNova;
  etat: EtatDepot;
  envoiEnCours?: boolean;
  /** Encadré du haut (résumé d'erreurs ou panne), pour lui donner la sélection. */
  refEncadre?: Ref<HTMLDivElement>;
  onSaisie?: (champ: ChampDepot, valeur: string | boolean) => void;
  onSortie?: (champ: ChampDepot) => void;
  onEnvoi?: (evenement: FormEvent<HTMLFormElement>) => void;
}) {
  const { valeurs, erreurs } = etat;
  // Après une réussite, le formulaire reste dans l'état « envoi » jusqu'à P2.
  const envoiEnCours = envoiDemande || etat.redirection;
  const saisir = (champ: ChampDepot) => (valeur: string | boolean) =>
    onSaisie?.(champ, valeur);

  return (
    <form
      noValidate // Les messages sont ceux de l'UX, pas ceux du navigateur.
      onSubmit={onEnvoi}
      aria-busy={envoiEnCours || undefined}
      className="flex flex-col"
    >
      {etat.panne ? (
        <EncadrePanne ref={refEncadre} contacts={contacts} />
      ) : etat.resumeVisible ? (
        <ResumeErreurs
          ref={refEncadre}
          erreurs={listerErreurs(erreurs)}
          className="mb-5"
        />
      ) : null}

      <p className="mb-5 text-caption text-text-muted">
        Les champs marqués <span className="text-danger">*</span> sont obligatoires.
      </p>

      {/* Pendant l'envoi, la saisie est figée : ce qui serait tapé à ce
          moment-là ne partirait pas avec la demande. */}
      <fieldset disabled={envoiEnCours} className="mb-6 flex min-w-0 flex-col gap-4">
        <legend className="mb-3 flex items-center gap-2 text-section-title text-text">
          <User aria-hidden="true" className="size-4.5 text-accent-nova" />
          Vos coordonnées
        </legend>
        <Champ id="nom" etiquette="Nom et prénom" obligatoire erreur={erreurs.nom}>
          <Input
            name="nom"
            autoComplete="name"
            value={valeurs.nom}
            onChange={(e) => saisir("nom")(e.target.value)}
          />
        </Champ>
        <Champ id="email" etiquette="Email" obligatoire erreur={erreurs.email}>
          <Input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
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
            autoComplete="tel"
            placeholder="Facultatif"
            value={valeurs.telephone}
            onChange={(e) => saisir("telephone")(e.target.value)}
          />
        </Champ>
        <Champ id="entreprise" etiquette="Entreprise" erreur={erreurs.entreprise}>
          <Input
            name="entreprise"
            autoComplete="organization"
            placeholder="Facultatif"
            value={valeurs.entreprise}
            onChange={(e) => saisir("entreprise")(e.target.value)}
          />
        </Champ>
      </fieldset>

      <fieldset disabled={envoiEnCours} className="mb-5 flex min-w-0 flex-col gap-4">
        <legend className="mb-3 flex items-center gap-2 text-section-title text-text">
          <MessageSquare aria-hidden="true" className="size-4.5 text-accent-nova" />
          Votre demande
        </legend>
        <Champ
          id="categorieId"
          etiquette="Catégorie"
          obligatoire
          erreur={erreurs.categorieId}
        >
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
          compteur={{
            actuel: compterCaracteres(valeurs.objet.trim()),
            maximum: LONGUEURS_MAXIMALES.objet,
          }}
        >
          <Input
            name="objet"
            value={valeurs.objet}
            onChange={(e) => saisir("objet")(e.target.value)}
          />
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

      <p
        data-slot="mention-donnees"
        className="mb-4 rounded-md bg-accent-nova-soft p-3 text-caption leading-normal break-words text-text"
      >
        <ShieldCheck
          aria-hidden="true"
          className="mr-1 inline size-4 align-[-3px] text-accent-nova"
        />
        Vos données (nom, coordonnées et contenu de votre demande) sont utilisées
        par Nova Services uniquement pour traiter votre demande. Elles sont
        conservées 3 ans après sa clôture. Pour les consulter ou les faire
        supprimer : <ContactDonnees contact={contactDonnees} />.
      </p>

      <ChampCase
        id="personneInformee"
        etiquette="J'ai pris connaissance de l'usage de mes données."
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
            Envoi en cours…
          </>
        ) : (
          <>
            Envoyer ma demande
            <Send aria-hidden="true" />
          </>
        )}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Formulaire (avec état)
// ---------------------------------------------------------------------------

export function FormulaireDepot({
  categories,
  contactDonnees,
  contacts,
}: {
  categories: Categorie[];
  contactDonnees: string;
  contacts: ContactsNova;
}) {
  const router = useRouter();
  const [etat, agir] = useReducer(reduireDepot, ETAT_DEPOT_INITIAL);
  const [envoiEnCours, demarrerEnvoi] = useTransition();
  // Un second clic avant le nouvel affichage ne lance pas un second envoi.
  const envoiVerrouille = useRef(false);
  // Numéro d'envoi de la demande affichée (AD-20) : tiré à l'affichage du
  // formulaire, gardé pour les nouveaux essais après une panne ou un refus
  // (une réponse perdue ne crée pas de deuxième demande), renouvelé après une
  // réussite. Gardé dans une référence, jamais dans la page.
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

    const validation = validerDepot(etat.valeurs);
    if (!validation.ok) {
      agir({ type: "refus", champs: validation.champs });
      return;
    }

    envoiVerrouille.current = true;
    agir({ type: "envoi" });
    const valeurs = etat.valeurs;
    demarrerEnvoi(() =>
      envoyerDepot({
        valeurs,
        deposer: actionDeposerDemande,
        agir,
        naviguer: (adresse) => router.push(adresse),
        enTransition: demarrerEnvoi,
        numeroEnvoi,
        envoiVerrouille,
      }),
    );
  }

  return (
    <VueFormulaireDepot
      categories={categories}
      contactDonnees={contactDonnees}
      contacts={contacts}
      etat={etat}
      envoiEnCours={envoiEnCours}
      refEncadre={refEncadre}
      onSaisie={(champ, valeur) => agir({ type: "saisie", champ, valeur })}
      onSortie={(champ) => agir({ type: "sortie", champ })}
      onEnvoi={envoyer}
    />
  );
}

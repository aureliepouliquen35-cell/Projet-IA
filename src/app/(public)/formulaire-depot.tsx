"use client";

import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  MessageSquare,
  Send,
  ShieldCheck,
  User,
} from "lucide-react";
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
import {
  compterCaracteres,
  FORME_EMAIL,
  LONGUEUR_MINIMALE_DESCRIPTION,
  LONGUEURS_MAXIMALES,
} from "@/shared/constantes";
import {
  MESSAGE_DEMANDE_ENREGISTREE,
  MESSAGE_ERREUR_INATTENDUE,
} from "@/shared/messages";
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
//   envoi refusé, panne, réussite). Rien de saisi n'y est jamais effacé.
// - `VueFormulaireDepot` : l'écran, sans état.
// - `FormulaireDepot` : relie les deux et appelle la Server Function (AD-1).
//
// Les champs sont contrôlés et l'envoi passe par `onSubmit` : avec
// `<form action>`, React 19 viderait les champs après l'action.

type Categorie = { id: string; nom: string };

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export type EtatDepot = {
  valeurs: ValeursDepot;
  /** Message affiché sous chaque champ en erreur. */
  erreurs: ErreursChamps;
  /** Le résumé du haut apparaît après un envoi refusé, pas avant. */
  resumeVisible: boolean;
  /** Message de l'encadré d'erreur quand l'envoi a échoué (panne). */
  erreurEnvoi: string | null;
  /** Référence reçue : le formulaire laisse place au message de réussite. */
  reference: string | null;
  /** Augmente chaque fois que l'encadré du haut doit recevoir la sélection. */
  appelsEncadre: number;
};

export type ActionDepot =
  | { type: "saisie"; champ: ChampDepot; valeur: string | boolean }
  | { type: "sortie"; champ: ChampDepot }
  | { type: "envoi" }
  | { type: "refus"; champs: ErreursChamps }
  | { type: "panne"; message: string }
  | { type: "reussite"; reference: string };

export const ETAT_DEPOT_INITIAL: EtatDepot = {
  valeurs: VALEURS_DEPOT_VIDES,
  erreurs: {},
  resumeVisible: false,
  erreurEnvoi: null,
  reference: null,
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
      return { ...etat, erreurEnvoi: null };
    case "refus":
      return {
        ...etat,
        erreurs: action.champs,
        resumeVisible: true,
        erreurEnvoi: null,
        appelsEncadre: etat.appelsEncadre + 1,
      };
    case "panne":
      return {
        ...etat,
        erreurEnvoi: action.message,
        appelsEncadre: etat.appelsEncadre + 1,
      };
    case "reussite":
      return { ...etat, reference: action.reference, erreurEnvoi: null };
  }
}

/**
 * Ce que le formulaire fait de la réponse de la Server Function :
 * réussite → message de réussite ; erreur de saisie avec ses champs → résumé
 * d'erreurs ; toute autre réponse → encadré d'erreur avec son message.
 */
export function actionApresReponse(
  reponse: Reponse<{ reference: string }>,
): ActionDepot {
  if (reponse.ok) return { type: "reussite", reference: reponse.donnees.reference };
  if (reponse.code === "VALIDATION" && reponse.champs) {
    return { type: "refus", champs: reponse.champs };
  }
  return { type: "panne", message: reponse.message };
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

export function VueFormulaireDepot({
  categories,
  contactDonnees,
  etat,
  envoiEnCours = false,
  refEncadre,
  onSaisie,
  onSortie,
  onEnvoi,
}: {
  categories: Categorie[];
  contactDonnees: string;
  etat: EtatDepot;
  envoiEnCours?: boolean;
  /** Encadré du haut (résumé d'erreurs ou panne), pour lui donner la sélection. */
  refEncadre?: Ref<HTMLDivElement>;
  onSaisie?: (champ: ChampDepot, valeur: string | boolean) => void;
  onSortie?: (champ: ChampDepot) => void;
  onEnvoi?: (evenement: FormEvent<HTMLFormElement>) => void;
}) {
  const { valeurs, erreurs } = etat;
  const saisir = (champ: ChampDepot) => (valeur: string | boolean) =>
    onSaisie?.(champ, valeur);

  return (
    <form
      noValidate // Les messages sont ceux de l'UX, pas ceux du navigateur.
      onSubmit={onEnvoi}
      aria-busy={envoiEnCours || undefined}
      className="flex flex-col"
    >
      {etat.erreurEnvoi ? (
        <Alert ref={refEncadre} variant="erreur" tabIndex={-1} className="mb-5">
          <AlertTitle>
            <CircleAlert aria-hidden="true" />
            {etat.erreurEnvoi}
          </AlertTitle>
        </Alert>
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

/**
 * Réussite provisoire : l'écran de confirmation P2 arrive avec la story 1.4.
 * D'ici là, la référence est montrée pour pouvoir être comparée à la base.
 */
export function ReussiteDepot({
  reference,
  ref,
}: {
  reference: string;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <Alert ref={ref} variant="succes" tabIndex={-1}>
      <AlertTitle>
        <CircleCheck aria-hidden="true" />
        {MESSAGE_DEMANDE_ENREGISTREE}
      </AlertTitle>
      <AlertDescription>
        Votre référence :{" "}
        <span className="font-mono text-reference whitespace-nowrap">{reference}</span>
      </AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// Formulaire (avec état)
// ---------------------------------------------------------------------------

export function FormulaireDepot({
  categories,
  contactDonnees,
}: {
  categories: Categorie[];
  contactDonnees: string;
}) {
  const [etat, agir] = useReducer(reduireDepot, ETAT_DEPOT_INITIAL);
  const [envoiEnCours, demarrerEnvoi] = useTransition();
  // Un second clic avant le nouvel affichage ne lance pas un second envoi.
  const envoiVerrouille = useRef(false);
  const refEncadre = useRef<HTMLDivElement>(null);
  const refReussite = useRef<HTMLDivElement>(null);

  // Après un envoi refusé ou une panne, la sélection passe à l'encadré du
  // haut : il est lu par les lecteurs d'écran et ramené à l'écran.
  useEffect(() => {
    if (etat.appelsEncadre > 0) refEncadre.current?.focus();
  }, [etat.appelsEncadre]);

  // Le formulaire a disparu : la sélection passe au message de réussite.
  useEffect(() => {
    if (etat.reference) refReussite.current?.focus();
  }, [etat.reference]);

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
    demarrerEnvoi(async () => {
      let reponse: Reponse<{ reference: string }>;
      try {
        reponse = await actionDeposerDemande(etat.valeurs);
      } catch {
        // Réseau coupé ou serveur injoignable : même message qu'une panne.
        reponse = echec("ERREUR_INTERNE", MESSAGE_ERREUR_INATTENDUE);
      }
      envoiVerrouille.current = false;
      agir(actionApresReponse(reponse));
    });
  }

  if (etat.reference) {
    return <ReussiteDepot ref={refReussite} reference={etat.reference} />;
  }

  return (
    <VueFormulaireDepot
      categories={categories}
      contactDonnees={contactDonnees}
      etat={etat}
      envoiEnCours={envoiEnCours}
      refEncadre={refEncadre}
      onSaisie={(champ, valeur) => agir({ type: "saisie", champ, valeur })}
      onSortie={(champ) => agir({ type: "sortie", champ })}
      onEnvoi={envoyer}
    />
  );
}

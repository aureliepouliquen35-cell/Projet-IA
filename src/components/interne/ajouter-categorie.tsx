"use client";

import { LoaderCircle, Plus } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useEffect, useReducer, useRef, useTransition, type FormEvent, type Ref } from "react";

import { Champ } from "@/components/formulaire/champ";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { afficherSucces } from "@/components/ui/sonner";
import { actionAjouterCategorie, type CategorieAjoutee } from "@/server/actions/ajouter-categorie";
import { MESSAGES_ACCES_REFUSE, MESSAGES_CATEGORIES } from "@/shared/messages";
import { echec, type Reponse } from "@/shared/reponse";
import { erreurNomCategorie, erreurPendantSaisie } from "@/shared/schemas/categorie";

// Champ « Nouvelle catégorie » et bouton « Ajouter », en haut de l'écran A2
// (story 4.1 ; EXPERIENCE.md, A2 ; FR-26).
//
// - Nom vide ou trop long : message sous le champ (schéma partagé), rien
//   n'est envoyé ; la Server Function revérifie (AD-11).
// - Pendant l'envoi : indicateur sur « Ajouter », saisie figée ; un double
//   clic n'envoie qu'une fois (AD-20).
// - Réussite : toast « Catégorie Facturation ajoutée. Elle est déjà proposée
//   dans le formulaire. », champ vidé ; la liste se met à jour par
//   `refresh()` dans la Server Function.
// - Nom déjà pris : « Une catégorie active porte déjà ce nom. » sous le
//   champ ; panne : « La catégorie n'a pas pu être enregistrée.
//   Réessayez. » sous le champ. La saisie est gardée, la sélection revient
//   au champ.
// - Accès refusé (administrateur rétrogradé entre-temps) : la page
//   recalculée par la Server Function devient S1.
//
// - `reduireAjout`, `preparerEnvoiAjout`, `actionApresReponseAjout`,
//   `envoyerAjout` : les gestes et l'envoi, exportés pour être essayés seuls.
// - `VueAjouterCategorie` : le formulaire, sans état.
// - `AjouterCategorie` : le formulaire, son état et la Server Function.

/** Identifiant du champ « Nouvelle catégorie ». */
export const ID_NOUVELLE_CATEGORIE = "nouvelle-categorie";

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export type EtatAjout = {
  /** Saisie du champ, telle que tapée. */
  nom: string;
  /** Message sous le champ, ou `null`. */
  erreur: string | null;
  /** Augmente chaque fois que le champ doit recevoir la sélection (après un refus). */
  appelsChamp: number;
};

export type ActionAjout =
  | { type: "saisie"; valeur: string }
  | { type: "envoi" }
  | { type: "refus"; message: string }
  | { type: "reussite" };

export const ETAT_AJOUT_INITIAL: EtatAjout = { nom: "", erreur: null, appelsChamp: 0 };

export function reduireAjout(etat: EtatAjout, action: ActionAjout): EtatAjout {
  switch (action.type) {
    case "saisie":
      // Un message affiché disparaît dès que le nom est corrigé ; tant qu'il
      // ne l'est pas, il dit ce qui reste à corriger.
      return { ...etat, nom: action.valeur, erreur: etat.erreur ? erreurPendantSaisie(action.valeur) : null };
    case "envoi":
      return { ...etat, erreur: null };
    case "refus":
      return { ...etat, erreur: action.message, appelsChamp: etat.appelsChamp + 1 };
    case "reussite":
      // Champ vidé, prêt pour une autre catégorie.
      return { ...ETAT_AJOUT_INITIAL, appelsChamp: etat.appelsChamp };
  }
}

/**
 * Début d'un envoi (« Ajouter » ou Entrée) :
 * - verrou fermé (envoi déjà en cours, double clic) : `ignore` ;
 * - nom refusé par le schéma partagé : `refus` avec le message, rien n'est
 *   envoyé, verrou laissé ouvert ;
 * - sinon : `envoi`, et le verrou est fermé.
 */
export function preparerEnvoiAjout(
  nom: string,
  envoiVerrouille: { current: boolean },
): { type: "ignore" } | { type: "refus"; message: string } | { type: "envoi" } {
  if (envoiVerrouille.current) return { type: "ignore" };
  const erreur = erreurNomCategorie(nom);
  if (erreur) return { type: "refus", message: erreur };
  envoiVerrouille.current = true;
  return { type: "envoi" };
}

/**
 * Ce que le formulaire fait de la réponse de la Server Function. Les textes
 * affichés sont ceux de l'UX, jamais un message technique :
 * - réussite : champ vidé, toast ;
 * - nom refusé par le serveur, ou déjà pris : le message sous le champ ;
 * - accès refusé : « Accès refusé. » (en pratique, la page recalculée devient
 *   aussitôt S1) ;
 * - toute autre réponse : « La catégorie n'a pas pu être enregistrée.
 *   Réessayez. ».
 */
export function actionApresReponseAjout(reponse: Reponse<CategorieAjoutee>): ActionAjout {
  if (reponse.ok) return { type: "reussite" };
  if (reponse.code === "VALIDATION" && reponse.champs?.nom) return { type: "refus", message: reponse.champs.nom };
  if (reponse.code === "CONFLIT") return { type: "refus", message: MESSAGES_CATEGORIES.nomDejaPris };
  if (reponse.code === "ACCES_REFUSE") return { type: "refus", message: MESSAGES_ACCES_REFUSE.action };
  return { type: "refus", message: MESSAGES_CATEGORIES.enregistrementImpossible };
}

/** Ce dont l'envoi a besoin : passé en paramètre pour pouvoir être essayé seul. */
export type DependancesAjout = {
  /** Nom déjà vérifié par le navigateur. */
  nom: string;
  /** La Server Function (`actionAjouterCategorie`). */
  ajouter: (saisie: { nom: string }) => Promise<Reponse<CategorieAjoutee>>;
  agir: (action: ActionAjout) => void;
  /** Après une réussite : toast, avec le nom enregistré. */
  apresReussite: (categorie: CategorieAjoutee) => void;
  /** Fermé pendant l'envoi : un second clic ne lance pas un second envoi. */
  envoiVerrouille: { current: boolean };
};

/**
 * Envoie le nom et traite la réponse. Le verrou doit déjà être fermé et
 * l'action « envoi » appliquée. Le verrou est rouvert à la fin, quelle que
 * soit la réponse. Un réseau coupé donne la même suite qu'une panne ; une
 * redirection du serveur (session terminée) est relancée pour que Next.js
 * change de page.
 */
export async function envoyerAjout({ nom, ajouter, agir, apresReussite, envoiVerrouille }: DependancesAjout): Promise<void> {
  let reponse: Reponse<CategorieAjoutee>;
  try {
    reponse = await ajouter({ nom });
  } catch (erreur) {
    try {
      unstable_rethrow(erreur);
    } catch (redirection) {
      envoiVerrouille.current = false;
      throw redirection;
    }
    reponse = echec("ERREUR_INTERNE", MESSAGES_CATEGORIES.enregistrementImpossible);
  }

  const suite = actionApresReponseAjout(reponse);
  agir(suite);
  envoiVerrouille.current = false;
  if (reponse.ok) apresReussite(reponse.donnees);
}

// ---------------------------------------------------------------------------
// Formulaire (sans état)
// ---------------------------------------------------------------------------

export function VueAjouterCategorie({
  etat,
  envoiEnCours = false,
  refChamp,
  onSaisie,
  onEnvoi,
}: {
  etat: EtatAjout;
  envoiEnCours?: boolean;
  /** Le champ, sélectionné après un refus. */
  refChamp?: Ref<HTMLInputElement>;
  onSaisie?: (valeur: string) => void;
  onEnvoi?: (evenement: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      noValidate // Les messages sont ceux de l'UX, pas ceux du navigateur.
      onSubmit={onEnvoi}
      aria-busy={envoiEnCours || undefined}
      data-slot="ajouter-categorie"
      className="max-w-xl"
    >
      <Champ
        id={ID_NOUVELLE_CATEGORIE}
        etiquette={MESSAGES_CATEGORIES.nouvelleCategorie}
        erreur={etat.erreur ?? undefined}
        apres={
          // Actif tant qu'aucun envoi n'est en cours : la saisie est vérifiée
          // au clic, le bouton n'est jamais grisé d'avance.
          <Button type="submit" data-slot="bouton-ajouter" disabled={envoiEnCours} aria-busy={envoiEnCours || undefined}>
            {envoiEnCours ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Plus aria-hidden="true" />
            )}
            {MESSAGES_CATEGORIES.ajouter}
          </Button>
        }
      >
        <Input
          ref={refChamp}
          name="nom"
          autoComplete="off"
          // Pendant l'envoi, la saisie est figée (sans perdre la sélection).
          readOnly={envoiEnCours}
          value={etat.nom}
          onChange={(e) => onSaisie?.(e.target.value)}
        />
      </Champ>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Formulaire (avec état)
// ---------------------------------------------------------------------------

export function AjouterCategorie() {
  const [etat, agir] = useReducer(reduireAjout, ETAT_AJOUT_INITIAL);
  const [envoiEnCours, demarrerEnvoi] = useTransition();
  // Un second clic avant la réponse ne lance pas un second envoi.
  const envoiVerrouille = useRef(false);
  const refChamp = useRef<HTMLInputElement>(null);

  // Après un refus, la sélection revient au champ, qui annonce son message.
  useEffect(() => {
    if (etat.appelsChamp > 0) refChamp.current?.focus();
  }, [etat.appelsChamp]);

  function envoyer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const debut = preparerEnvoiAjout(etat.nom, envoiVerrouille);
    if (debut.type === "ignore") return;
    if (debut.type === "refus") {
      agir({ type: "refus", message: debut.message });
      return;
    }

    agir({ type: "envoi" });
    const nom = etat.nom;
    demarrerEnvoi(() =>
      envoyerAjout({
        nom,
        ajouter: actionAjouterCategorie,
        agir,
        apresReussite: (categorie) => afficherSucces(MESSAGES_CATEGORIES.ajoutee(categorie.nom)),
        envoiVerrouille,
      }),
    );
  }

  return (
    <VueAjouterCategorie
      etat={etat}
      envoiEnCours={envoiEnCours}
      refChamp={refChamp}
      onSaisie={(valeur) => agir({ type: "saisie", valeur })}
      onEnvoi={envoyer}
    />
  );
}

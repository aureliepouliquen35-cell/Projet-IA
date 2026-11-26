"use client";

import { CircleAlert, LoaderCircle, Pencil } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import {
  useEffect,
  useReducer,
  useRef,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { afficherSucces } from "@/components/ui/sonner";
import { actionRenommerCategorie, type CategorieRenommee } from "@/server/actions/renommer-categorie";
import { formaterNombre } from "@/shared/constantes";
import { MESSAGES_ACCES_REFUSE, MESSAGES_CATEGORIES } from "@/shared/messages";
import { echec, type Reponse } from "@/shared/reponse";
import { erreurNomCategorie, erreurPendantSaisie } from "@/shared/schemas/categorie";

// Une ligne de la liste A2 et son « Renommer » (story 4.1 ; EXPERIENCE.md,
// A2 ; FR-26) : Nom · État · Nombre de demandes · Actions.
//
// - « Renommer » : le nom devient un champ modifiable sur la ligne
//   (prérempli, sélectionné), avec « Enregistrer » et « Annuler » dans la
//   colonne Actions.
// - « Annuler » ou Échap : le nom d'origine revient, rien n'est envoyé.
// - Même nom (espaces de bord retirés) : rien n'est envoyé, la ligne
//   repasse en lecture, sans toast.
// - Nom vide ou trop long : message sous le champ (schéma partagé), rien
//   n'est envoyé ; la Server Function revérifie (AD-11).
// - Pendant l'envoi : indicateur sur « Enregistrer », saisie figée ; un
//   double clic n'envoie qu'une fois (AD-20).
// - Réussite : la ligne repasse en lecture avec le nouveau nom (la liste est
//   recalculée par `refresh()` dans la Server Function), toast « Catégorie
//   renommée ».
// - Nom déjà pris : « Une catégorie active porte déjà ce nom. » sous le
//   champ ; panne (ou catégorie supprimée entre-temps) : « La catégorie n'a
//   pas pu être enregistrée. Réessayez. ». La saisie est gardée.
// - Accès refusé (administrateur rétrogradé entre-temps) : la page
//   recalculée par la Server Function devient S1.
//
// - `reduireRenommage`, `preparerEnvoiRenommage`,
//   `actionApresReponseRenommage`, `envoyerRenommage` : les gestes et
//   l'envoi, exportés pour être essayés seuls.
// - `VueLigneCategorie` : la ligne, sans état.
// - `LigneCategorie` : la ligne, son état et la Server Function.

/** Ce que la ligne montre de la catégorie. */
export type CategorieLigne = { id: string; nom: string; active: boolean; nombreDemandes: number };

/** Identifiant du champ de renommage, unique sur la page (un par ligne). */
export const idChampRenommage = (categorieId: string) => `renommer-${categorieId}`;

/** Identifiant du formulaire de la ligne : « Enregistrer », dans la colonne Actions, s'y rattache. */
export const idFormulaireRenommage = (categorieId: string) => `formulaire-renommer-${categorieId}`;

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export type EtatRenommage = {
  /** Vrai : le nom est un champ modifiable. */
  edition: boolean;
  /** Saisie du champ, telle que tapée. */
  valeur: string;
  /** Message sous le champ, ou `null`. */
  erreur: string | null;
  /** Augmente chaque fois que le champ doit recevoir la sélection (ouverture, refus). */
  appelsChamp: number;
  /** Augmente chaque fois que « Renommer » doit la reprendre (retour en lecture). */
  appelsBouton: number;
};

export type ActionRenommage =
  | { type: "debut"; nom: string }
  | { type: "saisie"; valeur: string }
  | { type: "annulation" }
  | { type: "envoi" }
  | { type: "refus"; message: string }
  | { type: "reussite"; change: boolean };

export const ETAT_RENOMMAGE_INITIAL: EtatRenommage = {
  edition: false,
  valeur: "",
  erreur: null,
  appelsChamp: 0,
  appelsBouton: 0,
};

/** Retour en lecture : la saisie est oubliée, « Renommer » reprend la sélection. */
const enLecture = (etat: EtatRenommage): EtatRenommage => ({
  ...etat,
  edition: false,
  valeur: "",
  erreur: null,
  appelsBouton: etat.appelsBouton + 1,
});

export function reduireRenommage(etat: EtatRenommage, action: ActionRenommage): EtatRenommage {
  switch (action.type) {
    case "debut":
      return { ...etat, edition: true, valeur: action.nom, erreur: null, appelsChamp: etat.appelsChamp + 1 };
    case "saisie":
      // Un message affiché disparaît dès que le nom est corrigé ; tant qu'il
      // ne l'est pas, il dit ce qui reste à corriger.
      return { ...etat, valeur: action.valeur, erreur: etat.erreur ? erreurPendantSaisie(action.valeur) : null };
    case "envoi":
      return { ...etat, erreur: null };
    case "refus":
      return { ...etat, erreur: action.message, appelsChamp: etat.appelsChamp + 1 };
    case "annulation":
    case "reussite":
      return enLecture(etat);
  }
}

/**
 * Début d'un envoi (« Enregistrer » ou Entrée) :
 * - verrou fermé (envoi déjà en cours, double clic) : `ignore` ;
 * - nom refusé par le schéma partagé : `refus` avec le message, rien n'est
 *   envoyé, verrou laissé ouvert ;
 * - même nom qu'avant (espaces de bord retirés) : `inchange`, rien n'est
 *   envoyé ;
 * - sinon : `envoi`, et le verrou est fermé.
 */
export function preparerEnvoiRenommage(
  valeur: string,
  nomActuel: string,
  envoiVerrouille: { current: boolean },
): { type: "ignore" } | { type: "refus"; message: string } | { type: "inchange" } | { type: "envoi" } {
  if (envoiVerrouille.current) return { type: "ignore" };
  const erreur = erreurNomCategorie(valeur);
  if (erreur) return { type: "refus", message: erreur };
  if (valeur.trim() === nomActuel) return { type: "inchange" };
  envoiVerrouille.current = true;
  return { type: "envoi" };
}

/**
 * Ce que la ligne fait de la réponse de la Server Function. Les textes
 * affichés sont ceux de l'UX, jamais un message technique :
 * - réussite : retour en lecture (toast seulement si le nom a changé) ;
 * - nom refusé par le serveur, ou déjà pris : le message sous le champ ;
 * - accès refusé : « Accès refusé. » (en pratique, la page recalculée devient
 *   aussitôt S1) ;
 * - toute autre réponse (catégorie supprimée entre-temps, panne) : « La
 *   catégorie n'a pas pu être enregistrée. Réessayez. ».
 */
export function actionApresReponseRenommage(reponse: Reponse<CategorieRenommee>): ActionRenommage {
  if (reponse.ok) return { type: "reussite", change: reponse.donnees.change };
  if (reponse.code === "VALIDATION" && reponse.champs?.nom) return { type: "refus", message: reponse.champs.nom };
  if (reponse.code === "CONFLIT") return { type: "refus", message: MESSAGES_CATEGORIES.nomDejaPris };
  if (reponse.code === "ACCES_REFUSE") return { type: "refus", message: MESSAGES_ACCES_REFUSE.action };
  return { type: "refus", message: MESSAGES_CATEGORIES.enregistrementImpossible };
}

/** Ce dont l'envoi a besoin : passé en paramètre pour pouvoir être essayé seul. */
export type DependancesRenommage = {
  categorieId: string;
  /** Nom déjà vérifié par le navigateur. */
  nom: string;
  /** La Server Function (`actionRenommerCategorie`). */
  renommer: (saisie: { categorieId: string; nom: string }) => Promise<Reponse<CategorieRenommee>>;
  agir: (action: ActionRenommage) => void;
  /** Après un renommage qui a changé le nom : toast « Catégorie renommée ». */
  apresRenommage: () => void;
  /** Fermé pendant l'envoi : un second clic ne lance pas un second envoi. */
  envoiVerrouille: { current: boolean };
};

/**
 * Envoie le nouveau nom et traite la réponse. Le verrou doit déjà être fermé
 * et l'action « envoi » appliquée. Le verrou est rouvert à la fin, quelle
 * que soit la réponse. Un réseau coupé donne la même suite qu'une panne ;
 * une redirection du serveur (session terminée) est relancée pour que
 * Next.js change de page.
 */
export async function envoyerRenommage({
  categorieId,
  nom,
  renommer,
  agir,
  apresRenommage,
  envoiVerrouille,
}: DependancesRenommage): Promise<void> {
  let reponse: Reponse<CategorieRenommee>;
  try {
    reponse = await renommer({ categorieId, nom });
  } catch (erreur) {
    try {
      unstable_rethrow(erreur);
    } catch (redirection) {
      envoiVerrouille.current = false;
      throw redirection;
    }
    reponse = echec("ERREUR_INTERNE", MESSAGES_CATEGORIES.enregistrementImpossible);
  }

  const suite = actionApresReponseRenommage(reponse);
  agir(suite);
  envoiVerrouille.current = false;
  if (suite.type === "reussite" && suite.change) apresRenommage();
}

// ---------------------------------------------------------------------------
// Ligne (sans état)
// ---------------------------------------------------------------------------

const CELLULE = "h-14 border-t px-3 align-middle";

export function VueLigneCategorie({
  categorie,
  etatCategorie,
  etat,
  envoiEnCours = false,
  refChamp,
  refBouton,
  onDebut,
  onSaisie,
  onEnvoi,
  onAnnuler,
}: {
  categorie: CategorieLigne;
  /** Contenu de la colonne État : « Active » ou le badge *Désactivée*. */
  etatCategorie: ReactNode;
  etat: EtatRenommage;
  envoiEnCours?: boolean;
  /** Le champ, sélectionné à l'ouverture et après un refus. */
  refChamp?: Ref<HTMLInputElement>;
  /** « Renommer », qui reprend la sélection au retour en lecture. */
  refBouton?: Ref<HTMLButtonElement>;
  onDebut?: () => void;
  onSaisie?: (valeur: string) => void;
  onEnvoi?: (evenement: FormEvent<HTMLFormElement>) => void;
  onAnnuler?: () => void;
}) {
  const idChamp = idChampRenommage(categorie.id);
  const idErreur = `${idChamp}-erreur`;
  const idFormulaire = idFormulaireRenommage(categorie.id);

  function touche(evenement: KeyboardEvent<HTMLInputElement>) {
    if (evenement.key !== "Escape") return;
    evenement.preventDefault();
    onAnnuler?.();
  }

  return (
    <tr data-slot="ligne-categorie" data-active={categorie.active} data-edition={etat.edition || undefined}>
      <th scope="row" className={`${CELLULE} text-left font-semibold`}>
        {etat.edition ? (
          <form
            id={idFormulaire}
            noValidate // Les messages sont ceux de l'UX, pas ceux du navigateur.
            onSubmit={onEnvoi}
            aria-busy={envoiEnCours || undefined}
            data-slot="formulaire-renommage"
            className="py-2 font-normal"
          >
            <Input
              ref={refChamp}
              id={idChamp}
              name="nom"
              autoComplete="off"
              aria-label={MESSAGES_CATEGORIES.champRenommage(categorie.nom)}
              aria-invalid={etat.erreur ? true : undefined}
              aria-describedby={etat.erreur ? idErreur : undefined}
              // Pendant l'envoi, la saisie est figée (sans perdre la sélection).
              readOnly={envoiEnCours}
              value={etat.valeur}
              onChange={(e) => onSaisie?.(e.target.value)}
              onKeyDown={touche}
            />
            <div aria-live="polite">
              {etat.erreur ? (
                <p
                  id={idErreur}
                  data-slot="erreur-champ"
                  className="mt-1.5 flex items-start gap-1.5 text-caption font-medium text-danger"
                >
                  <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" />
                  {etat.erreur}
                </p>
              ) : null}
            </div>
          </form>
        ) : (
          categorie.nom
        )}
      </th>
      <td className={CELLULE}>{etatCategorie}</td>
      <td className={`${CELLULE} tabular-nums`}>{formaterNombre(categorie.nombreDemandes)}</td>
      <td className={CELLULE}>
        <div className="flex flex-wrap items-center gap-2">
          {/* Clés distinctes : sans elles, React réutiliserait le bouton
              « Renommer » pour « Enregistrer » pendant le clic, qui
              deviendrait un envoi du formulaire et refermerait aussitôt la
              ligne (le navigateur termine le clic sur un bouton devenu
              `submit`). */}
          {etat.edition ? (
            <>
              <Button
                key="enregistrer"
                type="submit"
                form={idFormulaire}
                size="sm"
                data-slot="enregistrer-renommage"
                aria-label={MESSAGES_CATEGORIES.enregistrerNom(categorie.nom)}
                disabled={envoiEnCours}
                aria-busy={envoiEnCours || undefined}
              >
                {envoiEnCours ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
                {MESSAGES_CATEGORIES.enregistrer}
              </Button>
              <Button
                key="annuler"
                type="button"
                variant="secondaire"
                size="sm"
                data-slot="annuler-renommage"
                aria-label={MESSAGES_CATEGORIES.annulerNom(categorie.nom)}
                disabled={envoiEnCours}
                onClick={onAnnuler}
              >
                {MESSAGES_CATEGORIES.annuler}
              </Button>
            </>
          ) : (
            <Button
              key="renommer"
              ref={refBouton}
              type="button"
              variant="secondaire"
              size="sm"
              data-slot="renommer-categorie"
              aria-label={MESSAGES_CATEGORIES.renommerNom(categorie.nom)}
              onClick={onDebut}
            >
              <Pencil aria-hidden="true" />
              {MESSAGES_CATEGORIES.renommer}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Ligne (avec état)
// ---------------------------------------------------------------------------

export function LigneCategorie({ categorie, etatCategorie }: { categorie: CategorieLigne; etatCategorie: ReactNode }) {
  const [etat, agir] = useReducer(reduireRenommage, ETAT_RENOMMAGE_INITIAL);
  const [envoiEnCours, demarrerEnvoi] = useTransition();
  // Un second clic avant la réponse ne lance pas un second envoi.
  const envoiVerrouille = useRef(false);
  const refChamp = useRef<HTMLInputElement>(null);
  const refBouton = useRef<HTMLButtonElement>(null);

  // À l'ouverture, le nom est sélectionné, prêt à être remplacé ; après un
  // refus, la sélection revient au champ, qui annonce son message.
  useEffect(() => {
    if (etat.appelsChamp === 0) return;
    refChamp.current?.focus();
    refChamp.current?.select();
  }, [etat.appelsChamp]);

  // De retour en lecture, « Renommer » reprend la sélection.
  useEffect(() => {
    if (etat.appelsBouton > 0) refBouton.current?.focus();
  }, [etat.appelsBouton]);

  function annuler() {
    if (envoiVerrouille.current) return;
    agir({ type: "annulation" });
  }

  function envoyer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const debut = preparerEnvoiRenommage(etat.valeur, categorie.nom, envoiVerrouille);
    if (debut.type === "ignore") return;
    if (debut.type === "refus") {
      agir({ type: "refus", message: debut.message });
      return;
    }
    if (debut.type === "inchange") {
      agir({ type: "reussite", change: false });
      return;
    }

    agir({ type: "envoi" });
    const nom = etat.valeur;
    demarrerEnvoi(() =>
      envoyerRenommage({
        categorieId: categorie.id,
        nom,
        renommer: actionRenommerCategorie,
        agir,
        apresRenommage: () => afficherSucces(MESSAGES_CATEGORIES.renommee),
        envoiVerrouille,
      }),
    );
  }

  return (
    <VueLigneCategorie
      categorie={categorie}
      etatCategorie={etatCategorie}
      etat={etat}
      envoiEnCours={envoiEnCours}
      refChamp={refChamp}
      refBouton={refBouton}
      onDebut={() => agir({ type: "debut", nom: categorie.nom })}
      onSaisie={(valeur) => agir({ type: "saisie", valeur })}
      onEnvoi={envoyer}
      onAnnuler={annuler}
    />
  );
}

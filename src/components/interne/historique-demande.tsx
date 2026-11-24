import type { AuteurDemande, EvenementDemande } from "@/server/lectures/demande";
import type { Canal } from "@/shared/constantes";
import { formaterDateHeure } from "@/shared/dates";
import {
  LIBELLES_AUTEURS,
  LIBELLES_EVENEMENTS,
  libelleChangementStatut,
  libelleCreationSaisie,
} from "@/shared/libelles";

// Historique d'une demande (DESIGN.md, Historique ; FR-17) : une frise
// verticale, du plus ancien au plus récent. Chaque ligne dit quoi (« Demande
// créée »), qui (en semi-gras) et quand (en `caption`, heure de Paris). Le
// point du dernier événement est violet (accent).
//
// Un changement de statut se lit « Statut : Nouvelle → En cours », avec
// l'ancien statut réellement en place juste avant (FR-16). L'auteur est le
// nom de l'utilisateur interne (même si son compte a été désactivé depuis),
// ou « Demandeur » / « Système ».
//
// Une demande saisie par un utilisateur interne (story 2.3, FR-30) se lit
// « Demande créée (canal : Téléphone) », puis son nom · la date. Une
// demande du formulaire public reste « Demande créée » · « Demandeur ».

/**
 * Ce qui s'est passé : « Demande créée », « Demande créée (canal :
 * Téléphone) », « Statut : Nouvelle → En cours ».
 */
function quoi(evenement: EvenementDemande, canal: Canal | undefined): string {
  if (evenement.type === "statut") {
    return libelleChangementStatut(evenement.ancienStatut, evenement.nouveauStatut);
  }
  if (evenement.type === "creation" && evenement.auteur.interne && canal) {
    return libelleCreationSaisie(canal);
  }
  return LIBELLES_EVENEMENTS[evenement.type];
}

/** Qui : le nom d'un utilisateur interne, ou le libellé de l'auteur. */
function qui(auteur: AuteurDemande): string {
  return auteur.interne ? auteur.nom : LIBELLES_AUTEURS[auteur.libelle];
}

export function HistoriqueDemande({
  evenements,
  canal,
}: {
  evenements: EvenementDemande[];
  /** Canal de la demande : dit sur la ligne de création d'une demande saisie. */
  canal?: Canal;
}) {
  return (
    <ol data-slot="historique" className="relative">
      {evenements.map((evenement, index) => {
        const dernier = index === evenements.length - 1;
        return (
          <li
            key={`${evenement.date}-${index}`}
            data-slot="evenement"
            className="relative pb-4.5 pl-6.5 last:pb-0"
          >
            {/* Trait de la frise, jusqu'au point suivant. */}
            {!dernier && (
              <span aria-hidden="true" className="absolute top-3 bottom-0 left-[5px] w-0.5 bg-border" />
            )}
            <span
              aria-hidden="true"
              className={
                dernier
                  ? "absolute top-1 left-0 size-3 rounded-full border-2 border-accent-nova bg-accent-nova"
                  : "absolute top-1 left-0 size-3 rounded-full border-2 border-primary bg-background"
              }
            />
            <p className="text-body-sm font-semibold text-text">{quoi(evenement, canal)}</p>
            <p className="mt-0.5 text-caption text-text-muted">
              <span className="font-semibold text-text">{qui(evenement.auteur)}</span>
              {" · "}
              <time dateTime={evenement.date}>{formaterDateHeure(new Date(evenement.date))}</time>
            </p>
          </li>
        );
      })}
    </ol>
  );
}

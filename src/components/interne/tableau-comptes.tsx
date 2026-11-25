import { CircleAlert } from "lucide-react";

import { BoutonReessayer } from "@/components/interne/bouton-reessayer";
import { EtatCompte } from "@/components/interne/etat-compte";
import type { CompteAdministration } from "@/server/lectures/comptes";
import { LIBELLES_ROLES } from "@/shared/constantes";
import { MESSAGES_COMPTES } from "@/shared/messages";

// Écran A1 « Comptes » (EXPERIENCE.md, A1 ; DESIGN.md, Tableau, Badges ;
// FR-24) : le tableau des comptes, son état d'erreur et son squelette.
//
// Un vrai tableau, avec ses en-têtes de colonnes reconnus par les lecteurs
// d'écran : Nom · Email · Rôle · État · Actions. Un compte actif est écrit « Actif » ;
// un compte désactivé porte le badge gris *Désactivé*, toujours écrit en
// toutes lettres (la couleur n'est jamais la seule information).
//
// Colonne « Actions » : « Désactiver » (avec sa fenêtre de confirmation) ou
// « Réactiver » (story 3.4, `etat-compte.tsx`) ; « Modifier » et
// « Réinitialiser le mot de passe » arrivent avec les stories 3.3 et 3.5.
// Le bouton « Créer un compte » est à côté du titre (`creer-compte.tsx`).
// Pas d'état vide : l'administrateur connecté a toujours son compte.

const EN_TETE = "px-3 py-2.5 text-left text-caption font-semibold tracking-wide text-text-muted uppercase";
const CELLULE = "h-14 border-t px-3 align-middle";

/** Badge *Désactivé* (DESIGN.md, Badges : gris, 24 px, coins de 6 px). */
export function BadgeDesactive() {
  return (
    <span
      data-slot="badge-desactive"
      className="inline-flex h-6 items-center rounded-sm bg-inactive-bg px-2.5 text-caption font-semibold whitespace-nowrap text-inactive-fg"
    >
      {MESSAGES_COMPTES.desactive}
    </span>
  );
}

export function TableauComptes({ comptes }: { comptes: CompteAdministration[] }) {
  const { colonnes } = MESSAGES_COMPTES;
  return (
    <div className="overflow-x-auto rounded-lg border bg-background shadow-soft">
      <table data-slot="tableau-comptes" className="w-full border-collapse text-body-sm text-text">
        <caption className="sr-only">{MESSAGES_COMPTES.legendeTableau}</caption>
        <thead className="bg-surface-muted">
          <tr>
            <th scope="col" className={EN_TETE}>{colonnes.nom}</th>
            <th scope="col" className={EN_TETE}>{colonnes.email}</th>
            <th scope="col" className={EN_TETE}>{colonnes.role}</th>
            <th scope="col" className={EN_TETE}>{colonnes.etat}</th>
            <th scope="col" className={EN_TETE}>{colonnes.actions}</th>
          </tr>
        </thead>
        <tbody>
          {comptes.map((compte) => (
            <tr key={compte.id} data-slot="ligne-compte" data-actif={compte.actif}>
              <th scope="row" className={`${CELLULE} text-left font-semibold`}>
                {compte.nom}
              </th>
              <td className={`${CELLULE} text-text-muted`}>{compte.email}</td>
              <td className={CELLULE}>{LIBELLES_ROLES[compte.role]}</td>
              <td className={CELLULE}>{compte.actif ? MESSAGES_COMPTES.actif : <BadgeDesactive />}</td>
              <td className={CELLULE}>
                <EtatCompte compte={{ id: compte.id, nom: compte.nom, actif: compte.actif }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Les comptes n'ont pas pu être lus : message et « Réessayer ». */
export function EtatComptesErreur() {
  return (
    <div
      data-slot="comptes-erreur"
      role="alert"
      className="flex flex-col items-center rounded-lg border bg-background px-5 py-7 text-center shadow-soft"
    >
      <span
        aria-hidden="true"
        className="mb-3 flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger"
      >
        <CircleAlert />
      </span>
      <p className="mb-4 text-body font-semibold text-urgent-fg">{MESSAGES_COMPTES.erreur}</p>
      <BoutonReessayer />
    </div>
  );
}

/** Nombre de lignes grises du squelette du tableau. */
export const LIGNES_SQUELETTE_COMPTES = 5;

/**
 * Squelette de l'écran A1 (DESIGN.md, Squelette) : le titre et les lignes
 * du tableau en gris, visibles seulement après 300 ms, sans animation.
 */
export function SqueletteComptes() {
  return (
    <div data-slot="squelette" role="status" className="animate-apres-300ms flex flex-col gap-5">
      <span className="sr-only">{MESSAGES_COMPTES.chargement}</span>
      <div className="h-8 w-40 rounded-sm bg-border" />
      <div className="rounded-lg border bg-background px-3 shadow-soft">
        {Array.from({ length: LIGNES_SQUELETTE_COMPTES }, (_, index) => (
          <div
            key={index}
            data-slot="ligne-squelette"
            className="flex h-14 items-center gap-3 border-b last:border-b-0"
          >
            <div className="h-3 w-32 rounded-sm bg-border" />
            <div className="h-3 flex-1 rounded-sm bg-border" />
            <div className="h-3 w-24 rounded-sm bg-border" />
            <div className="h-3 w-16 rounded-sm bg-border" />
            <div className="h-3 w-20 rounded-sm bg-border" />
          </div>
        ))}
      </div>
    </div>
  );
}

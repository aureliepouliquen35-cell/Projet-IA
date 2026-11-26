import { CircleAlert } from "lucide-react";

import { BoutonReessayer } from "@/components/interne/bouton-reessayer";
import { LigneCategorie } from "@/components/interne/renommer-categorie";
import type { CategorieAdministration } from "@/server/lectures/categories";
import { MESSAGES_CATEGORIES } from "@/shared/messages";

// Écran A2 « Catégories » (story 4.1 ; EXPERIENCE.md, A2 ; DESIGN.md,
// Tableau, Badges ; FR-26) : la liste des catégories, son état d'erreur et
// son squelette.
//
// Un vrai tableau, avec ses en-têtes de colonnes reconnus par les lecteurs
// d'écran : Nom · État · Nombre de demandes · Actions, dans l'ordre du
// formulaire. Une catégorie active est écrite « Active » ; une catégorie
// désactivée (story 4.2) porte le badge gris *Désactivée*, toujours écrit
// en toutes lettres (la couleur n'est jamais la seule information).
//
// Colonne « Actions » : « Renommer » (`renommer-categorie.tsx`, qui rend
// chaque ligne). « Désactiver », « Réactiver » et « Supprimer » viendront
// avec la story 4.2. Le champ « Nouvelle catégorie » est au-dessus
// (`ajouter-categorie.tsx`). Pas d'état vide : il reste toujours au moins
// une catégorie active.

const EN_TETE = "px-3 py-2.5 text-left text-caption font-semibold tracking-wide text-text-muted uppercase";

/** Badge *Désactivée* (DESIGN.md, Badges : gris, 24 px, coins de 6 px). */
export function BadgeDesactivee() {
  return (
    <span
      data-slot="badge-desactivee"
      className="inline-flex h-6 items-center rounded-sm bg-inactive-bg px-2.5 text-caption font-semibold whitespace-nowrap text-inactive-fg"
    >
      {MESSAGES_CATEGORIES.desactivee}
    </span>
  );
}

export function TableauCategories({ categories }: { categories: CategorieAdministration[] }) {
  const { colonnes } = MESSAGES_CATEGORIES;
  return (
    <div className="overflow-x-auto rounded-lg border bg-background shadow-soft">
      <table data-slot="tableau-categories" className="w-full border-collapse text-body-sm text-text">
        <caption className="sr-only">{MESSAGES_CATEGORIES.legendeTableau}</caption>
        <thead className="bg-surface-muted">
          <tr>
            <th scope="col" className={EN_TETE}>{colonnes.nom}</th>
            <th scope="col" className={EN_TETE}>{colonnes.etat}</th>
            <th scope="col" className={EN_TETE}>{colonnes.nombreDemandes}</th>
            <th scope="col" className={EN_TETE}>{colonnes.actions}</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((categorie) => (
            <LigneCategorie
              key={categorie.id}
              categorie={categorie}
              etatCategorie={categorie.active ? MESSAGES_CATEGORIES.active : <BadgeDesactivee />}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Les catégories n'ont pas pu être lues : message et « Réessayer ». */
export function EtatCategoriesErreur() {
  return (
    <div
      data-slot="categories-erreur"
      role="alert"
      className="flex flex-col items-center rounded-lg border bg-background px-5 py-7 text-center shadow-soft"
    >
      <span
        aria-hidden="true"
        className="mb-3 flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger"
      >
        <CircleAlert />
      </span>
      <p className="mb-4 text-body font-semibold text-urgent-fg">{MESSAGES_CATEGORIES.erreur}</p>
      <BoutonReessayer />
    </div>
  );
}

/** Nombre de lignes grises du squelette de la liste. */
export const LIGNES_SQUELETTE_CATEGORIES = 5;

/**
 * Squelette de l'écran A2 (DESIGN.md, Squelette) : le titre, le champ
 * d'ajout et les lignes de la liste en gris, visibles seulement après
 * 300 ms, sans animation.
 */
export function SqueletteCategories() {
  return (
    <div data-slot="squelette" role="status" className="animate-apres-300ms flex flex-col gap-5">
      <span className="sr-only">{MESSAGES_CATEGORIES.chargement}</span>
      <div className="h-8 w-40 rounded-sm bg-border" />
      <div className="flex max-w-xl items-end gap-2.5">
        <div className="h-control flex-1 rounded-sm bg-border" />
        <div className="h-control w-28 rounded-md bg-border" />
      </div>
      <div className="rounded-lg border bg-background px-3 shadow-soft">
        {Array.from({ length: LIGNES_SQUELETTE_CATEGORIES }, (_, index) => (
          <div
            key={index}
            data-slot="ligne-squelette"
            className="flex h-14 items-center gap-3 border-b last:border-b-0"
          >
            <div className="h-3 flex-1 rounded-sm bg-border" />
            <div className="h-3 w-16 rounded-sm bg-border" />
            <div className="h-3 w-12 rounded-sm bg-border" />
            <div className="h-3 w-24 rounded-sm bg-border" />
          </div>
        ))}
      </div>
    </div>
  );
}

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ADRESSE_ACCUEIL_INTERNE } from "@/shared/acces";
import { TAILLE_PAGE } from "@/shared/constantes";
import { MESSAGES_LISTE, resumePagination } from "@/shared/messages";

// Pagination de la liste (DESIGN.md, Pagination ; FR-11) : « Demandes 1 à
// 25 sur 42 · Page 1 sur 2 », puis deux boutons secondaires de 36 px. Le
// bouton inutile est grisé. La page est gardée dans l'adresse (`?page=`),
// comme les futurs filtres.

/** Adresse d'une page de la liste : la page 1 est l'adresse simple. */
export function adressePage(page: number): string {
  return page <= 1 ? ADRESSE_ACCUEIL_INTERNE : `${ADRESSE_ACCUEIL_INTERNE}?page=${page}`;
}

export function Pagination({ total, page, pages }: { total: number; page: number; pages: number }) {
  const premiere = total === 0 ? 0 : (page - 1) * TAILLE_PAGE + 1;
  const derniere = Math.min(page * TAILLE_PAGE, total);

  return (
    <nav
      aria-label={MESSAGES_LISTE.pagination}
      data-slot="pagination"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-body-sm text-text-muted"
    >
      <p>{resumePagination({ premiere, derniere, total, page, pages })}</p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="secondaire" size="sm">
            <Link href={adressePage(page - 1)} rel="prev">
              <ChevronLeft aria-hidden="true" />
              {MESSAGES_LISTE.precedente}
            </Link>
          </Button>
        ) : (
          <Button variant="secondaire" size="sm" disabled>
            <ChevronLeft aria-hidden="true" />
            {MESSAGES_LISTE.precedente}
          </Button>
        )}
        {page < pages ? (
          <Button asChild variant="secondaire" size="sm">
            <Link href={adressePage(page + 1)} rel="next">
              {MESSAGES_LISTE.suivante}
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button variant="secondaire" size="sm" disabled>
            {MESSAGES_LISTE.suivante}
            <ChevronRight aria-hidden="true" />
          </Button>
        )}
      </div>
    </nav>
  );
}

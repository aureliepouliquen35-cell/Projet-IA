import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { MESSAGES_DETAIL } from "@/shared/messages";

// Fil d'Ariane du détail (DESIGN.md, Fil d'Ariane ; EXPERIENCE.md, I4) :
// en `caption`, le lien « ← Demandes » en bleu, puis la référence en chasse
// fixe. Le lien ramène à la liste d'où l'on vient (même recherche, même
// page) : son adresse est calculée par la page à partir de la sienne
// (`adresseListe`).

export function FilAriane({ retour, reference }: { retour: string; reference: string }) {
  return (
    <nav aria-label={MESSAGES_DETAIL.filAriane} data-slot="fil-ariane" className="mb-3.5 text-caption text-text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link
            href={retour}
            className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2 hover:no-underline"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {MESSAGES_DETAIL.retourListe}
          </Link>
        </li>
        <li aria-hidden="true" className="flex items-center">
          <ChevronRight className="size-3.5" />
        </li>
        <li>
          <span aria-current="page" className="font-mono">
            {reference}
          </span>
        </li>
      </ol>
    </nav>
  );
}

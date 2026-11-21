import type { Metadata } from "next";
import { Suspense } from "react";

import { SqueletteDemande } from "@/components/interne/squelette-demande";
import { MESSAGES_DETAIL } from "@/shared/messages";

import { ContenuDemande } from "./contenu-demande";

// I4 — Détail d'une demande (FR-15, FR-17) : `/demandes/NOVA-2026-0042`,
// ouvert depuis une ligne de la liste (I3).
//
// Tout dépend de l'adresse (référence, `?q=` et `?page=` de la liste d'où
// l'on vient) et de la personne connectée (cookies) : `ContenuDemande`
// reçoit les deux promesses et les lit lui-même, sous `<Suspense>` (doc
// Next.js, « Dynamic Segments » avec Cache Components). Pendant la lecture,
// le squelette apparaît après 300 ms.
//
// Comme toute page interne, le contenu vérifie lui-même la personne
// connectée (`exigerUtilisateur`, AD-7) avant toute lecture. Une demande
// introuvable affiche `not-found.tsx` de ce dossier ; une panne, l'écran S3.

export const metadata: Metadata = {
  title: `${MESSAGES_DETAIL.titre} — Nova Services`,
};

export default function PageDemande({ params, searchParams }: PageProps<"/demandes/[reference]">) {
  return (
    <main className="mx-auto w-full max-w-content flex-1 px-gutter-mobile py-8 sm:px-gutter-desktop">
      <Suspense fallback={<SqueletteDemande />}>
        <ContenuDemande params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";

import { SqueletteListe } from "@/components/interne/etat-liste";
import { MESSAGES_LISTE } from "@/shared/messages";

import { ContenuDemandes } from "./contenu-demandes";

// I3 — Demandes (accueil interne) : carte « à traiter », puis la liste
// paginée de toutes les demandes (FR-11, FR-14, RM-6).
//
// Le titre est dans la coque statique. Le reste dépend de l'adresse
// (`?page=`) et de la personne connectée (cookies) : `ContenuDemandes`
// reçoit la promesse `searchParams` et la lit lui-même, sous `<Suspense>`
// (doc Next.js : « Move URL-dependent work behind Suspense »). Pendant la
// lecture, le squelette (carte + 8 lignes) apparaît après 300 ms.
//
// Comme toute page interne, le contenu vérifie lui-même la personne
// connectée (`exigerUtilisateur`, AD-7) avant toute lecture.

export const metadata: Metadata = {
  title: "Demandes — Nova Services",
};

export default function PageDemandes({ searchParams }: PageProps<"/demandes">) {
  return (
    <main className="mx-auto w-full max-w-content flex-1 px-gutter-mobile py-8 sm:px-gutter-desktop">
      <h1 className="mb-5 text-page-title text-text">{MESSAGES_LISTE.titre}</h1>
      <Suspense fallback={<SqueletteListe />}>
        <ContenuDemandes searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

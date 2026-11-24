import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SqueletteListe } from "@/components/interne/etat-liste";
import { Button } from "@/components/ui/button";
import { ADRESSE_NOUVELLE_DEMANDE } from "@/shared/acces";
import { MESSAGES_LISTE } from "@/shared/messages";

import { ContenuDemandes } from "./contenu-demandes";

// I3 — Demandes (accueil interne) : carte « à traiter », puis la liste
// paginée de toutes les demandes (FR-11, FR-14, RM-6).
//
// Le titre et le bouton principal « Nouvelle demande » (vers I5, story 2.3)
// sont dans la coque statique. Le reste dépend de l'adresse
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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page-title text-text">{MESSAGES_LISTE.titre}</h1>
        <Button asChild>
          <Link href={ADRESSE_NOUVELLE_DEMANDE} data-slot="bouton-nouvelle-demande">
            <Plus aria-hidden="true" />
            {MESSAGES_LISTE.nouvelleDemande}
          </Link>
        </Button>
      </div>
      <Suspense fallback={<SqueletteListe />}>
        <ContenuDemandes searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

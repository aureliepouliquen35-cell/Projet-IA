import type { Metadata } from "next";
import { Suspense } from "react";

import { SqueletteInformations } from "@/components/interne/informations-generales";
import { TITRE_ONGLET_ADMINISTRATION } from "@/shared/messages";

import { ContenuInformations } from "./contenu-informations";

// A3 — Informations générales (story 4.3 ; FR-31, RM-7) :
// `/admin/informations`, ouvert depuis le menu « Administration ›
// Informations générales », réservé aux administrateurs.
//
// La coque statique ne contient rien de la page : le titre et le formulaire
// sont rendus par `ContenuInformations`, sous `<Suspense>`, après la
// vérification du rôle (cookies, `exigerAdministrateur`, AD-7). Un
// collaborateur qui tape l'adresse voit donc l'écran S1 seul, à la même
// adresse, menu gardé, sans aucune information de contact dans la réponse.
// Pendant la lecture, le squelette des trois champs apparaît après 300 ms.
//
// Le titre de l'onglet, statique, est neutre (« Administration ») : il
// s'affiche aussi au-dessus de S1.

export const metadata: Metadata = {
  title: TITRE_ONGLET_ADMINISTRATION,
};

export default function PageInformations() {
  return (
    <main className="mx-auto w-full max-w-content flex-1 px-gutter-mobile py-8 sm:px-gutter-desktop">
      <Suspense fallback={<SqueletteInformations />}>
        <ContenuInformations />
      </Suspense>
    </main>
  );
}

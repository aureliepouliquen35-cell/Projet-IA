import type { Metadata } from "next";
import { Suspense } from "react";

import { SqueletteComptes } from "@/components/interne/tableau-comptes";
import { TITRE_ONGLET_ADMINISTRATION } from "@/shared/messages";

import { ContenuComptes } from "./contenu-comptes";

// A1 — Comptes (story 3.1 ; FR-24, RM-7) : `/admin/comptes`, ouvert depuis
// le menu « Administration › Comptes », réservé aux administrateurs.
//
// La coque statique ne contient rien de la page : le titre « Comptes » et le
// tableau sont rendus par `ContenuComptes`, sous `<Suspense>`, après la
// vérification du rôle (cookies, `exigerAdministrateur`, AD-7). Un
// collaborateur qui tape l'adresse voit donc l'écran S1 seul, à la même
// adresse, menu gardé, sans aucune donnée de compte dans la réponse. Pendant
// la lecture, le squelette apparaît après 300 ms.
//
// Le titre de l'onglet, statique, est neutre (« Administration ») : il
// s'affiche aussi au-dessus de S1.
//
// `/admin` seul n'est pas une page : S2, comme toute adresse inconnue.

export const metadata: Metadata = {
  title: TITRE_ONGLET_ADMINISTRATION,
};

export default function PageComptes() {
  return (
    <main className="mx-auto w-full max-w-content flex-1 px-gutter-mobile py-8 sm:px-gutter-desktop">
      <Suspense fallback={<SqueletteComptes />}>
        <ContenuComptes />
      </Suspense>
    </main>
  );
}

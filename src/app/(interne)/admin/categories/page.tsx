import type { Metadata } from "next";
import { Suspense } from "react";

import { SqueletteCategories } from "@/components/interne/tableau-categories";
import { TITRE_ONGLET_ADMINISTRATION } from "@/shared/messages";

import { ContenuCategories } from "./contenu-categories";

// A2 — Catégories (story 4.1 ; FR-26, RM-7) : `/admin/categories`, ouvert
// depuis le menu « Administration › Catégories », réservé aux
// administrateurs.
//
// La coque statique ne contient rien de la page : le titre, le champ
// d'ajout et la liste sont rendus par `ContenuCategories`, sous
// `<Suspense>`, après la vérification du rôle (cookies,
// `exigerAdministrateur`, AD-7). Un collaborateur qui tape l'adresse voit
// donc l'écran S1 seul, à la même adresse, menu gardé, sans aucune donnée
// de catégorie dans la réponse. Pendant la lecture, le squelette apparaît
// après 300 ms.
//
// Le titre de l'onglet, statique, est neutre (« Administration ») : il
// s'affiche aussi au-dessus de S1.

export const metadata: Metadata = {
  title: TITRE_ONGLET_ADMINISTRATION,
};

export default function PageCategories() {
  return (
    <main className="mx-auto w-full max-w-content flex-1 px-gutter-mobile py-8 sm:px-gutter-desktop">
      <Suspense fallback={<SqueletteCategories />}>
        <ContenuCategories />
      </Suspense>
    </main>
  );
}

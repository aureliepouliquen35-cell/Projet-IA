import type { Metadata } from "next";
import { Suspense } from "react";

import { ContenuDemandes } from "./contenu-demandes";

// I3 — Demandes (accueil interne), version d'attente (story 1.6) : la page
// où l'on arrive après la connexion. La liste, la recherche et le compteur
// arrivent avec la story 1.8, qui remplacera cette page.
//
// Comme toute page interne, elle vérifie elle-même la personne connectée
// (`exigerUtilisateur` dans `ContenuDemandes`, AD-7) avant d'afficher son contenu, sous
// `<Suspense>` : la vérification lit les cookies.

export const metadata: Metadata = {
  title: "Demandes — Nova Services",
};

export default function PageDemandes() {
  return (
    <main className="mx-auto w-full max-w-content flex-1 px-gutter-desktop py-8">
      <Suspense fallback={<SqueletteContenu />}>
        <ContenuDemandes />
      </Suspense>
    </main>
  );
}

/** Squelette (DESIGN.md) : blocs gris, visibles seulement après 300 ms. */
function SqueletteContenu() {
  return (
    <div data-slot="squelette" role="status" className="animate-apres-300ms flex flex-col gap-3">
      <span className="sr-only">Chargement…</span>
      <div className="h-7 w-40 rounded-sm bg-border" />
      <div className="h-4 w-80 rounded-sm bg-border" />
    </div>
  );
}

import type { ReactNode } from "react";
import { Suspense } from "react";

import { Logo } from "@/components/logo";
import { RechargementSiRestauree } from "@/components/interne/bouton-deconnexion";
import { SqueletteUtilisateur, UtilisateurConnecte } from "@/components/interne/utilisateur-connecte";

// Espace interne (AD-7, FR-9, FR-10). Le proxy a déjà renvoyé vers la
// connexion toute requête sans session et interdit la mise en cache.
//
// Ce layout n'est **pas** une protection : Next.js rend chaque page à part
// (elle figure dans la réponse même si le layout ne l'affiche pas), et un
// layout n'est pas rendu de nouveau à chaque navigation. Chaque page interne
// appelle donc elle-même `exigerUtilisateur()` avant de lire quoi que ce
// soit. Ici, la garde ne sert qu'à afficher la personne connectée.
//
// La lecture du profil passe par les cookies : elle est faite sous
// `<Suspense>` (Cache Components), jamais dans la coque statique, et jamais
// gardée dans le navigateur (`use cache: private` n'est pas utilisé).
//
// Version minimale (story 1.6) : en-tête avec le logo, la personne
// connectée et « Se déconnecter ». Le menu latéral arrive avec la story 1.8.

export default function LayoutInterne({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-surface-muted">
      <RechargementSiRestauree />
      <header className="flex min-h-16 items-center justify-between gap-4 border-b bg-background px-gutter-desktop py-3">
        <Logo />
        <Suspense fallback={<SqueletteUtilisateur />}>
          <UtilisateurConnecte />
        </Suspense>
      </header>
      {children}
    </div>
  );
}

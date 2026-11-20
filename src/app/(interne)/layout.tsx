import type { ReactNode } from "react";

import { RechargementSiRestauree } from "@/components/interne/bouton-deconnexion";
import { MenuLateral } from "@/components/interne/menu-lateral";

// Espace interne (AD-7, FR-9, FR-10). Le proxy a déjà renvoyé vers la
// connexion toute requête sans session et interdit la mise en cache.
//
// Ce layout n'est **pas** une protection : Next.js rend chaque page à part
// (elle figure dans la réponse même si le layout ne l'affiche pas), et un
// layout n'est pas rendu de nouveau à chaque navigation. Chaque page interne
// appelle donc elle-même `exigerUtilisateur()` avant de lire quoi que ce
// soit. Ici, la garde ne sert qu'à afficher la personne connectée et la
// pastille du menu.
//
// Ces deux lectures passent par les cookies : elles sont faites sous
// `<Suspense>` dans le menu (Cache Components), jamais dans la coque
// statique, et jamais gardées dans le navigateur (`use cache: private`
// n'est pas utilisé).
//
// Menu latéral fixe à gauche à partir de 1 024 px, bandeau en haut en
// dessous (story 1.8).

export default function LayoutInterne({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-surface-muted lg:flex-row">
      <RechargementSiRestauree />
      <MenuLateral />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

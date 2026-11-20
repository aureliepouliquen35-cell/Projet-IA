import { connection } from "next/server";

import { BoutonDeconnexion } from "@/components/interne/bouton-deconnexion";
import { exigerUtilisateur } from "@/server/garde";
import { LIBELLES_ROLES } from "@/shared/constantes";

// Bas du menu latéral de l'espace interne : nom et rôle de la personne
// connectée, relus dans `profils` par la garde (AD-7), et « Se déconnecter »
// (FR-9). Lit les cookies : à placer sous `<Suspense>`, avec
// `SqueletteUtilisateur`.

export async function UtilisateurConnecte() {
  // Comme la pastille du menu : lecture à chaque visite seulement, car la
  // lecture de la session consulte l'heure (Cache Components).
  await connection();
  const { nom, role } = await exigerUtilisateur();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 lg:flex-col lg:items-stretch">
      <div>
        <p data-slot="nom-utilisateur" className="text-label font-semibold text-text">
          {nom}
        </p>
        <p data-slot="role-utilisateur" className="text-caption text-text-muted">
          {LIBELLES_ROLES[role]}
        </p>
      </div>
      <BoutonDeconnexion />
    </div>
  );
}

/** Squelette (DESIGN.md) : blocs gris, visibles seulement après 300 ms. */
export function SqueletteUtilisateur() {
  return (
    <div
      data-slot="squelette"
      role="status"
      className="animate-apres-300ms flex flex-wrap items-center gap-x-4 gap-y-3 lg:flex-col lg:items-stretch"
    >
      <span className="sr-only">Chargement…</span>
      <div className="flex flex-col gap-1">
        <div className="h-4 w-28 rounded-sm bg-border" />
        <div className="h-3 w-20 rounded-sm bg-border" />
      </div>
      <div className="h-9 w-36 rounded-md bg-border" />
    </div>
  );
}

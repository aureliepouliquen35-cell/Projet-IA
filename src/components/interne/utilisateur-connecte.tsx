import { BoutonDeconnexion } from "@/components/interne/bouton-deconnexion";
import { exigerUtilisateur } from "@/server/garde";
import { LIBELLES_ROLES } from "@/shared/constantes";

// En-tête de l'espace interne : nom et rôle de la personne connectée, relus
// dans `profils` par la garde (AD-7), et « Se déconnecter » (FR-9). Lit les
// cookies : à placer sous `<Suspense>`, avec `SqueletteUtilisateur`.

export async function UtilisateurConnecte() {
  const { nom, role } = await exigerUtilisateur();
  return (
    <div className="flex items-center gap-4">
      <div className="text-right">
        <p data-slot="nom-utilisateur" className="text-label text-text">
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
    <div data-slot="squelette" role="status" className="animate-apres-300ms flex items-center gap-4">
      <span className="sr-only">Chargement…</span>
      <div className="flex flex-col items-end gap-1">
        <div className="h-4 w-28 rounded-sm bg-border" />
        <div className="h-3 w-20 rounded-sm bg-border" />
      </div>
      <div className="h-9 w-36 rounded-md bg-border" />
    </div>
  );
}

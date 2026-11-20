import { cn } from "@/lib/utils";
import type { Statut } from "@/shared/constantes";
import { LIBELLES_STATUTS } from "@/shared/libelles";

// Badge de statut (DESIGN.md, Badges) : pilule de 24 px, texte en
// `caption` semi-gras. Le statut est toujours écrit en toutes lettres : la
// couleur aide l'œil, elle n'est jamais la seule information (FR-19). Non
// cliquable.

const COULEURS: Record<Statut, string> = {
  nouvelle: "bg-status-nouvelle-bg text-status-nouvelle-fg",
  en_cours: "bg-status-en-cours-bg text-status-en-cours-fg",
  traitee: "bg-status-traitee-bg text-status-traitee-fg",
};

export function BadgeStatut({ statut }: { statut: Statut }) {
  return (
    <span
      data-slot="badge-statut"
      data-statut={statut}
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-caption font-semibold whitespace-nowrap",
        COULEURS[statut],
      )}
    >
      {LIBELLES_STATUTS[statut]}
    </span>
  );
}

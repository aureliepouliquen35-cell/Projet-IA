import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ADRESSE_ACCUEIL_INTERNE } from "@/shared/acces";
import { MESSAGES_ACCES_REFUSE } from "@/shared/messages";

// S1 — Accès refusé (EXPERIENCE.md ; FR-24, RM-7) : un collaborateur a tapé
// l'adresse d'une page d'administration. Affiché par la page elle-même, à la
// même adresse, dans l'espace interne (le menu reste là) : la fonction
// expérimentale `forbidden()` de Next.js n'est pas utilisée.
//
// Même présentation que S2 (`ecran-erreur.tsx`) : le message en titre, puis
// « Retour aux demandes ». Sans logo (le menu latéral l'affiche déjà) ni
// `<main>` (la page a le sien). Rien de la page refusée n'y figure.

export function EcranAccesRefuse() {
  return (
    <div data-slot="acces-refuse" className="flex w-full max-w-form flex-col justify-center py-12">
      <h1 className="text-page-title text-text">{MESSAGES_ACCES_REFUSE.message}</h1>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href={ADRESSE_ACCUEIL_INTERNE}>
            <ArrowLeft aria-hidden="true" />
            {MESSAGES_ACCES_REFUSE.retourAuxDemandes}
          </Link>
        </Button>
      </div>
    </div>
  );
}

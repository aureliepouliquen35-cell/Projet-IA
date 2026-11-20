"use client";

import { LoaderCircle, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { MESSAGES_LISTE } from "@/shared/messages";

// « Réessayer » de l'état d'erreur de la liste (EXPERIENCE.md, I3) : relit
// la page sur le serveur (`router.refresh()`), sans recharger le navigateur.
// Indicateur sur le bouton pendant la relecture.

export function BoutonReessayer() {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();

  return (
    <Button
      variant="secondaire"
      disabled={enCours}
      aria-busy={enCours || undefined}
      onClick={() => demarrer(() => router.refresh())}
    >
      {enCours ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" />
      ) : (
        <RotateCw aria-hidden="true" />
      )}
      {MESSAGES_LISTE.reessayer}
    </Button>
  );
}

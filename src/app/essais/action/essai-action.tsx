"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { essaiErreurImprevue, essaiErreurPrevue } from "@/server/actions/essais";
import type { Reponse } from "@/shared/reponse";

export function EssaiAction() {
  const [reponse, setReponse] = useState<Reponse<never> | null>(null);
  const [enCours, demarrer] = useTransition();

  const appeler = (action: () => Promise<Reponse<never>>) =>
    demarrer(async () => setReponse(await action()));

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button disabled={enCours} onClick={() => appeler(essaiErreurPrevue)}>
          Erreur prévue
        </Button>
        <Button
          variant="secondaire"
          disabled={enCours}
          onClick={() => appeler(essaiErreurImprevue)}
        >
          Erreur imprévue
        </Button>
      </div>
      <pre
        aria-live="polite"
        className="min-h-24 rounded-md border bg-surface-muted p-4 font-mono text-body-sm whitespace-pre-wrap text-text"
      >
        {reponse ? JSON.stringify(reponse, null, 2) : "Aucune réponse pour l’instant."}
      </pre>
    </div>
  );
}

"use client"; // Les liens déplacent la sélection vers le champ (clic).

import { CircleAlert } from "lucide-react";
import type { MouseEvent, Ref } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { resumeErreurs } from "@/shared/messages";

// Résumé d'erreurs en haut d'un formulaire (UX-DR5, EXPERIENCE.md) : il
// apparaît après un envoi refusé, reçoit la sélection (`ref` + `tabIndex`),
// et liste les erreurs avec un lien vers chaque champ.

export type ErreurListee = {
  /** Identifiant du champ dans la page. */
  champ: string;
  message: string;
};

function allerAuChamp(evenement: MouseEvent<HTMLAnchorElement>, champ: string) {
  const controle = document.getElementById(champ);
  if (!controle) return; // Le lien `#champ` fait alors son travail habituel.
  evenement.preventDefault();
  controle.scrollIntoView({ block: "center" });
  controle.focus({ preventScroll: true });
}

export function ResumeErreurs({
  erreurs,
  className,
  ref,
}: {
  erreurs: ErreurListee[];
  className?: string;
  /** Pour donner la sélection à l'encadré après un envoi refusé. */
  ref?: Ref<HTMLDivElement>;
}) {
  if (erreurs.length === 0) return null;

  return (
    <Alert
      ref={ref}
      variant="erreur"
      tabIndex={-1}
      data-slot="resume-erreurs"
      className={className}
    >
      <AlertTitle>
        <CircleAlert aria-hidden="true" />
        {resumeErreurs(erreurs.length)}
      </AlertTitle>
      <AlertDescription>
        <ul>
          {erreurs.map(({ champ, message }) => (
            <li key={champ}>
              <a
                // Zone cliquable de 44 px de haut (EXPERIENCE.md).
                className="flex min-h-control items-center"
                href={`#${champ}`}
                onClick={(evenement) => allerAuChamp(evenement, champ)}
              >
                {message}
              </a>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

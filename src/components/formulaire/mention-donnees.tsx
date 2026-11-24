import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { FORME_EMAIL } from "@/shared/constantes";

// Mention sur l'usage des données (FR-5, EXPERIENCE.md) : affichée au-dessus
// de la case du formulaire public (P1), et dépliée par « Texte à lui lire »
// sur l'écran de saisie interne (I5), pour être lue à la personne. Un seul
// texte pour les deux écrans.

/** Email du contact données : un lien si c'en est un, sinon un simple texte. */
function ContactDonnees({ contact }: { contact: string }) {
  if (!FORME_EMAIL.test(contact)) return <>{contact}</>;
  return (
    <a href={`mailto:${contact}`} className="font-medium text-primary underline">
      {contact}
    </a>
  );
}

export function MentionDonnees({
  contactDonnees,
  id,
  className,
}: {
  /** Contact pour les données personnelles (paramètres de Nova, FR-31). */
  contactDonnees: string;
  id?: string;
  className?: string;
}) {
  return (
    <p
      id={id}
      data-slot="mention-donnees"
      className={cn(
        "rounded-md bg-accent-nova-soft p-3 text-caption leading-normal break-words text-text",
        className,
      )}
    >
      <ShieldCheck aria-hidden="true" className="mr-1 inline size-4 align-[-3px] text-accent-nova" />
      Vos données (nom, coordonnées et contenu de votre demande) sont utilisées
      par Nova Services uniquement pour traiter votre demande. Elles sont
      conservées 3 ans après sa clôture. Pour les consulter ou les faire
      supprimer : <ContactDonnees contact={contactDonnees} />.
    </p>
  );
}

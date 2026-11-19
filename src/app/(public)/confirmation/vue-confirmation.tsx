import { CircleCheck, SquarePlus } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import type { Confirmation } from "@/server/passage";
import { lienTelephone, type ContactsNova } from "@/shared/contacts";
import { MESSAGES_CONFIRMATION } from "@/shared/messages";

// P2 — Confirmation (EXPERIENCE.md), téléphone d'abord : une colonne, marges
// de 16 px, 560 px au plus sur grand écran, utilisable à 360 px.
//
// Écran sans état : il reçoit la demande enregistrée (lue dans le cookie de
// passage, AD-20) et les contacts de Nova (relus en base à chaque affichage,
// FR-31).

export function VueConfirmation({
  confirmation,
  contacts,
}: {
  confirmation: Confirmation;
  contacts: ContactsNova;
}) {
  const textes = MESSAGES_CONFIRMATION;

  return (
    <main className="mx-auto flex w-full max-w-form flex-1 flex-col px-gutter-mobile pb-12">
      <header className="-mx-gutter-mobile mb-6 border-b px-gutter-mobile py-4">
        <Logo />
      </header>

      {/* 1. Icône de validation verte et titre (texte exact de FR-4). */}
      <div className="flex items-center gap-3">
        <span className="inline-flex size-11 flex-none items-center justify-center rounded-full bg-success-soft text-success">
          <CircleCheck aria-hidden="true" className="size-6" />
        </span>
        <h1 className="text-page-title text-text">{textes.titre}</h1>
      </div>

      {/* 2 et 3. La référence en grand, dans l'encadré du moment clé : bord
          gauche violet, dégradé du blanc vers le violet très clair. */}
      <section
        aria-labelledby="reference-etiquette"
        data-slot="encadre-reference"
        className="mt-6 rounded-lg border border-l-4 border-l-accent-nova bg-linear-to-b from-background to-accent-nova-soft p-5 shadow-soft"
      >
        <p id="reference-etiquette" className="text-label text-text-muted">
          {textes.votreReference}
        </p>
        <p
          data-slot="reference"
          className="mt-1 font-mono text-reference-confirmation whitespace-nowrap text-text"
        >
          {confirmation.reference}
        </p>
        <p className="mt-3 text-body-sm text-text-muted">{textes.notezLa}</p>
      </section>

      {/* 4. Rappel : l'objet de la demande et l'email saisi. */}
      <dl className="mt-6">
        <dt className="text-label text-text-muted">{textes.objet}</dt>
        <dd data-slot="objet" className="mt-0.5 text-body text-text wrap-anywhere">
          {confirmation.objet}
        </dd>
      </dl>
      <p data-slot="reponse-a" className="mt-4 text-body text-text">
        {textes.reponseA}{" "}
        <span className="font-medium wrap-anywhere">{confirmation.email}</span>
      </p>

      {/* 5. Bloc contact (FR-31) : téléphone, s'il est renseigné, et email. */}
      <p
        data-slot="contact"
        className="mt-6 rounded-md bg-surface-muted p-3 text-body-sm text-text"
      >
        {textes.questionUrgente}{" "}
        {contacts.telephone ? (
          <>
            <a
              href={lienTelephone(contacts.telephone)}
              className="font-medium whitespace-nowrap text-primary underline"
            >
              {contacts.telephone}
            </a>{" "}
            —{" "}
          </>
        ) : null}
        <a
          href={`mailto:${contacts.emailContact}`}
          className="font-medium text-primary underline wrap-anywhere"
        >
          {contacts.emailContact}
        </a>
      </p>

      {/* 6. Lien discret vers un formulaire vierge. */}
      <Link
        href="/"
        className={buttonVariants({ variant: "discret", className: "mt-6 self-start" })}
      >
        <SquarePlus aria-hidden="true" />
        {textes.autreDemande}
      </Link>
    </main>
  );
}

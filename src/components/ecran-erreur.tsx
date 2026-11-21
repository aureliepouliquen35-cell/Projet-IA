import { CircleAlert, RotateCw, SquarePlus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formaterDateHeure } from "@/shared/dates";
import { MESSAGE_ERREUR_INATTENDUE, MESSAGE_PAGE_INTROUVABLE } from "@/shared/messages";

// Écrans S2 (page introuvable) et S3 (erreur inattendue) d'EXPERIENCE.md
// (UX-DR19). Composants sans état : utilisables par `not-found.tsx` (serveur)
// comme par `error.tsx` et `global-error.tsx` (navigateur), qui leur passent
// le code, l'heure et la page.
//
// Liens vers les demandes (personne connectée, stories 1.6 et 1.8) : à venir.
// Téléphone de Nova sur S3 : reporté (voir deferred-work.md, story 1.3).

function EcranErreur({
  icone,
  message,
  actions,
  pied,
}: {
  /** Pastille d'icône au-dessus du message ; absente sur S2. */
  icone?: ReactNode;
  message: string;
  actions: ReactNode;
  pied?: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-form flex-1 flex-col justify-center px-gutter-mobile py-12">
      <Logo />
      {icone && <div className="mt-8">{icone}</div>}
      <h1 className={cn("text-page-title text-text", icone ? "mt-4" : "mt-8")}>{message}</h1>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">{actions}</div>
      {pied}
    </main>
  );
}

function LienDeposerDemande({ variante }: { variante: "principal" | "secondaire" }) {
  return (
    <Button asChild variant={variante}>
      <Link href="/">
        <SquarePlus aria-hidden="true" />
        Déposer une demande
      </Link>
    </Button>
  );
}

/**
 * S2 — Page introuvable. Par défaut, le message général et « Déposer une
 * demande » ; une page interne peut donner son propre message et son lien
 * (détail I4 : « Cette demande n'existe pas… » et « Retour aux demandes »).
 *
 * Logo gardé, sans pastille d'icône (décisions d'Aurel, 21 nov. 2026) : la
 * feuille au point d'interrogation faisait croire à une anomalie de la page.
 */
export function EcranPageIntrouvable({
  message = MESSAGE_PAGE_INTROUVABLE,
  actions = <LienDeposerDemande variante="principal" />,
}: {
  message?: string;
  actions?: ReactNode;
} = {}) {
  return <EcranErreur message={message} actions={actions} />;
}

/** S3 — Erreur inattendue, avec la ligne à recopier pour le support. */
export function EcranErreurInattendue({
  code,
  date,
  page,
  onReessayer,
}: {
  /** Absent pour une erreur survenue dans le navigateur (pas d'empreinte). */
  code?: string;
  date: Date;
  /** Chemin de la page, sans ses paramètres. */
  page: string;
  onReessayer: () => void;
}) {
  const elements = [
    ...(code ? [`Code : ${code}`] : []),
    formaterDateHeure(date),
    page,
  ];

  return (
    <EcranErreur
      icone={
        <span className="flex size-control items-center justify-center rounded-full bg-danger-soft text-danger">
          <CircleAlert aria-hidden="true" className="size-5" />
        </span>
      }
      message={MESSAGE_ERREUR_INATTENDUE}
      actions={
        <>
          <Button onClick={onReessayer}>
            <RotateCw aria-hidden="true" />
            Réessayer
          </Button>
          <LienDeposerDemande variante="secondaire" />
        </>
      }
      pied={
        <p
          className="mt-10 text-caption text-text-muted select-all"
          // L'heure est calculée à l'affichage : elle peut différer d'une
          // minute entre le serveur et le navigateur.
          suppressHydrationWarning
        >
          {elements.join(" · ")}
        </p>
      }
    />
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Élément du menu latéral (DESIGN.md, Menu latéral). Actif quand l'adresse
// est la sienne ou une de ses sous-pages (`/demandes/NOVA-2026-0042`) :
// fond bleu très clair, icône violette, barre violette de 3 px à gauche, et
// `aria-current="page"` pour les lecteurs d'écran.
//
// L'adresse n'est pas connue d'avance sous une page à segment dynamique
// (`/demandes/[reference]`) : avec Cache Components, `usePathname()` y
// attend la requête. `LienMenu` est donc placé sous `<Suspense>` par le menu,
// avec `VueLienMenu` inactif en attendant (doc Next.js, `usePathname`).

/** Vrai si `chemin` est `adresse`, seule ou suivie de `/…`. */
export function estActif(chemin: string | null, adresse: string): boolean {
  if (!chemin) return false;
  return chemin === adresse || chemin.startsWith(`${adresse}/`);
}

type ProprietesLienMenu = {
  href: string;
  /** Icône lucide-react, déjà rendue, cachée aux lecteurs d'écran. */
  icone: ReactNode;
  /** Libellé de l'élément. */
  children: ReactNode;
  /** Placé à droite du libellé (pastille). */
  fin?: ReactNode;
};

/** L'élément du menu, actif selon l'adresse en cours. */
export function LienMenu(proprietes: ProprietesLienMenu) {
  return <VueLienMenu {...proprietes} actif={estActif(usePathname(), proprietes.href)} />;
}

/** L'élément du menu, actif ou non, sans lire l'adresse. */
export function VueLienMenu({ href, icone, children, fin, actif }: ProprietesLienMenu & { actif: boolean }) {
  return (
    <Link
      href={href}
      aria-current={actif ? "page" : undefined}
      data-slot="lien-menu"
      className={cn(
        "flex h-control items-center justify-between gap-3 rounded-md px-3 text-label text-text-muted transition-colors hover:bg-surface-subtle [&_svg]:size-[18px] [&_svg]:shrink-0",
        actif &&
          "bg-primary-soft text-primary shadow-[inset_3px_0_0_var(--color-accent-nova)] hover:bg-primary-soft [&_svg]:text-accent-nova",
      )}
    >
      <span className="flex items-center gap-2.5">
        {icone}
        {children}
      </span>
      {fin}
    </Link>
  );
}

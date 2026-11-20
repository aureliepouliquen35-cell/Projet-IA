"use client";

import { Check } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// Toasts de DESIGN.md (`components.toast`) et d'EXPERIENCE.md : en bas à
// droite, fond foncé (`text`), texte blanc, coins de 12 px, ombre nette ;
// pastille verte avec une coche pour un succès ; disparition après 5 s ;
// annoncés aux lecteurs d'écran (zone `aria-live` de Sonner).
//
// Placé une seule fois, dans le layout racine : il reste à l'écran quand on
// change de page sans rechargement (I2 → « Demandes »).

/** Durée d'affichage d'un toast de succès (EXPERIENCE.md). */
export const DUREE_TOAST_MS = 5000;

function PastilleSucces() {
  return (
    <span
      aria-hidden="true"
      className="flex size-5 items-center justify-center rounded-full bg-success text-background"
    >
      <Check className="size-3.5" />
    </span>
  );
}

function PastilleErreur() {
  return (
    <span
      aria-hidden="true"
      className="flex size-5 items-center justify-center rounded-full bg-danger text-caption font-bold text-background"
    >
      !
    </span>
  );
}

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      duration={DUREE_TOAST_MS}
      containerAriaLabel="Notifications"
      icons={{ success: <PastilleSucces />, error: <PastilleErreur /> }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-center gap-3 rounded-[12px] bg-text px-4 py-3 text-body-sm text-background shadow-toast",
          title: "font-medium",
          icon: "flex shrink-0 items-center",
        },
      }}
      {...props}
    />
  );
}

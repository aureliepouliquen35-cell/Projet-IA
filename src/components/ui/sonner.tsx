"use client";

import { Check, X } from "lucide-react";
import { toast, Toaster as Sonner, type ToasterProps } from "sonner";

import { MESSAGE_FERMER_NOTIFICATION } from "@/shared/messages";

// Toasts de DESIGN.md (`components.toast`) et d'EXPERIENCE.md : en bas à
// droite, fond foncé (`text`), texte blanc, coins de 12 px, ombre nette ;
// pastille verte avec une coche pour un succès, rouge avec « ! » pour une
// erreur ; annoncés aux lecteurs d'écran (zone `aria-live` de Sonner).
//
// - Succès (`afficherSucces`) : disparaît après 5 s.
// - Erreur (`afficherErreur`) : reste jusqu'à ce qu'on la ferme, avec un
//   bouton « Fermer la notification » (croix).
//
// Placé une seule fois, dans le layout racine : il reste à l'écran quand on
// change de page sans rechargement (I2 → « Demandes »).

/** Durée d'affichage d'un toast de succès (EXPERIENCE.md). */
export const DUREE_TOAST_MS = 5000;

/** Toast de succès : 5 s. */
export function afficherSucces(message: string) {
  toast.success(message);
}

/**
 * Toast d'erreur : jusqu'à fermeture, avec son bouton « Fermer ». Le message
 * sert d'identifiant : la même erreur répétée remplace le toast déjà affiché
 * au lieu d'en empiler un autre.
 */
export function afficherErreur(message: string) {
  toast.error(message, { id: message, duration: Infinity, closeButton: true });
}

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
      icons={{
        success: <PastilleSucces />,
        error: <PastilleErreur />,
        close: <X aria-hidden="true" className="size-4" />,
      }}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: MESSAGE_FERMER_NOTIFICATION,
        classNames: {
          toast:
            "flex w-full items-center gap-3 rounded-[12px] bg-text px-4 py-3 text-body-sm text-background shadow-toast",
          title: "font-medium",
          icon: "flex shrink-0 items-center",
          // Après le texte, à droite (Sonner le place en premier).
          closeButton:
            "order-last ml-auto flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-background hover:bg-background/15",
        },
      }}
      {...props}
    />
  );
}

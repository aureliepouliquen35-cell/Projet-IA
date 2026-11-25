"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

// Fenêtre de formulaire (« Créer un compte », story 3.2), au même aspect que
// la fenêtre de confirmation (`alert-dialog.tsx`, DESIGN.md
// `components.dialog`) : centrée, 440 px de large au plus, fond blanc, coins
// de 14 px, ombre nette, voile sombre derrière ; un titre, puis le
// formulaire, ses boutons alignés à droite.
//
// Comportement (Radix) : Échap ferme la fenêtre, la sélection reste dans la
// fenêtre tant qu'elle est ouverte et revient au bouton qui l'a ouverte. Une
// seule fenêtre à la fois. La sélection à l'ouverture se règle par
// `onOpenAutoFocus` (premier champ du formulaire).
//
// Pas de croix de fermeture : « Annuler » ou « Fermer » dans la fenêtre, et
// Échap, suffisent.

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn("fixed inset-0 z-50 bg-text/45", className)}
      {...props}
    />
  );
}

function DialogContent({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          // Une fenêtre plus haute que l'écran (tablette à l'horizontale)
          // défile à l'intérieur.
          "fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-background p-6 text-text shadow-dialog",
          className,
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("mb-2.5 text-section-title text-text", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("mb-5 text-body-sm text-text-muted", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export { Dialog, DialogContent, DialogDescription, DialogFooter, DialogOverlay, DialogTitle, DialogTrigger };

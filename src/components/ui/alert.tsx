import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Messages d'alerte de DESIGN.md (UX-DR11) : fond clair, barre de 4 px à
// gauche, coins de 10 px.
// - erreur : une erreur qui concerne toute la page ou tout le formulaire ;
// - succes : une confirmation courte ;
// - information : une information neutre (« Votre session a expiré »).
// Jamais de violet (accent) dans une alerte.
const alertVariants = cva(
  "rounded-md border-l-4 p-3 text-body-sm [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        erreur: "border-danger bg-danger-soft text-urgent-fg",
        succes: "border-success bg-success-soft text-status-traitee-fg",
        information: "border-primary bg-primary-soft text-primary",
      },
    },
    defaultVariants: {
      variant: "information",
    },
  },
);

function Alert({
  className,
  variant = "information",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      data-variant={variant}
      // Une erreur est annoncée aussitôt par les lecteurs d'écran (`alert`) ;
      // une confirmation ou une information l'est sans couper la lecture en
      // cours (`status`). Un `role` passé en propriété l'emporte.
      role={variant === "erreur" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="alert-title"
      className={cn("flex items-start gap-1.5 font-semibold [&_svg]:mt-0.5", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("mt-1 [&_a]:font-medium [&_a]:underline", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };

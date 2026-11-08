import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

// Boutons de DESIGN.md (UX-DR3) :
// - principal : une seule fois par écran (« Envoyer ma demande ») ;
// - secondaire : actions annexes (« Annuler ») ;
// - discret : liens d'action (« Voir tout ») ;
// - danger : uniquement dans la fenêtre qui confirme une suppression.
// Jamais de violet (accent) sur un bouton.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-label whitespace-nowrap transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        principal:
          "bg-primary text-primary-foreground shadow-primary hover:not-disabled:bg-primary-hover",
        secondaire:
          "border-border-input bg-background text-text hover:not-disabled:bg-surface-subtle",
        discret:
          "bg-transparent text-primary hover:not-disabled:bg-primary-soft",
        danger:
          "bg-danger text-danger-foreground hover:not-disabled:bg-[color-mix(in_oklab,var(--color-danger),var(--color-text)_15%)]",
      },
      size: {
        // 44 px : hauteur des contrôles (DESIGN.md, control-height).
        default: "h-control px-4",
        // 36 px : pagination, filtres.
        sm: "h-9 px-3",
        icon: "size-control",
      },
    },
    defaultVariants: {
      variant: "principal",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "principal",
  size = "default",
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      // Un <button> sans type envoie le formulaire qui l'entoure : on impose
      // « button » par défaut, « submit » doit être demandé explicitement.
      type={asChild ? type : (type ?? "button")}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

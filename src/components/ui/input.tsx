import * as React from "react";

import { cn } from "@/lib/utils";

// Champ de saisie de DESIGN.md (UX-DR4) : 44 px de haut, texte de 16 px (en
// dessous, les iPhone zooment sur la page), bordure `border-input`.
// En erreur (`aria-invalid`) : bordure rouge de 2 px ; l'espacement intérieur
// perd 1 px pour que le texte ne bouge pas.
// Le contour de sélection au clavier est celui de globals.css, jamais retiré.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-control w-full min-w-0 rounded-sm border border-border-input bg-background px-3 text-body text-text placeholder:text-text-subtle disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-2 aria-invalid:border-danger aria-invalid:px-[11px]",
        className,
      )}
      {...props}
    />
  );
}

export { Input };

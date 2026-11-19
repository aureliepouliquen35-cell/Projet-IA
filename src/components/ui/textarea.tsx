import * as React from "react";

import { cn } from "@/lib/utils";

// Zone de texte de DESIGN.md (UX-DR4) : même habillage que `Input`, 112 px de
// haut au moins ; elle grandit avec le texte quand le navigateur le permet.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "block field-sizing-content min-h-28 w-full resize-y rounded-sm border border-border-input bg-background px-3 py-2.5 text-body text-text placeholder:text-text-subtle disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-2 aria-invalid:border-danger aria-invalid:px-[11px] aria-invalid:py-[9px]",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

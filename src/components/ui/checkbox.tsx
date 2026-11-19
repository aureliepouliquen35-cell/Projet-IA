"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

// Case à cocher de DESIGN.md (UX-DR13) : carré de 22 px aux coins de 6 px ;
// cochée, fond bleu et coche blanche. La zone cliquable est étendue à
// 44 × 44 px (`after:`). Toujours accompagnée de son libellé cliquable.
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "relative flex size-5.5 shrink-0 items-center justify-center rounded-sm border border-border-input bg-background text-primary-foreground after:absolute after:-inset-[11px] disabled:cursor-not-allowed disabled:opacity-50 aria-checked:border-primary aria-checked:bg-primary aria-invalid:border-2 aria-invalid:border-danger aria-invalid:aria-checked:border-primary",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center"
      >
        <Check aria-hidden="true" className="size-4" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };

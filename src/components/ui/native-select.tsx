import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

// Liste déroulante de DESIGN.md (UX-DR13) : même aspect qu'un champ, avec un
// chevron à droite. C'est la liste du navigateur : au doigt comme au clavier,
// elle se comporte comme l'utilisateur en a l'habitude.
// `className` habille le conteneur ; les autres propriétés vont à la liste.
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div
      data-slot="native-select-wrapper"
      className={cn("relative w-full has-[select:disabled]:opacity-50", className)}
    >
      <select
        data-slot="native-select"
        className="h-control w-full min-w-0 appearance-none rounded-sm border border-border-input bg-background pr-10 pl-3 text-body text-text disabled:cursor-not-allowed aria-invalid:border-2 aria-invalid:border-danger aria-invalid:pr-[39px] aria-invalid:pl-[11px]"
        {...props}
      />
      <ChevronDown
        aria-hidden="true"
        data-slot="native-select-icon"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-muted"
      />
    </div>
  );
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-background text-text", className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOption };

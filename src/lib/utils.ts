import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge doit connaître les tokens nommés de globals.css : sinon il
// prend `text-label` (taille) pour une couleur et le supprime face à
// `text-primary-foreground`, par exemple.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "page-title",
        "section-title",
        "body",
        "body-sm",
        "label",
        "caption",
        "counter",
        "wordmark",
        "reference",
      ],
      shadow: ["soft", "primary", "toast", "dialog"],
      spacing: ["control", "gutter-mobile", "gutter-desktop", "sidebar"],
      container: ["form", "content"],
    },
  },
});

// Assemble des classes Tailwind ; en cas de conflit, la dernière l'emporte.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

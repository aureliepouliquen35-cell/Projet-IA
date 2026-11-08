import { cn } from "@/lib/utils";

// Logo Nova Services (UX-DR2) : carré bleu arrondi avec une étoile à quatre
// branches et un point violet clair, suivi de « Nova Services ».
// Dessin repris des maquettes ; couleurs tirées des tokens de globals.css.
// À 32 px, sans déformation, sans ombre, sans changer ses couleurs.
export function Logo({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Nova Services"
      className={cn("inline-flex items-center gap-2.5", className)}
    >
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        focusable="false"
        className="size-8 flex-none"
      >
        <rect width="32" height="32" rx="9" className="fill-primary" />
        <path
          d="M16 6.5c.8 4.9 4.6 8.7 9.5 9.5-4.9.8-8.7 4.6-9.5 9.5-.8-4.9-4.6-8.7-9.5-9.5 4.9-.8 8.7-4.6 9.5-9.5z"
          className="fill-accent-nova-light"
        />
        <circle cx="24.5" cy="7.5" r="1.6" className="fill-accent-nova-light" />
      </svg>
      <span aria-hidden="true" className="text-wordmark font-semibold text-text">
        Nova <span className="font-normal text-text-muted">Services</span>
      </span>
    </span>
  );
}

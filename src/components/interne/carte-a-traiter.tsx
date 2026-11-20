import { MESSAGES_LISTE } from "@/shared/messages";
import { formaterNombre } from "@/shared/constantes";

// Carte compteur « à traiter » (DESIGN.md, Carte compteur ; FR-14) : le
// seul grand aplat de couleur de l'espace interne, avec la grande étoile du
// logo qui déborde dans le coin. Le nombre vient de `compterATraiter()` ;
// s'il n'a pas pu être lu, la carte affiche « — » plutôt qu'un chiffre faux.
//
// Pas encore cliquable : le filtre « À traiter » arrive avec la story 2.2.

export function CarteATraiter({ nombre }: { nombre: number | null }) {
  return (
    <div
      data-slot="carte-a-traiter"
      className="relative w-full max-w-56 overflow-hidden rounded-lg bg-primary px-5 py-4 text-primary-foreground shadow-primary"
    >
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        focusable="false"
        className="pointer-events-none absolute -top-3.5 -right-3.5 size-24 fill-accent-nova-light opacity-35"
      >
        <path d="M16 2c1.2 7.4 6.6 12.8 14 14-7.4 1.2-12.8 6.6-14 14-1.2-7.4-6.6-12.8-14-14C9.4 14.8 14.8 9.4 16 2z" />
      </svg>
      <p className="relative">
        <span data-slot="nombre-a-traiter" className="block text-counter">
          {nombre === null ? MESSAGES_LISTE.compteurIndisponible : formaterNombre(nombre)}
        </span>{" "}
        <span className="block text-body font-semibold">{MESSAGES_LISTE.aTraiter}</span>
      </p>
      <p className="relative mt-1 text-caption opacity-85">{MESSAGES_LISTE.sousTexteATraiter}</p>
    </div>
  );
}

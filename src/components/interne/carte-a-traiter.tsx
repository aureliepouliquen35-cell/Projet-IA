import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { adresseListe } from "@/shared/adresse-liste";
import { formaterNombre } from "@/shared/constantes";
import { MESSAGES_LISTE } from "@/shared/messages";

// Carte compteur « à traiter » (DESIGN.md, Carte compteur ; FR-14) : le
// seul grand aplat de couleur de l'espace interne, avec la grande étoile du
// logo qui déborde dans le coin. Le nombre vient de `compterATraiter()` ;
// s'il n'a pas pu être lu, la carte affiche « — » plutôt qu'un chiffre faux.
//
// Story 2.2 : toute la carte est un lien vers `/demandes?a_traiter=oui`. Il
// repart de zéro (recherche et autres filtres retirés) : la liste montre
// exactement les demandes comptées, avec le filtre « À traiter » actif. Un
// vrai lien : clavier, focus visible (contour global) et sans JavaScript ;
// bien plus haut que 44 px. Il reste cliquable à 0 et quand le compteur est
// illisible (« — »).
//
// - Rien à traiter : « 0 à traiter » et « Tout est à jour », sans
//   félicitations (EXPERIENCE.md, SM-C3).
// - Nom pour les lecteurs d'écran : « 5 à traiter, afficher ces demandes »
//   (« Nombre à traiter indisponible, … » pour « — ») ; le sous-texte est sa
//   description.
// - Rendue par `RechercheDemandes` (`carte`), qui vide la barre au clic :
//   une recherche en attente ne repart pas par-dessus la navigation.

/** Identifiant du sous-texte (une seule carte par page). */
const ID_SOUS_TEXTE = "sous-texte-a-traiter";

export function CarteATraiter({ nombre }: { nombre: number | null }) {
  const chiffre = nombre === null ? MESSAGES_LISTE.compteurIndisponible : formaterNombre(nombre);
  return (
    <Link
      href={adresseListe({ aTraiter: true })}
      data-slot="carte-a-traiter"
      aria-label={nombre === null ? MESSAGES_LISTE.nomCarteATraiterIndisponible : MESSAGES_LISTE.nomCarteATraiter(chiffre)}
      aria-describedby={ID_SOUS_TEXTE}
      className="relative block w-full max-w-56 overflow-hidden rounded-lg bg-primary px-5 py-4 text-primary-foreground shadow-primary transition-colors hover:bg-primary-hover"
    >
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        focusable="false"
        className="pointer-events-none absolute -top-3.5 -right-3.5 size-24 fill-accent-nova-light opacity-35"
      >
        <path d="M16 2c1.2 7.4 6.6 12.8 14 14-7.4 1.2-12.8 6.6-14 14-1.2-7.4-6.6-12.8-14-14C9.4 14.8 14.8 9.4 16 2z" />
      </svg>
      <span className="relative block">
        <span data-slot="nombre-a-traiter" className="block text-counter">
          {chiffre}
        </span>{" "}
        <span className="block text-body font-semibold">{MESSAGES_LISTE.aTraiter}</span>
      </span>{" "}
      <span id={ID_SOUS_TEXTE} data-slot="sous-texte-a-traiter" className="relative mt-1 block text-caption opacity-85">
        {nombre === 0 ? MESSAGES_LISTE.toutEstAJour : MESSAGES_LISTE.sousTexteATraiter}
      </span>{" "}
      <span className="relative mt-2.5 flex items-center gap-1.5 text-caption font-medium">
        {MESSAGES_LISTE.afficherATraiter}
        <ArrowRight aria-hidden="true" className="size-4" />
      </span>
    </Link>
  );
}

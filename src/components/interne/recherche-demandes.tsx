"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { adresseListe, lireRecherche, LONGUEUR_MAXIMALE_RECHERCHE } from "@/shared/adresse-liste";
import { MESSAGES_LISTE } from "@/shared/messages";

// Barre de recherche de « Demandes » (I3, FR-12) et la zone de résultats
// qu'elle met à jour (`children` : ligne « N demandes », tableau et
// pagination, ou l'état sans résultat, vide ou d'erreur).
//
// - Un vrai formulaire `role="search"` (`GET /demandes`, champ `q`) : sans
//   JavaScript, Entrée ouvre `/demandes?q=…`.
// - Avec JavaScript : la recherche part 300 ms après la dernière frappe, ou
//   tout de suite avec Entrée. L'adresse est remplacée (`router.replace`,
//   pas `push` : taper ne remplit pas l'historique), dans une transition :
//   le serveur relit la liste avec le nouveau `q`, et revient à la page 1.
// - Pendant l'attente, les résultats précédents restent visibles, estompés,
//   et marqués `aria-busy`.
// - Le texte vient de l'adresse (`q`, lu par le serveur) : il est
//   resynchronisé si l'adresse change d'ailleurs (« Réinitialiser », bouton
//   Retour), mais pas quand le serveur répond à la recherche qu'on vient de
//   lancer (on aurait pu taper la suite entre-temps).
// - Le nombre de résultats (`annonce`) est lu aux lecteurs d'écran par une
//   zone `role="status"` toujours présente : une zone insérée avec son texte
//   n'est souvent pas annoncée.

/** Délai entre la dernière frappe et la recherche (EXPERIENCE.md, E-H7). */
export const DELAI_RECHERCHE_MS = 300;

export function RechercheDemandes({
  q,
  annonce,
  children,
}: {
  q: string;
  /** Texte annoncé : « 1 demande », « 42 demandes », « Aucune demande trouvée », ou vide. */
  annonce: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [enAttente, demarrer] = useTransition();
  const [texte, setTexte] = useState(q);
  /** Dernier texte cherché par cette barre (ou venu de l'adresse). */
  const [envoye, setEnvoye] = useState(q);
  /** Dernière valeur de `q` reçue, pour voir qu'elle change. */
  const [qRecu, setQRecu] = useState(q);
  /** Nombre de changements d'adresse venus d'ailleurs que de cette barre. */
  const [changementsExternes, setChangementsExternes] = useState(0);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  // L'adresse a changé : si ce n'est pas la recherche qu'on vient de lancer,
  // le champ reprend le texte de l'adresse (et la recherche en attente est
  // abandonnée, plus bas).
  if (q !== qRecu) {
    setQRecu(q);
    if (q !== envoye) {
      setTexte(q);
      setEnvoye(q);
      setChangementsExternes((n) => n + 1);
    }
  }

  const arreterMinuteur = () => {
    if (minuteur.current !== null) clearTimeout(minuteur.current);
    minuteur.current = null;
  };

  useEffect(() => arreterMinuteur, []);

  // Changement venu d'ailleurs (« Réinitialiser », Retour, pagination) : la
  // recherche en attente (300 ms) renverrait l'ancien texte et annulerait
  // cette navigation. Arrêtée juste après l'affichage, avant tout minuteur.
  // Pas quand `q` répond à la recherche de la barre : le texte tapé
  // entre-temps doit encore être cherché.
  useLayoutEffect(() => {
    if (changementsExternes === 0 || minuteur.current === null) return;
    clearTimeout(minuteur.current);
    minuteur.current = null;
  }, [changementsExternes]);

  function chercher(brut: string) {
    arreterMinuteur();
    const recherche = lireRecherche(brut);
    setEnvoye(recherche);
    demarrer(() => router.replace(adresseListe({ q: recherche })));
  }

  return (
    <>
      <form
        role="search"
        action={adresseListe()}
        method="get"
        onSubmit={(evenement) => {
          evenement.preventDefault();
          chercher(texte);
        }}
      >
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          />
          <Input
            type="search"
            name="q"
            value={texte}
            maxLength={LONGUEUR_MAXIMALE_RECHERCHE}
            autoComplete="off"
            spellCheck={false}
            aria-label={MESSAGES_LISTE.recherche}
            placeholder={MESSAGES_LISTE.recherche}
            className="pl-10"
            onChange={(evenement) => {
              const valeur = evenement.target.value;
              setTexte(valeur);
              arreterMinuteur();
              // Rien ne change (espaces ajoutés au bord) : pas de nouvelle lecture.
              if (lireRecherche(valeur) === envoye) return;
              minuteur.current = setTimeout(() => chercher(valeur), DELAI_RECHERCHE_MS);
            }}
          />
        </div>
      </form>
      <p data-slot="annonce-resultats" role="status" className="sr-only">
        {annonce}
      </p>
      <div
        data-slot="resultats"
        aria-busy={enAttente || undefined}
        className={cn("transition-opacity", enAttente && "opacity-50")}
      >
        {children}
      </div>
    </>
  );
}

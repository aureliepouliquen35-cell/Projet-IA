"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { FiltresDemandes } from "@/components/interne/filtres-demandes";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CategorieFiltre } from "@/server/lectures/demandes";
import { adresseListe, lireRecherche, LONGUEUR_MAXIMALE_RECHERCHE, type FiltresListe } from "@/shared/adresse-liste";
import { MESSAGES_LISTE } from "@/shared/messages";

// Barre de recherche de « Demandes » (I3, FR-12), sa rangée de filtres
// (FR-13, `FiltresDemandes`) et la zone de résultats qu'elles mettent à jour
// (`children` : ligne « N demandes », tableau et pagination, ou l'état sans
// résultat, vide ou d'erreur).
//
// - Un vrai formulaire `role="search"` (`GET /demandes`, champs `q`,
//   `statut`, `categorie`, `canal`, et `a_traiter` caché si « À traiter »
//   est allumé) : sans JavaScript, Entrée ouvre `/demandes?q=…&statut=…`.
// - « À traiter » (story 2.2) passe par `filtrer`, comme les autres filtres.
// - Avec JavaScript : la recherche part 300 ms après la dernière frappe, ou
//   tout de suite avec Entrée ; un filtre s'applique dès qu'il est choisi.
//   L'adresse est remplacée (`router.replace`, pas `push` : taper ou essayer
//   des filtres ne remplit pas l'historique), dans une transition : le
//   serveur relit la liste, et revient à la page 1.
// - Recherche et filtres partent toujours ensemble (`naviguer`) : un filtre
//   choisi pendant qu'une frappe attend ses 300 ms emporte le texte tapé (la
//   frappe n'est pas perdue), et la recherche garde les filtres choisis
//   (elle ne les annule pas).
// - Pendant l'attente, les résultats précédents restent visibles, estompés,
//   et marqués `aria-busy`.
// - Texte et filtres viennent de l'adresse (lus par le serveur) : ils sont
//   resynchronisés si l'adresse change d'ailleurs (« Réinitialiser », bouton
//   Retour), mais pas quand le serveur répond à ce qu'on vient de lancer (on
//   aurait pu taper la suite entre-temps).
// - La carte « N à traiter » (`carte`, story 2.2) est rendue ici, au-dessus
//   du formulaire : un clic dessus vide la barre tout de suite (comme
//   « Réinitialiser »), avec le seul filtre « À traiter » ; le lien fait
//   lui-même la navigation vers `/demandes?a_traiter=oui`, même si l'adresse
//   est déjà celle-là.
// - Le nombre de résultats (`annonce`) est lu aux lecteurs d'écran par une
//   zone `role="status"` toujours présente : une zone insérée avec son texte
//   n'est souvent pas annoncée.

/** Délai entre la dernière frappe et la recherche (EXPERIENCE.md, E-H7). */
export const DELAI_RECHERCHE_MS = 300;

export function RechercheDemandes({
  q,
  filtres = {},
  categories = null,
  annonce,
  carte = null,
  children,
}: {
  q: string;
  /** Filtres de l'adresse, déjà relus (`relireFiltres`). */
  filtres?: FiltresListe;
  /** Carte « N à traiter », rendue au-dessus du formulaire ; un clic dessus vide la barre (`ouvrirATraiter`). */
  carte?: ReactNode;
  /** Catégories du filtre Catégorie ; `null` : lecture impossible. */
  categories?: CategorieFiltre[] | null;
  /** Texte annoncé : « 1 demande », « 42 demandes », « Aucune demande trouvée », ou vide. */
  annonce: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [enAttente, demarrer] = useTransition();
  /** Adresse de la liste affichée (recherche et filtres, sans la page). */
  const recue = adresseListe({ q, ...filtres });
  const [texte, setTexte] = useState(q);
  const [choix, setChoix] = useState<FiltresListe>(filtres);
  /** Dernière adresse demandée par cette barre (ou venue de l'adresse). */
  const [envoyee, setEnvoyee] = useState(recue);
  /** Dernière adresse reçue, pour voir qu'elle change. */
  const [derniereRecue, setDerniereRecue] = useState(recue);
  /** Nombre de changements d'adresse venus d'ailleurs que de cette barre. */
  const [changementsExternes, setChangementsExternes] = useState(0);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  // L'adresse a changé : si ce n'est pas celle qu'on vient de demander, le
  // champ et les filtres reprennent ceux de l'adresse (et la recherche en
  // attente est abandonnée, plus bas).
  if (recue !== derniereRecue) {
    setDerniereRecue(recue);
    if (recue !== envoyee) {
      setTexte(q);
      setChoix(filtres);
      setEnvoyee(recue);
      setChangementsExternes((n) => n + 1);
    }
  }

  const arreterMinuteur = () => {
    if (minuteur.current !== null) clearTimeout(minuteur.current);
    minuteur.current = null;
  };

  useEffect(() => arreterMinuteur, []);

  // Changement venu d'ailleurs (« Réinitialiser », Retour) : la recherche en
  // attente (300 ms) renverrait l'ancien texte et annulerait cette
  // navigation. Arrêtée juste après l'affichage, avant tout minuteur. Pas
  // quand l'adresse répond à la barre : le texte tapé entre-temps doit
  // encore être cherché.
  useLayoutEffect(() => {
    if (changementsExternes === 0 || minuteur.current === null) return;
    clearTimeout(minuteur.current);
    minuteur.current = null;
  }, [changementsExternes]);

  /** Ouvre la liste pour ce texte et ces filtres, à la page 1. */
  function naviguer(brut: string, nouveaux: FiltresListe) {
    arreterMinuteur();
    const adresse = adresseListe({ q: lireRecherche(brut), ...nouveaux });
    setEnvoyee(adresse);
    demarrer(() => router.replace(adresse));
  }

  /** Nouveau filtre : appliqué tout de suite, avec le texte tapé (même en attente). */
  function filtrer(nouveaux: FiltresListe) {
    setChoix(nouveaux);
    naviguer(texte, nouveaux);
  }

  /**
   * « Réinitialiser » de la rangée : la barre est vidée tout de suite (la
   * frappe en attente ne doit pas rétablir l'ancien texte, et la réponse
   * d'un filtre pas encore arrivée ne doit pas garder l'ancien choix) ; le
   * lien fait lui-même la navigation vers `/demandes`.
   */
  function reinitialiser() {
    arreterMinuteur();
    setTexte("");
    setChoix({});
    setEnvoyee(adresseListe());
  }

  /**
   * Clic sur la carte « N à traiter » : comme `reinitialiser`, mais avec le
   * seul filtre « À traiter » ; le lien de la carte fait la navigation.
   */
  function ouvrirATraiter() {
    arreterMinuteur();
    setTexte("");
    setChoix({ aTraiter: true });
    setEnvoyee(adresseListe({ aTraiter: true }));
  }

  return (
    <>
      {carte !== null ? (
        // Entrée sur le lien donne aussi un clic ; un clic pour un nouvel
        // onglet (touche ou bouton du milieu) ne touche pas à la barre.
        <div
          data-slot="zone-carte"
          onClickCapture={(evenement) => {
            if (evenement.button !== 0 || evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
            ouvrirATraiter();
          }}
        >
          {carte}
        </div>
      ) : null}
      <form
        role="search"
        action={adresseListe()}
        method="get"
        onSubmit={(evenement) => {
          evenement.preventDefault();
          naviguer(texte, choix);
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
              if (adresseListe({ q: lireRecherche(valeur), ...choix }) === envoyee) return;
              minuteur.current = setTimeout(() => naviguer(valeur, choix), DELAI_RECHERCHE_MS);
            }}
          />
        </div>
        <FiltresDemandes choix={choix} categories={categories} onChange={filtrer} onReinitialiser={reinitialiser} />
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

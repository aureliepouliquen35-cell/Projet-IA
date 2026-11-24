import { ChevronDown, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import type { CategorieFiltre } from "@/server/lectures/demandes";
import { adresseListe, filtreActif, lireFiltres, type FiltresListe } from "@/shared/adresse-liste";
import { CANAUX, STATUTS } from "@/shared/constantes";
import { LIBELLES_CANAUX, LIBELLES_STATUTS } from "@/shared/libelles";
import { MESSAGES_LISTE } from "@/shared/messages";

// Rangée « Filtres » de « Demandes » (I3, FR-13 ; DESIGN.md, Bouton de
// filtre), sous le champ de recherche et dans le même formulaire `GET` :
// sans JavaScript, Entrée dans le champ envoie `q`, `statut`, `categorie` et
// `canal` ensemble.
//
// - Chaque bouton de filtre est la liste déroulante du navigateur, habillée
//   en bouton de 36 px : étiquette visible « Statut : », valeur en gras
//   (« Tous »), chevron. Clavier et lecteurs d'écran : ceux d'une liste
//   native. Actif (une valeur choisie) : fond `primary-soft`, bordure et
//   texte bleus.
// - Un choix est appliqué tout de suite (`onChange`, géré par
//   `RechercheDemandes`, qui revient à la page 1).
// - Catégorie : les catégories actives, puis, sous un trait, les
//   désactivées suivies de « (désactivée) » (toujours filtrables). Si les
//   catégories n'ont pas pu être lues (`categories` vaut `null`), ce seul
//   bouton est désactivé.
// - « Réinitialiser » (bouton secondaire, à droite) apparaît dès qu'un
//   filtre est actif : il ouvre `/demandes` (filtres et recherche retirés)
//   en remplaçant l'adresse, comme un filtre. Au clic, `onReinitialiser`
//   vide d'abord la barre (frappe en attente comprise).
//
// Pas encore de filtres Priorité, Attribution ni « Sans activité » (Should,
// epic 6).

/** Un bouton de filtre : étiquette « Statut : » et liste native, habillées en bouton. */
function BoutonFiltre({
  nom,
  libelle,
  valeur,
  desactive = false,
  onChange,
  children,
}: {
  /** Nom du paramètre de l'adresse (`statut`, `categorie`, `canal`). */
  nom: keyof FiltresListe;
  libelle: string;
  /** Valeur choisie ; vide : « Tous ». */
  valeur: string;
  desactive?: boolean;
  onChange: (valeur: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  const actif = valeur !== "";
  return (
    <div
      data-slot="bouton-filtre"
      data-actif={actif || undefined}
      className={cn(
        "relative inline-flex h-9 items-center rounded-md border border-border-input bg-background text-body-sm text-text",
        "has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-focus-ring",
        "has-[select:disabled]:opacity-50",
        actif && "border-primary bg-primary-soft text-primary",
      )}
    >
      <label htmlFor={id} className="pl-3 whitespace-nowrap">
        {libelle} :
      </label>
      <select
        id={id}
        name={nom}
        value={valeur}
        disabled={desactive}
        onChange={(evenement) => onChange(evenement.target.value)}
        className="h-full cursor-pointer appearance-none bg-transparent pr-8 pl-1 font-semibold field-sizing-content focus-visible:outline-none disabled:cursor-not-allowed"
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={cn("pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2", actif ? "text-primary" : "text-text-muted")}
      />
    </div>
  );
}

export function FiltresDemandes({
  choix,
  categories,
  onChange,
  onReinitialiser,
}: {
  /** Filtres choisis (déjà relus par `lireFiltres`). */
  choix: FiltresListe;
  /** Catégories proposées ; `null` : lecture impossible, bouton Catégorie désactivé. */
  categories: CategorieFiltre[] | null;
  /** Nouveaux filtres, après un choix. */
  onChange: (filtres: FiltresListe) => void;
  /** Clic sur « Réinitialiser », avant la navigation vers `/demandes`. */
  onReinitialiser?: () => void;
}) {
  const titre = useId();
  const actives = categories?.filter((categorie) => categorie.active) ?? [];
  const desactivees = categories?.filter((categorie) => !categorie.active) ?? [];
  /** Remplace un filtre ; une valeur vide (« Tous ») le retire. */
  const choisir = (nom: keyof FiltresListe) => (valeur: string) =>
    onChange(lireFiltres({ ...choix, [nom]: valeur }));

  return (
    <div
      data-slot="filtres"
      role="group"
      aria-labelledby={titre}
      className="mt-3 flex flex-wrap items-center gap-2"
    >
      <span id={titre} className="mr-1 inline-flex items-center gap-1.5 text-body-sm font-semibold text-accent-nova">
        <SlidersHorizontal aria-hidden="true" className="size-4" />
        {MESSAGES_LISTE.filtres}
      </span>
      <BoutonFiltre
        nom="statut"
        libelle={MESSAGES_LISTE.filtreStatut}
        valeur={choix.statut ?? ""}
        onChange={choisir("statut")}
      >
        <NativeSelectOption value="">{MESSAGES_LISTE.tous}</NativeSelectOption>
        {STATUTS.map((statut) => (
          <NativeSelectOption key={statut} value={statut}>
            {LIBELLES_STATUTS[statut]}
          </NativeSelectOption>
        ))}
      </BoutonFiltre>
      <BoutonFiltre
        nom="categorie"
        libelle={MESSAGES_LISTE.filtreCategorie}
        // Une catégorie inconnue de la liste (lecture impossible) : « Toutes ».
        valeur={categories?.some((categorie) => categorie.id === choix.categorie) ? choix.categorie! : ""}
        desactive={categories === null}
        onChange={choisir("categorie")}
      >
        <NativeSelectOption value="">{MESSAGES_LISTE.toutes}</NativeSelectOption>
        {actives.map((categorie) => (
          <NativeSelectOption key={categorie.id} value={categorie.id}>
            {categorie.nom}
          </NativeSelectOption>
        ))}
        {desactivees.length > 0 ? <hr /> : null}
        {desactivees.map((categorie) => (
          <NativeSelectOption key={categorie.id} value={categorie.id}>
            {`${categorie.nom} ${MESSAGES_LISTE.desactivee}`}
          </NativeSelectOption>
        ))}
      </BoutonFiltre>
      <BoutonFiltre
        nom="canal"
        libelle={MESSAGES_LISTE.filtreCanal}
        valeur={choix.canal ?? ""}
        onChange={choisir("canal")}
      >
        <NativeSelectOption value="">{MESSAGES_LISTE.tous}</NativeSelectOption>
        {CANAUX.map((canal) => (
          <NativeSelectOption key={canal} value={canal}>
            {LIBELLES_CANAUX[canal]}
          </NativeSelectOption>
        ))}
      </BoutonFiltre>
      {filtreActif(choix) ? (
        <Button asChild variant="secondaire" size="sm" className="ml-auto">
          <Link href={adresseListe()} replace onClick={onReinitialiser}>
            {MESSAGES_LISTE.reinitialiser}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

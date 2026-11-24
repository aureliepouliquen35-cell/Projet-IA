import { CircleAlert, Inbox, Search } from "lucide-react";
import Link from "next/link";

import { BoutonReessayer } from "@/components/interne/bouton-reessayer";
import { Button } from "@/components/ui/button";
import { ADRESSE_NOUVELLE_DEMANDE } from "@/shared/acces";
import { adresseListe } from "@/shared/adresse-liste";
import { MESSAGES_LISTE } from "@/shared/messages";

// États de la liste des demandes (EXPERIENCE.md, I3) : vide (aucune demande
// en base), recherche sans résultat, erreur (lecture impossible) et
// chargement (squelette). Ils prennent la place du tableau.

const CADRE = "flex flex-col items-center rounded-lg border bg-background px-5 py-7 text-center shadow-soft";
const PASTILLE = "mb-3 flex size-11 items-center justify-center rounded-full";

/**
 * Aucune demande en base : la phrase de l'UX, et le bouton secondaire
 * « Saisir une demande reçue par téléphone » vers l'écran I5 (story 2.3).
 */
export function EtatListeVide() {
  return (
    <div data-slot="liste-vide" className={CADRE}>
      <span aria-hidden="true" className={`${PASTILLE} bg-accent-nova-soft text-accent-nova`}>
        <Inbox />
      </span>
      <p className="text-body font-semibold text-text">{MESSAGES_LISTE.videTitre}</p>
      <p className="mt-1 mb-4 text-body-sm text-text-muted">{MESSAGES_LISTE.videTexte}</p>
      <Button asChild variant="secondaire">
        <Link href={ADRESSE_NOUVELLE_DEMANDE}>{MESSAGES_LISTE.videSaisir}</Link>
      </Button>
    </div>
  );
}

/**
 * La recherche ou les filtres ne trouvent rien (FR-12, FR-13).
 * « Réinitialiser » retire la recherche et les filtres et réaffiche toute la
 * liste (`/demandes`). Il remplace l'adresse, comme la recherche : Retour
 * ne ramène pas à l'écran sans résultat. L'annonce aux lecteurs d'écran est
 * faite par la zone toujours présente de `RechercheDemandes`.
 */
export function EtatRechercheVide() {
  return (
    <div data-slot="recherche-vide" className={CADRE}>
      <span aria-hidden="true" className={`${PASTILLE} bg-accent-nova-soft text-accent-nova`}>
        <Search />
      </span>
      <p className="text-body font-semibold text-text">{MESSAGES_LISTE.rechercheVideTitre}</p>
      <p className="mt-1 mb-4 text-body-sm text-text-muted">{MESSAGES_LISTE.rechercheVideTexte}</p>
      <Button asChild variant="secondaire">
        <Link href={adresseListe()} replace>
          {MESSAGES_LISTE.reinitialiser}
        </Link>
      </Button>
    </div>
  );
}

/** La liste n'a pas pu être lue : message et « Réessayer ». */
export function EtatListeErreur() {
  return (
    <div data-slot="liste-erreur" role="alert" className={CADRE}>
      <span aria-hidden="true" className={`${PASTILLE} bg-danger-soft text-danger`}>
        <CircleAlert />
      </span>
      <p className="mb-4 text-body font-semibold text-urgent-fg">{MESSAGES_LISTE.erreur}</p>
      <BoutonReessayer />
    </div>
  );
}

/** Nombre de lignes grises du squelette (EXPERIENCE.md : « 8 lignes grises »). */
export const LIGNES_SQUELETTE = 8;

/**
 * Squelette de la liste (DESIGN.md, Squelette) : la carte compteur et
 * 8 lignes grises, visibles seulement après 300 ms, sans animation.
 */
export function SqueletteListe() {
  return (
    <div data-slot="squelette" role="status" className="animate-apres-300ms flex flex-col gap-5">
      <span className="sr-only">{MESSAGES_LISTE.chargement}</span>
      <div className="h-28 w-full max-w-56 rounded-lg bg-border" />
      <div className="rounded-lg border bg-background px-3 shadow-soft">
        {Array.from({ length: LIGNES_SQUELETTE }, (_, index) => (
          <div
            key={index}
            data-slot="ligne-squelette"
            className="flex h-14 items-center gap-3 border-b last:border-b-0"
          >
            <div className="h-3 w-24 rounded-sm bg-border" />
            <div className="h-3 w-28 rounded-sm bg-border" />
            <div className="h-3 flex-1 rounded-sm bg-border" />
          </div>
        ))}
      </div>
    </div>
  );
}

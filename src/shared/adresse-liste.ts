// Adresse de la liste des demandes (convention « Adresse de la liste ») :
// le texte cherché (`q`) et la page (`page`). Une seule définition : l'écran,
// la barre de recherche et la pagination la lisent ici. Les filtres
// (story 2.1) s'y ajouteront.
//
// - La page 1 et une recherche vide sont omises : `/demandes` est l'adresse
//   de la liste complète.
// - Une nouvelle recherche revient à la page 1 (on n'y passe pas `page`) ;
//   la pagination garde `q`.

import { ADRESSE_ACCUEIL_INTERNE } from "@/shared/acces";
import { LONGUEURS_MAXIMALES } from "@/shared/constantes";

/** Longueur maximale du texte cherché, en caractères : celle de l'objet. */
export const LONGUEUR_MAXIMALE_RECHERCHE = LONGUEURS_MAXIMALES.objet;

/** Caractères de contrôle (U+0000 à U+001F, U+007F) : Postgres refuse U+0000 dans un texte. */
const CARACTERES_CONTROLE = /[\u0000-\u001f\u007f]/g;

/**
 * Texte cherché lu dans l'adresse (`?q=`) ou dans le champ : le premier s'il
 * y en a plusieurs, caractères de contrôle remplacés par une espace, espaces
 * de bord retirés, coupé à 150 caractères (une lettre accentuée ou un émoji
 * compte pour un, comme dans la base). Vide si absent.
 */
export function lireRecherche(valeur: string | string[] | null | undefined): string {
  const texte = Array.isArray(valeur) ? valeur[0] : valeur;
  if (typeof texte !== "string") return "";
  return Array.from(texte.replace(CARACTERES_CONTROLE, " ").trim()).slice(0, LONGUEUR_MAXIMALE_RECHERCHE).join("").trimEnd();
}

/** Adresse de la liste pour une recherche et une page. */
export function adresseListe({ q = "", page = 1 }: { q?: string; page?: number } = {}): string {
  const parametres = new URLSearchParams();
  const recherche = lireRecherche(q);
  if (recherche) parametres.set("q", recherche);
  if (page > 1) parametres.set("page", String(page));
  const suite = parametres.toString();
  return suite ? `${ADRESSE_ACCUEIL_INTERNE}?${suite}` : ADRESSE_ACCUEIL_INTERNE;
}

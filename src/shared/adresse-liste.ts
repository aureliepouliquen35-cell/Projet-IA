// Adresse de la liste des demandes (convention « Adresse de la liste ») :
// le texte cherché (`q`), les filtres (`statut`, `categorie`, `canal`) et la
// page (`page`), toujours dans cet ordre. Une seule définition : l'écran, la
// barre de recherche, les filtres, la pagination et le détail la lisent ici.
//
// - La page 1, une recherche vide et un filtre absent sont omis :
//   `/demandes` est l'adresse de la liste complète.
// - Une nouvelle recherche ou un changement de filtre revient à la page 1
//   (on n'y passe pas `page`) ; la pagination garde `q` et les filtres.
// - Le lien d'une ligne vers le détail (I4) garde `q`, les filtres et `page`
//   (`adresseDetail`) : le fil d'Ariane ramène à la même liste.
// - Valeurs permises : codes fermés pour `statut` (`STATUTS`) et `canal`
//   (`CANAUX`), identifiant (UUID) pour `categorie`. Toute autre valeur est
//   ignorée (`lireFiltres`), comme le fait la base.

import { ADRESSE_ACCUEIL_INTERNE } from "@/shared/acces";
import { CANAUX, LONGUEURS_MAXIMALES, STATUTS, type Canal, type Statut } from "@/shared/constantes";
import { FORME_IDENTIFIANT } from "@/shared/schemas/depot";

/** Longueur maximale du texte cherché, en caractères : celle de l'objet. */
export const LONGUEUR_MAXIMALE_RECHERCHE = LONGUEURS_MAXIMALES.objet;

/** Caractères de contrôle (U+0000 à U+001F, U+007F) : Postgres refuse U+0000 dans un texte. */
const CARACTERES_CONTROLE = /[\u0000-\u001f\u007f]/g;

/** Une valeur de l'adresse : la première s'il y en a plusieurs. */
type ValeurAdresse = string | string[] | null | undefined;

const premiere = (valeur: ValeurAdresse) => (Array.isArray(valeur) ? valeur[0] : valeur);

/**
 * Texte cherché lu dans l'adresse (`?q=`) ou dans le champ : le premier s'il
 * y en a plusieurs, caractères de contrôle remplacés par une espace, espaces
 * de bord retirés, coupé à 150 caractères (une lettre accentuée ou un émoji
 * compte pour un, comme dans la base). Vide si absent.
 */
export function lireRecherche(valeur: ValeurAdresse): string {
  const texte = premiere(valeur);
  if (typeof texte !== "string") return "";
  return Array.from(texte.replace(CARACTERES_CONTROLE, " ").trim()).slice(0, LONGUEUR_MAXIMALE_RECHERCHE).join("").trimEnd();
}

/** Filtres de la liste (story 2.1) : chacun absent ou valide. */
export type FiltresListe = { statut?: Statut; categorie?: string; canal?: Canal };

/** Code fermé lu dans l'adresse : seulement s'il fait partie des valeurs permises. */
function lireCode<T extends string>(valeurs: readonly T[], valeur: ValeurAdresse): T | undefined {
  const texte = premiere(valeur);
  return typeof texte === "string" && (valeurs as readonly string[]).includes(texte) ? (texte as T) : undefined;
}

/** Identifiant de catégorie lu dans l'adresse : un UUID, écrit en minuscules ; sinon absent. */
function lireCategorie(valeur: ValeurAdresse): string | undefined {
  const texte = premiere(valeur);
  return typeof texte === "string" && FORME_IDENTIFIANT.test(texte) ? texte.toLowerCase() : undefined;
}

/**
 * Filtres lus dans l'adresse (`?statut=…&categorie=…&canal=…`) : le premier
 * de chaque s'il y en a plusieurs ; une valeur vide ou inconnue est omise
 * (« Tous »). Une catégorie bien formée mais qui n'existe pas est écartée
 * ensuite, par l'écran (qui connaît les catégories) et par la base.
 */
export function lireFiltres(parametres: Record<string, ValeurAdresse>): FiltresListe {
  const filtres: FiltresListe = {};
  const statut = lireCode(STATUTS, parametres.statut);
  const categorie = lireCategorie(parametres.categorie);
  const canal = lireCode(CANAUX, parametres.canal);
  if (statut) filtres.statut = statut;
  if (categorie) filtres.categorie = categorie;
  if (canal) filtres.canal = canal;
  return filtres;
}

/** Recherche, filtres et page d'une liste, tels qu'ils s'écrivent dans une adresse. */
export type EtatListe = FiltresListe & { q?: string; page?: number };

/** Vrai si au moins un filtre (statut, catégorie ou canal) est choisi ; la recherche ne compte pas. */
export function filtreActif({ statut, categorie, canal }: EtatListe): boolean {
  return Object.keys(lireFiltres({ statut, categorie, canal })).length > 0;
}

/**
 * `?q=…&statut=…&categorie=…&canal=…&page=…`, sans la page 1, ni une
 * recherche vide, ni un filtre absent ou invalide ; vide s'il n'y a rien.
 */
function suiteListe({ q = "", page = 1, ...filtres }: EtatListe): string {
  const parametres = new URLSearchParams();
  const recherche = lireRecherche(q);
  const { statut, categorie, canal } = lireFiltres(filtres);
  if (recherche) parametres.set("q", recherche);
  if (statut) parametres.set("statut", statut);
  if (categorie) parametres.set("categorie", categorie);
  if (canal) parametres.set("canal", canal);
  if (page > 1) parametres.set("page", String(page));
  const suite = parametres.toString();
  return suite ? `?${suite}` : "";
}

/** Adresse de la liste pour une recherche, des filtres et une page. */
export function adresseListe(liste: EtatListe = {}): string {
  return `${ADRESSE_ACCUEIL_INTERNE}${suiteListe(liste)}`;
}

/**
 * Adresse du détail d'une demande (I4). Elle porte la recherche, les filtres
 * et la page de la liste d'où l'on vient, que le fil d'Ariane « ← Demandes »
 * retrouve (`adresseListe`) : cela marche après un rechargement, dans un
 * nouvel onglet et sans JavaScript.
 * Ex. : `/demandes/NOVA-2026-0042?q=helene&statut=nouvelle&page=2`.
 */
export function adresseDetail(reference: string, liste: EtatListe = {}): string {
  return `${ADRESSE_ACCUEIL_INTERNE}/${encodeURIComponent(reference)}${suiteListe(liste)}`;
}

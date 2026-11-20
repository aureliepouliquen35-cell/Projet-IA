import "server-only";

// Réglage réservé au développement : voir à l'écran les états de la liste
// des demandes (I3) sans toucher à la base. Dans `.env.local` :
//
//   ESSAI_LISTE_DEMANDES=vide    → aucune demande, compteur à 0 ;
//   ESSAI_LISTE_DEMANDES=lent    → 2 s d'attente avant chaque lecture (squelette) ;
//   ESSAI_LISTE_DEMANDES=erreur  → panne simulée, journalisée comme une vraie.
//
// Lu seulement quand `NODE_ENV` vaut « development » (`npm run dev`) : sans
// effet en production, même si la variable y était déclarée.

export const MODES_ESSAI_LISTE = ["vide", "lent", "erreur"] as const;
export type ModeEssaiListe = (typeof MODES_ESSAI_LISTE)[number];

/** Attente du mode « lent ». */
export const ATTENTE_ESSAI_LENT_MS = 2000;

/** Le mode d'essai en vigueur, ou `null` (cas normal, et toujours hors développement). */
export function modeEssaiListe(): ModeEssaiListe | null {
  if (process.env.NODE_ENV !== "development") return null;
  const valeur = process.env.ESSAI_LISTE_DEMANDES?.trim().toLowerCase();
  return (MODES_ESSAI_LISTE as readonly string[]).includes(valeur ?? "")
    ? (valeur as ModeEssaiListe)
    : null;
}

/** Attend `ms` millisecondes. */
export function attendre(ms: number): Promise<void> {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}

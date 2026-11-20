// Adresses de l'espace interne et de la connexion (AD-7). Une seule
// définition : le proxy (`src/lib/supabase/proxy.ts`), la garde
// (`src/server/garde`), la connexion et la déconnexion les lisent ici.

/** Écran I1 : toute page interne ouverte sans session y renvoie (FR-10). */
export const ADRESSE_CONNEXION = "/connexion";

/** Page d'arrivée après la connexion : « Demandes » (I3). */
export const ADRESSE_ACCUEIL_INTERNE = "/demandes";

/**
 * Débuts d'adresse des pages internes. Seules ces pages demandent une
 * session : les pages publiques (`/`, `/confirmation`) et les adresses
 * inconnues (S2, comme `/inscription`) n'en ont pas besoin.
 */
export const PREFIXES_INTERNES = ["/demandes", "/admin"] as const;

/**
 * Vrai si l'adresse est celle d'une page interne : un des préfixes, seul ou
 * suivi de `/…` (`/demandes`, `/demandes/NOVA-2026-0001`), jamais un simple
 * début de mot (`/demandesxyz`). Sans tenir compte des majuscules, ni des
 * caractères écrits en `%xx` (`/%64emandes`), ni d'une barre finale.
 */
export function estPageInterne(chemin: string): boolean {
  let decode = chemin;
  try {
    decode = decodeURIComponent(chemin);
  } catch {
    // Adresse mal formée : lue telle quelle.
  }
  const normalise = decode.toLowerCase();
  return PREFIXES_INTERNES.some(
    (prefixe) => normalise === prefixe || normalise.startsWith(`${prefixe}/`),
  );
}

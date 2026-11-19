// Limites de saisie d'une demande (PRD, FR-1). Une seule définition (AD-11) :
// le schéma de validation (`src/shared/schemas/depot.ts`) et l'écran les
// lisent ici ; la base porte les mêmes nombres dans ses contraintes
// (`supabase/migrations`, table `demandes`), ce qu'un test vérifie.

/** Longueur maximale de chaque champ, en caractères. */
export const LONGUEURS_MAXIMALES = {
  nom: 100,
  email: 100,
  telephone: 30,
  entreprise: 100,
  objet: 150,
  description: 5000,
} as const;

/** Longueur minimale de la description, en caractères. */
export const LONGUEUR_MINIMALE_DESCRIPTION = 10;

/**
 * Forme attendue d'un email : « nom@exemple.fr ». Seule la forme est
 * vérifiée (FR-1) : quelque chose, une arobase, un domaine avec un point,
 * sans espace.
 */
export const FORME_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Forme d'une référence attribuée par la base (AD-4) : `NOVA-2026-0042`. */
export const FORME_REFERENCE = /^NOVA-\d{4}-\d{4,}$/;

/**
 * Nombre de caractères d'un texte, compté comme la base (`char_length`) :
 * un émoji ou une lettre accentuée compte pour un seul caractère.
 */
export function compterCaracteres(texte: string): number {
  return Array.from(texte).length;
}

/** Nombre écrit à la française, avec une espace entre les milliers : « 5 000 ». */
export function formaterNombre(nombre: number): string {
  return String(nombre).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

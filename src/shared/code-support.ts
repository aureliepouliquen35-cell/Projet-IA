// Code court à recopier pour le support (« Code : 7F3A » sur S3, colonne
// `code_erreur` de `journal_technique`). Un seul format : un nombre entier
// écrit en base 36, en majuscules (au plus 7 caractères).
//
// - Erreur de page : le nombre est l'empreinte (`digest`) que Next.js pose sur
//   l'erreur. Le serveur (`onRequestError`) et l'écran S3 (`error.digest`) font
//   le même calcul de leur côté : ils obtiennent le même code sans échange.
//   Next.js calcule cette empreinte à partir du contenu de l'erreur : la même
//   erreur, sur la même page, donne donc toujours le même code (choix d'Aurel,
//   19 nov. 2026). Le support retrouve la bonne ligne avec le code ET l'heure
//   affichés par S3.
// - Erreur d'action : le nombre est tiré au hasard (un code par erreur).

const PLUS_GRAND_ENTIER_32_BITS = 0xffffffff;

/** Code court tiré d'une empreinte décimale de Next.js, sinon `undefined`. */
export function codeDepuisDigest(digest: unknown): string | undefined {
  if (typeof digest !== "string" || !/^\d{1,10}$/.test(digest)) return undefined;
  const nombre = Number(digest);
  if (nombre > PLUS_GRAND_ENTIER_32_BITS) return undefined;
  return nombre.toString(36).toUpperCase();
}

/** Code court de l'empreinte portée par une erreur, sinon `undefined`. */
export function codeDepuisErreur(erreur: unknown): string | undefined {
  if (typeof erreur !== "object" || erreur === null || !("digest" in erreur)) {
    return undefined;
  }
  return codeDepuisDigest(erreur.digest);
}

/** Nouveau code court, tiré au hasard, de la même forme. */
export function nouveauCodeSupport(): string {
  const tirage = new Uint32Array(1);
  crypto.getRandomValues(tirage);
  return tirage[0].toString(36).toUpperCase();
}

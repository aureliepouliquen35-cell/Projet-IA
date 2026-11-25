// Mot de passe temporaire (FR-21, FR-23, NFR-11), tiré au hasard par le
// générateur cryptographique du navigateur ou de Node.js (Web Crypto,
// `crypto.getRandomValues`), jamais par un générateur prévisible.
//
// Utilisé dans le navigateur par le bouton « Générer » de l'écran A1 (aucun
// aller-retour réseau), et réexporté par `src/server/admin` pour la
// procédure d'installation.

/** Longueur d'un mot de passe temporaire tiré au hasard (12 au moins, NFR-11). */
export const LONGUEUR_MOT_DE_PASSE_TEMPORAIRE = 16;

/**
 * Caractères d'un mot de passe temporaire : lettres et chiffres, sans ceux
 * qu'on confond en le recopiant (0 et O, o ; 1, l et I).
 */
export const ALPHABET_MOT_DE_PASSE = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/**
 * Plus grand multiple de la taille de l'alphabet qui tient dans un octet :
 * un octet au-delà est rejeté, pour que chaque caractère ait exactement la
 * même chance d'être tiré (pas de biais du modulo).
 */
const LIMITE_SANS_BIAIS = 256 - (256 % ALPHABET_MOT_DE_PASSE.length);

/** Mot de passe temporaire tiré au hasard (générateur cryptographique). */
export function genererMotDePasseTemporaire(): string {
  let motDePasse = "";
  const octets = new Uint8Array(LONGUEUR_MOT_DE_PASSE_TEMPORAIRE * 2);
  while (motDePasse.length < LONGUEUR_MOT_DE_PASSE_TEMPORAIRE) {
    crypto.getRandomValues(octets);
    for (const octet of octets) {
      if (octet >= LIMITE_SANS_BIAIS) continue;
      motDePasse += ALPHABET_MOT_DE_PASSE[octet % ALPHABET_MOT_DE_PASSE.length];
      if (motDePasse.length === LONGUEUR_MOT_DE_PASSE_TEMPORAIRE) break;
    }
  }
  return motDePasse;
}

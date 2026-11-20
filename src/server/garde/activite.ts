import "server-only";

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

import { LONGUEUR_MINIMALE_SECRET } from "@/server/passage";

// Expiration après 8 h d'inactivité (AD-7, NFR-11). L'option de Supabase est
// réservée à l'offre payante : l'application tient donc son propre cookie
// serveur de dernière activité, `nova_activite`.
//
// - Posé à la connexion (`src/server/connexion`), renouvelé par le proxy à
//   chaque page protégée ouverte dans les 8 h.
// - Contenu : l'heure de la dernière activité, signée (HMAC-SHA-256, clé
//   dérivée de `SECRET_COOKIES`). Le navigateur peut la lire, pas la
//   changer : une heure modifiée ou repoussée dans le futur est refusée.
// - Absent, illisible, falsifié ou trop ancien : la session est expirée. Un
//   cookie disparu ne redonne donc pas 8 h.
// - `httpOnly`, `sameSite: lax`, `secure` hors développement, `path: /`,
//   `maxAge` égal à la durée d'inactivité.
//
// En développement seulement, `DUREE_INACTIVITE_MINUTES` (dans `.env.local`)
// raccourcit la durée, pour vérifier l'expiration à l'écran. En production,
// c'est toujours 8 h.

export const COOKIE_ACTIVITE = "nova_activite";

/** Durée d'inactivité au-delà de laquelle la session est fermée : 8 h. */
export const DUREE_INACTIVITE_MS = 8 * 60 * 60 * 1000;

/**
 * Avance tolérée sur l'heure du cookie, pour un léger écart d'horloge entre
 * deux serveurs. Au-delà, l'heure est jugée falsifiée.
 */
const AVANCE_TOLEREE_MS = 60 * 1000;

/** Change si le format du contenu change : les anciens cookies sont alors refusés. */
const VERSION = "v1";

/**
 * Durée d'inactivité en vigueur : 8 h, ou `DUREE_INACTIVITE_MINUTES` en
 * développement (nombre entier de minutes, au moins 1).
 */
export function dureeInactiviteMs(): number {
  if (process.env.NODE_ENV === "development") {
    const minutes = Number(process.env.DUREE_INACTIVITE_MINUTES);
    if (Number.isInteger(minutes) && minutes >= 1) return minutes * 60 * 1000;
  }
  return DUREE_INACTIVITE_MS;
}

/**
 * Clé de signature, dérivée de `SECRET_COOKIES` (HKDF-SHA-256), distincte de
 * celle des passages. Lève une erreur si le secret est absent ou trop court.
 */
function cle(): Uint8Array {
  const secret = process.env.SECRET_COOKIES;
  if (!secret || secret.length < LONGUEUR_MINIMALE_SECRET) {
    throw new Error(
      `SECRET_COOKIES manquante ou trop courte (${LONGUEUR_MINIMALE_SECRET} caractères au moins, voir .env.example).`,
    );
  }
  return new Uint8Array(hkdfSync("sha256", secret, "", "nova-activite", 32));
}

const signer = (contenu: string, laCle: Uint8Array) =>
  createHmac("sha256", laCle).update(contenu, "utf8").digest();

/** Valeur du cookie pour une activité à `maintenant` (en millisecondes). */
export function valeurActivite(maintenant: number = Date.now()): string {
  const contenu = `${VERSION}.${Math.floor(maintenant)}`;
  return `${contenu}.${signer(contenu, cle()).toString("base64url")}`;
}

/**
 * Vrai si la valeur est bien signée et que la dernière activité date de
 * moins que la durée d'inactivité (sans être dans le futur). Lève une erreur
 * seulement si le secret manque (erreur de configuration).
 */
export function activiteValide(valeur: string | undefined, maintenant: number = Date.now()): boolean {
  const laCle = cle();
  if (!valeur) return false;

  const morceaux = valeur.split(".");
  if (morceaux.length !== 3) return false;
  const [version, heure, signature] = morceaux;
  if (version !== VERSION || !/^\d{1,15}$/.test(heure)) return false;

  const attendue = signer(`${version}.${heure}`, laCle);
  const recue = Buffer.from(signature, "base64url");
  if (recue.length !== attendue.length || !timingSafeEqual(recue, attendue)) return false;

  const activite = Number(heure);
  if (activite > maintenant + AVANCE_TOLEREE_MS) return false;
  return maintenant - activite <= dureeInactiviteMs();
}

/** Options du cookie d'activité. */
export function optionsActivite() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV !== "development",
    path: "/",
    maxAge: Math.floor(dureeInactiviteMs() / 1000),
  };
}

/** Ce qui sait poser un cookie : `cookies()` de Next.js ou `response.cookies` du proxy. */
export type PoseurCookies = {
  set: (nom: string, valeur: string, options: ReturnType<typeof optionsActivite>) => unknown;
};

/** Pose (ou renouvelle) le cookie d'activité, daté de `maintenant`. */
export function poserActivite(cookies: PoseurCookies, maintenant: number = Date.now()): void {
  cookies.set(COOKIE_ACTIVITE, valeurActivite(maintenant), optionsActivite());
}

import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";

import { FORME_REFERENCE } from "@/shared/constantes";

// Passage d'informations d'une page à la suivante (AD-20). Un seul module
// s'en occupe : celui-ci.
//
// Les informations voyagent dans un cookie serveur, jamais dans l'adresse :
// - chiffré et signé (AES-256-GCM) : le navigateur ne peut ni le lire ni le
//   modifier sans que la lecture échoue. Il contient un email : « signé »
//   ne suffirait pas, il doit aussi être illisible ;
// - lié à son nom : un contenu chiffré pour un cookie n'est pas lisible sous
//   un autre nom (le nom fait partie de la signature) ;
// - valable 30 minutes : le navigateur l'efface (`maxAge`), et l'heure
//   d'expiration est aussi écrite dans le contenu chiffré, pour qu'un cookie
//   gardé au-delà soit refusé ;
// - `httpOnly` (inaccessible au JavaScript de la page), `sameSite: lax`,
//   `secure` hors développement.
//
// La clé est dérivée de `SECRET_COOKIES` (variable d'environnement, serveur
// uniquement). Secret absent ou trop court : erreur, rien n'est écrit ni lu.

/** Durée de validité d'un passage : 30 minutes (AD-20). */
export const DUREE_PASSAGE_SECONDES = 30 * 60;

/** Longueur minimale de `SECRET_COOKIES`, en caractères. */
export const LONGUEUR_MINIMALE_SECRET = 32;

/** Cookie de l'écran de confirmation P2, lu seulement par cette page. */
export const COOKIE_CONFIRMATION = "nova_confirmation";
const CHEMIN_CONFIRMATION = "/confirmation";

const ALGORITHME = "aes-256-gcm";
const TAILLE_IV = 12;
const TAILLE_ETIQUETTE = 16;
/** Change si le format du contenu change : les anciens cookies sont alors refusés. */
const VERSION = "v1";

/**
 * Clé de chiffrement, dérivée de `SECRET_COOKIES` (HKDF-SHA-256).
 * Lève une erreur si le secret est absent ou trop court.
 */
function cle(): Buffer {
  const secret = process.env.SECRET_COOKIES;
  if (!secret || secret.length < LONGUEUR_MINIMALE_SECRET) {
    throw new Error(
      `SECRET_COOKIES manquante ou trop courte (${LONGUEUR_MINIMALE_SECRET} caractères au moins, voir .env.example).`,
    );
  }
  return Buffer.from(hkdfSync("sha256", secret, "", "nova-passage", 32));
}

/**
 * Vérifie que les passages peuvent être écrits (secret présent et assez
 * long). À appeler avant une action qu'on ne pourrait pas annuler si le
 * cookie ne pouvait pas être posé ensuite.
 */
export function verifierSecretPassage(): void {
  cle();
}

/** Données associées : le nom du cookie et la version, signés avec le contenu. */
const associees = (nom: string) => Buffer.from(`${VERSION}:${nom}`, "utf8");

/**
 * Chiffre un contenu pour le cookie `nom`, valable 30 minutes à partir de
 * `maintenant` (en millisecondes). Renvoie une valeur de cookie
 * (base64url : IV, étiquette, contenu chiffré).
 */
export function chiffrerPassage(
  nom: string,
  contenu: unknown,
  maintenant: number = Date.now(),
): string {
  const iv = randomBytes(TAILLE_IV);
  const chiffreur = createCipheriv(ALGORITHME, cle(), iv, { authTagLength: TAILLE_ETIQUETTE });
  chiffreur.setAAD(associees(nom));
  const clair = JSON.stringify({ exp: maintenant + DUREE_PASSAGE_SECONDES * 1000, contenu });
  const chiffre = Buffer.concat([chiffreur.update(clair, "utf8"), chiffreur.final()]);
  return Buffer.concat([iv, chiffreur.getAuthTag(), chiffre]).toString("base64url");
}

/**
 * Déchiffre la valeur du cookie `nom`. Renvoie `null` si elle est absente,
 * modifiée, chiffrée pour un autre cookie ou expirée.
 * Lève une erreur seulement si le secret manque (erreur de configuration).
 */
export function dechiffrerPassage(
  nom: string,
  valeur: string | undefined,
  maintenant: number = Date.now(),
): unknown {
  const laCle = cle();
  if (!valeur) return null;

  const octets = Buffer.from(valeur, "base64url");
  if (octets.length <= TAILLE_IV + TAILLE_ETIQUETTE) return null;

  try {
    const dechiffreur = createDecipheriv(ALGORITHME, laCle, octets.subarray(0, TAILLE_IV), {
      authTagLength: TAILLE_ETIQUETTE,
    });
    dechiffreur.setAAD(associees(nom));
    dechiffreur.setAuthTag(octets.subarray(TAILLE_IV, TAILLE_IV + TAILLE_ETIQUETTE));
    const clair = Buffer.concat([
      dechiffreur.update(octets.subarray(TAILLE_IV + TAILLE_ETIQUETTE)),
      dechiffreur.final(),
    ]).toString("utf8");

    const lu: unknown = JSON.parse(clair);
    if (typeof lu !== "object" || lu === null || !("exp" in lu) || !("contenu" in lu)) {
      return null;
    }
    if (typeof lu.exp !== "number" || lu.exp <= maintenant) return null;
    return lu.contenu;
  } catch {
    // Étiquette fausse (contenu modifié, autre cookie, autre secret) ou
    // contenu illisible : rien à montrer.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Confirmation du dépôt (P2)
// ---------------------------------------------------------------------------

/** Ce que l'écran de confirmation P2 affiche de la demande. */
export type Confirmation = {
  reference: string;
  objet: string;
  email: string;
};

const schemaConfirmation = z.object({
  type: z.literal("confirmation"),
  reference: z.string().regex(FORME_REFERENCE),
  objet: z.string().min(1),
  email: z.string().min(1),
});

/**
 * Pose le cookie de confirmation, juste après l'enregistrement d'une demande.
 * À appeler depuis une Server Function (Next.js n'écrit un cookie que là).
 */
export async function poserConfirmation(confirmation: Confirmation): Promise<void> {
  const valeur = chiffrerPassage(COOKIE_CONFIRMATION, {
    type: "confirmation",
    reference: confirmation.reference,
    objet: confirmation.objet,
    email: confirmation.email,
  });
  (await cookies()).set(COOKIE_CONFIRMATION, valeur, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV !== "development",
    path: CHEMIN_CONFIRMATION,
    maxAge: DUREE_PASSAGE_SECONDES,
  });
}

/**
 * Lit le cookie de confirmation. Renvoie `null` s'il est absent, modifié,
 * expiré ou d'un autre type : la page renvoie alors au formulaire.
 */
export async function lireConfirmation(): Promise<Confirmation | null> {
  const valeur = (await cookies()).get(COOKIE_CONFIRMATION)?.value;
  const lu = schemaConfirmation.safeParse(dechiffrerPassage(COOKIE_CONFIRMATION, valeur));
  if (!lu.success) return null;
  const { reference, objet, email } = lu.data;
  return { reference, objet, email };
}

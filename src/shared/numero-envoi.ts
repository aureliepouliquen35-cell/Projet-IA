import { FORME_IDENTIFIANT } from "@/shared/schemas/depot";

// Numéro d'envoi d'un formulaire de création (AD-20) : un UUID tiré au hasard
// par le navigateur quand le formulaire s'affiche, gardé pour les nouveaux
// essais après une panne ou un refus, renouvelé après une réussite, et envoyé
// avec la demande. Un second envoi avec le même
// numéro (réponse perdue, nouvel essai) renvoie la demande déjà créée au lieu
// d'en créer une deuxième.
//
// Tiré avec `crypto.getRandomValues`, disponible partout, y compris en
// `http://` sur le réseau local (contrairement à `crypto.randomUUID`, réservé
// aux pages sécurisées).

/** Nouveau numéro d'envoi : un UUID version 4. */
export function nouveauNumeroEnvoi(): string {
  const octets = crypto.getRandomValues(new Uint8Array(16));
  octets[6] = (octets[6] & 0x0f) | 0x40; // version 4
  octets[8] = (octets[8] & 0x3f) | 0x80; // variante RFC 9562
  const hexa = Array.from(octets, (octet) => octet.toString(16).padStart(2, "0")).join("");
  return [
    hexa.slice(0, 8),
    hexa.slice(8, 12),
    hexa.slice(12, 16),
    hexa.slice(16, 20),
    hexa.slice(20),
  ].join("-");
}

/** Vrai si la valeur a la forme d'un numéro d'envoi (UUID). */
export function estNumeroEnvoi(valeur: unknown): valeur is string {
  return typeof valeur === "string" && FORME_IDENTIFIANT.test(valeur);
}

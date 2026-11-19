// Contacts de Nova affichés aux demandeurs (FR-31) : sur l'écran de
// confirmation P2 et dans le message de panne du formulaire P1. Ils sont lus
// dans la table `parametres` à chaque affichage (`lireContactsNova`,
// src/server/depot).

export type ContactsNova = {
  /** Téléphone de contact ; `null` s'il n'est pas renseigné. */
  telephone: string | null;
  /** Email de contact, toujours renseigné. */
  emailContact: string;
};

/** Adresse `tel:` d'un numéro affiché (« 01 99 00 00 00 » → `tel:0199000000`). */
export function lienTelephone(telephone: string): string {
  return `tel:${telephone.replace(/[^\d+]/g, "")}`;
}

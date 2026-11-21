import type { AuteurEvenement, Canal, Statut, TypeEvenement } from "@/shared/constantes";

// Texte affiché des valeurs fermées (conventions de l'architecture : « Le
// texte affiché vient d'un seul fichier »). La base garde les codes en
// minuscules, sans accent ; l'écran montre ces libellés.

/** Libellé de chaque statut, tel qu'il s'écrit dans son badge (FR-19 : jamais la couleur seule). */
export const LIBELLES_STATUTS: Record<Statut, string> = {
  nouvelle: "Nouvelle",
  en_cours: "En cours",
  traitee: "Traitée",
};

/** Libellé de chaque canal d'arrivée (détail I4, bloc « Informations »). */
export const LIBELLES_CANAUX: Record<Canal, string> = {
  formulaire: "Formulaire",
  telephone: "Téléphone",
  email: "Email",
};

/**
 * Ce qui s'est passé, pour chaque type d'événement de l'historique (FR-17).
 * Un changement de statut se lit « Statut : Nouvelle → En cours »
 * (`libelleChangementStatut`).
 */
export const LIBELLES_EVENEMENTS: Record<TypeEvenement, string> = {
  creation: "Demande créée",
  statut: "Statut",
};

/** « Statut : Nouvelle → En cours » (DESIGN.md, Historique ; FR-16). */
export function libelleChangementStatut(ancien: Statut, nouveau: Statut): string {
  return `${LIBELLES_EVENEMENTS.statut} : ${LIBELLES_STATUTS[ancien]} → ${LIBELLES_STATUTS[nouveau]}`;
}

/**
 * Bouton du panneau « Statut » pour un passage permis (EXPERIENCE.md, I4) :
 * « Passer En cours », « Marquer Traitée », ou « Rouvrir (En cours) » depuis
 * *Traitée*.
 */
export function libelleTransition(depuis: Statut, vers: Statut): string {
  if (vers === "traitee") return "Marquer Traitée";
  if (depuis === "traitee") return "Rouvrir (En cours)";
  return "Passer En cours";
}

/** Auteur d'un événement qui n'est pas un utilisateur interne (FR-17). */
export const LIBELLES_AUTEURS: Record<AuteurEvenement, string> = {
  demandeur: "Demandeur",
  systeme: "Système",
};

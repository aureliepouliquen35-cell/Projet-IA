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

/** Ce qui s'est passé, pour chaque type d'événement de l'historique (FR-17). */
export const LIBELLES_EVENEMENTS: Record<TypeEvenement, string> = {
  creation: "Demande créée",
};

/** Auteur d'un événement qui n'est pas un utilisateur interne (FR-17). */
export const LIBELLES_AUTEURS: Record<AuteurEvenement, string> = {
  demandeur: "Demandeur",
  systeme: "Système",
};

import type { Statut } from "@/shared/constantes";

// Texte affiché des valeurs fermées (conventions de l'architecture : « Le
// texte affiché vient d'un seul fichier »). La base garde les codes en
// minuscules, sans accent ; l'écran montre ces libellés.

/** Libellé de chaque statut, tel qu'il s'écrit dans son badge (FR-19 : jamais la couleur seule). */
export const LIBELLES_STATUTS: Record<Statut, string> = {
  nouvelle: "Nouvelle",
  en_cours: "En cours",
  traitee: "Traitée",
};

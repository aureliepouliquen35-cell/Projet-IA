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

/**
 * Informations générales (FR-31, écran A3) : même limite que le téléphone et
 * l'email d'une demande ; le contact pour les données personnelles peut être
 * un email ou une courte adresse.
 */
export const LONGUEURS_MAXIMALES_PARAMETRES = {
  telephone: 30,
  emailContact: 100,
  contactDonnees: 200,
} as const;

/**
 * Longueur maximale du nom d'une catégorie (FR-26, écran A2), en caractères :
 * la même que la contrainte `categories_nom_longueur_check` de la base.
 */
export const LONGUEUR_MAXIMALE_CATEGORIE = 50;

/** Longueur minimale d'un mot de passe, temporaire ou définitif (NFR-11). */
export const LONGUEUR_MINIMALE_MOT_DE_PASSE = 12;

/**
 * Longueur maximale d'un mot de passe, en octets (UTF-8) : au-delà, Supabase
 * Auth le refuse (limite de bcrypt). Une lettre accentuée compte pour 2.
 */
export const LONGUEUR_MAXIMALE_MOT_DE_PASSE_OCTETS = 72;

/** Nombre d'octets d'un texte une fois écrit en UTF-8. */
export function compterOctets(texte: string): number {
  return new TextEncoder().encode(texte).length;
}

/** Rôles d'un compte interne (FR-21), comme dans la base (`profils.role`). */
export const ROLES = ["collaborateur", "administrateur"] as const;
export type Role = (typeof ROLES)[number];

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

/** Libellé de chaque rôle, tel qu'il s'affiche. */
export const LIBELLES_ROLES: Record<Role, string> = {
  collaborateur: "Collaborateur",
  administrateur: "Administrateur",
};

/** Statuts d'une demande (FR-16), comme dans la base (`demandes.statut`). */
export const STATUTS = ["nouvelle", "en_cours", "traitee"] as const;
export type Statut = (typeof STATUTS)[number];

/** Nombre de demandes par page de la liste (FR-11, convention « Adresse de la liste »). */
export const TAILLE_PAGE = 25;

/** Canaux d'arrivée d'une demande, comme dans la base (`demandes.canal`). */
export const CANAUX = ["formulaire", "telephone", "email"] as const;
export type Canal = (typeof CANAUX)[number];

/**
 * Canaux qu'un utilisateur interne peut choisir en saisissant une demande
 * (écran I5, FR-30), dans l'ordre de l'écran : *Formulaire* est réservé au
 * dépôt public. La base fait foi (`saisir_demande`, refus NV401) ; un test
 * vérifie qu'elle dit la même chose.
 */
export const CANAUX_SAISIE = ["telephone", "email"] as const satisfies readonly Canal[];
export type CanalSaisie = (typeof CANAUX_SAISIE)[number];

/**
 * Passages de statut permis (FR-16, RM-4), depuis chaque statut. Jamais de
 * retour à *Nouvelle*. La base fait foi (`transition_statut_permise`, appelée
 * par `changer_statut`) ; cette constante ne sert qu'à afficher les boutons
 * du panneau « Statut », et un test vérifie qu'elle dit la même chose (AD-5).
 */
export const TRANSITIONS_STATUT: Readonly<Record<Statut, readonly Statut[]>> = {
  nouvelle: ["en_cours", "traitee"],
  en_cours: ["traitee"],
  traitee: ["en_cours"],
};

/** Statuts vers lesquels on peut aller depuis `statut`, dans l'ordre des boutons. */
export function transitionsDepuis(statut: Statut): readonly Statut[] {
  return TRANSITIONS_STATUT[statut];
}

/**
 * Statuts qu'un changement peut demander : tous sauf *Nouvelle* (RM-4). Le
 * serveur refuse tout autre statut sans appeler la base.
 */
export const STATUTS_DEMANDABLES = ["en_cours", "traitee"] as const satisfies readonly Statut[];
export type StatutDemandable = (typeof STATUTS_DEMANDABLES)[number];

/**
 * Types d'événements que l'historique sait afficher (FR-17) : la création et
 * le changement de statut (story 1.11).
 */
export const TYPES_EVENEMENTS = ["creation", "statut"] as const;
export type TypeEvenement = (typeof TYPES_EVENEMENTS)[number];

/**
 * Auteurs d'un événement qui ne sont pas des utilisateurs internes, comme
 * dans la base (`evenements.auteur_libelle`).
 */
export const AUTEURS_EVENEMENTS = ["demandeur", "systeme"] as const;
export type AuteurEvenement = (typeof AUTEURS_EVENEMENTS)[number];

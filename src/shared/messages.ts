// Textes des écrans d'erreur, des réponses d'erreur, des erreurs de saisie et
// de l'écran de confirmation (EXPERIENCE.md). Repris mot pour mot : ne pas
// reformuler ici sans changer l'UX.

import {
  formaterNombre,
  LONGUEUR_MINIMALE_DESCRIPTION,
  LONGUEUR_MAXIMALE_MOT_DE_PASSE_OCTETS,
  LONGUEUR_MINIMALE_MOT_DE_PASSE,
  LONGUEURS_MAXIMALES,
  LONGUEURS_MAXIMALES_PARAMETRES,
} from "@/shared/constantes";
import type { ContactsNova } from "@/shared/contacts";

/** S3 et réponse `ERREUR_INTERNE`. */
export const MESSAGE_ERREUR_INATTENDUE = "Une erreur inattendue s'est produite.";

/** S2 et réponse `INTROUVABLE`. */
export const MESSAGE_PAGE_INTROUVABLE =
  "Cette page n'existe pas ou a été supprimée.";

/**
 * Titre du résumé d'erreurs en haut d'un formulaire, et message d'une réponse
 * `VALIDATION` : « 1 champ est à corriger », « 2 champs sont à corriger ».
 */
export function resumeErreurs(nombre: number): string {
  return nombre <= 1
    ? "1 champ est à corriger"
    : `${nombre} champs sont à corriger`;
}

const depasse = (sujet: string, maximum: number) =>
  `${sujet} ne doit pas dépasser ${formaterNombre(maximum)} caractères`;

/**
 * Messages du formulaire de dépôt (P1, « Erreur de saisie »). Ceux qui ne
 * sont pas cités par EXPERIENCE.md suivent la même forme, comme il le
 * demande (« Le nom ne doit pas dépasser 100 caractères »…).
 */
export const MESSAGES_DEPOT = {
  nomObligatoire: "Le nom est obligatoire",
  nomTropLong: depasse("Le nom", LONGUEURS_MAXIMALES.nom),
  emailObligatoire: "L'email est obligatoire",
  emailForme: "L'email doit avoir la forme nom@exemple.fr",
  emailTropLong: depasse("L'email", LONGUEURS_MAXIMALES.email),
  telephoneTropLong: depasse("Le téléphone", LONGUEURS_MAXIMALES.telephone),
  entrepriseTropLongue: depasse("L'entreprise", LONGUEURS_MAXIMALES.entreprise),
  categorieObligatoire: "La catégorie est obligatoire",
  /** Catégorie désactivée entre l'affichage du formulaire et l'envoi. */
  categorieIndisponible:
    "Cette catégorie n'est plus proposée. Choisissez-en une autre.",
  objetObligatoire: "L'objet est obligatoire",
  objetTropLong: depasse("L'objet", LONGUEURS_MAXIMALES.objet),
  descriptionObligatoire: "La description est obligatoire",
  descriptionTropCourte: `La description doit faire au moins ${LONGUEUR_MINIMALE_DESCRIPTION} caractères`,
  descriptionTropLongue: depasse("La description", LONGUEURS_MAXIMALES.description),
  caseObligatoire:
    "Cochez la case pour confirmer avoir lu l'usage de vos données",
} as const;

/**
 * Création d'un compte (écran A1, procédure d'installation). Mêmes formes que
 * le formulaire de dépôt pour le nom et l'email ; « 12 caractères minimum » et
 * l'email déjà utilisé sont les textes d'A1.
 */
export const MESSAGES_COMPTE = {
  nomObligatoire: "Le nom est obligatoire",
  nomTropLong: depasse("Le nom", LONGUEURS_MAXIMALES.nom),
  emailObligatoire: "L'email est obligatoire",
  emailForme: "L'email doit avoir la forme nom@exemple.fr",
  emailTropLong: depasse("L'email", LONGUEURS_MAXIMALES.email),
  roleInconnu: "Le rôle doit être Collaborateur ou Administrateur",
  motDePasseTropCourt: `${LONGUEUR_MINIMALE_MOT_DE_PASSE} caractères minimum`,
  /** Sous le champ Email d'A1. */
  emailDejaUtilise: "Cet email est déjà utilisé par un autre compte.",
  /** Réponse `CONFLIT` (procédure d'installation). */
  compteExistant: "Un compte existe déjà avec cet email.",
  /** Réponse `ERREUR_INTERNE` : rien n'a été créé. */
  creationImpossible: "Le compte n'a pas pu être créé. Réessayez.",
} as const;

/** Informations générales (écran A3, FR-31), textes de l'UX. */
export const MESSAGES_PARAMETRES = {
  champObligatoire: "Ce champ est obligatoire",
  emailForme: "L'email doit avoir la forme nom@exemple.fr",
  telephoneTropLong: depasse("Le téléphone", LONGUEURS_MAXIMALES_PARAMETRES.telephone),
  emailContactTropLong: depasse("L'email", LONGUEURS_MAXIMALES_PARAMETRES.emailContact),
  contactDonneesTropLong: depasse(
    "Le contact pour les données personnelles",
    LONGUEURS_MAXIMALES_PARAMETRES.contactDonnees,
  ),
  /** Erreur technique d'A3 : rien n'est modifié. */
  enregistrementImpossible: "Les informations n'ont pas pu être enregistrées. Réessayez.",
} as const;

/**
 * Panne à l'envoi du formulaire de dépôt (P1, « Erreur technique », FR-4).
 * Le téléphone de Nova (FR-31) termine le message ; s'il n'est pas
 * renseigné, c'est l'email de contact.
 */
export const MESSAGES_PANNE_DEPOT = {
  titre: "Votre demande n'a pas pu être envoyée.",
  suite: "Vos informations sont conservées : réessayez dans un instant.",
  appel: "Si le problème continue, appelez-nous au",
  ecrit: "Si le problème continue, écrivez-nous à",
} as const;

/** Message de panne complet, tel qu'il se lit à l'écran. */
export function messagePanneDepot(contacts: ContactsNova): string {
  const { titre, suite, appel, ecrit } = MESSAGES_PANNE_DEPOT;
  const fin = contacts.telephone
    ? `${appel} ${contacts.telephone}.`
    : `${ecrit} ${contacts.emailContact}.`;
  return `${titre} ${suite} ${fin}`;
}

/**
 * Écran de confirmation P2 (FR-4, FR-31). Le titre est le texte exact de
 * FR-4, sans point final.
 */
export const MESSAGES_CONFIRMATION = {
  titre: "Votre demande a bien été enregistrée",
  votreReference: "Votre référence",
  notezLa: "Notez-la : elle vous sera demandée si nous vous rappelons.",
  objet: "Objet",
  reponseA: "Nous vous répondrons à",
  questionUrgente: "Une question urgente ?",
  autreDemande: "Déposer une autre demande",
} as const;

/**
 * Connexion I1 (EXPERIENCE.md, FR-8). Les deux messages d'échec sont les
 * seuls possibles, que l'email ait un compte ou non (AD-8). Les messages
 * de saisie suivent la forme de ceux du formulaire de dépôt.
 */
export const MESSAGES_CONNEXION = {
  titre: "Espace interne Nova Services",
  email: "Email",
  motDePasse: "Mot de passe",
  afficher: "Afficher",
  masquer: "Masquer",
  seConnecter: "Se connecter",
  connexionEnCours: "Connexion…",
  motDePasseOublie: "Mot de passe oublié ? Contactez votre administrateur.",
  identifiantsIncorrects: "Identifiants incorrects",
  tropDeTentatives: "Trop de tentatives, réessayez plus tard",
  emailObligatoire: "L'email est obligatoire",
  emailForme: "L'email doit avoir la forme nom@exemple.fr",
  emailTropLong: depasse("L'email", LONGUEURS_MAXIMALES.email),
  motDePasseObligatoire: "Le mot de passe est obligatoire",
} as const;

/** Espace interne : menu latéral et déconnexion (FR-9, NFR-4). */
export const MESSAGES_INTERNE = {
  seDeconnecter: "Se déconnecter",
  deconnexionEnCours: "Déconnexion…",
  menu: "Menu principal",
  demandes: "Demandes",
  /** Fin de la pastille, pour les lecteurs d'écran : « Demandes, 5 à traiter ». */
  pastilleATraiter: "à traiter",
  version: (version: string) => `Version v${version}`,
} as const;

/**
 * Écran I3 « Demandes » (EXPERIENCE.md, FR-11, FR-14). Le sous-texte de la
 * carte compteur deviendra « Nouvelles + urgentes non traitées » avec FR-19
 * (décision d'Aurel, 20 nov. 2026).
 */
export const MESSAGES_LISTE = {
  titre: "Demandes",
  aTraiter: "à traiter",
  sousTexteATraiter: "Nouvelles",
  /** Le compteur n'a pas pu être lu : un tiret plutôt qu'un chiffre faux. */
  compteurIndisponible: "—",
  legendeTableau: "Demandes, des plus récentes aux plus anciennes",
  colonnes: {
    reference: "Référence",
    deposeeLe: "Déposée le",
    demandeur: "Demandeur",
    objet: "Objet",
    categorie: "Catégorie",
    statut: "Statut",
  },
  videTitre: "Aucune demande pour le moment.",
  videTexte: "Les demandes déposées sur le formulaire apparaîtront ici.",
  erreur: "Impossible de charger les demandes.",
  reessayer: "Réessayer",
  pagination: "Pagination",
  precedente: "Précédente",
  suivante: "Suivante",
  chargement: "Chargement…",
  /** Barre de recherche (FR-12) : texte gris du champ et nom donné aux lecteurs d'écran. */
  recherche: "Rechercher par référence, nom, email, entreprise ou objet",
  /** Recherche sans résultat (texte exact de FR-12). */
  rechercheVideTitre: "Aucune demande trouvée",
  rechercheVideTexte: "Vérifiez l'orthographe ou retirez des filtres.",
  reinitialiser: "Réinitialiser",
} as const;

/** Ligne de résultat au-dessus du tableau (FR-13) : « 1 demande », « 42 demandes ». */
export function nombreDemandes(nombre: number): string {
  return `${formaterNombre(nombre)} ${nombre > 1 ? "demandes" : "demande"}`;
}

/** « Demandes 1 à 25 sur 42 · Page 1 sur 2 » (DESIGN.md, Pagination). */
export function resumePagination({
  premiere,
  derniere,
  total,
  page,
  pages,
}: {
  premiere: number;
  derniere: number;
  total: number;
  page: number;
  pages: number;
}): string {
  return `Demandes ${formaterNombre(premiere)} à ${formaterNombre(derniere)} sur ${formaterNombre(total)} · Page ${formaterNombre(page)} sur ${formaterNombre(pages)}`;
}

/**
 * Choix du mot de passe I2 (EXPERIENCE.md, FR-21). Les trois messages
 * d'erreur et le message de panne sont ceux de l'UX ; celui d'un mot de
 * passe trop long (limite de Supabase Auth : 72 octets) suit la forme des
 * autres.
 */
export const MESSAGES_MOT_DE_PASSE = {
  titre: "Choisir un nouveau mot de passe",
  texte: "Pour sécuriser votre compte, choisissez votre propre mot de passe.",
  nouveauMotDePasse: "Nouveau mot de passe",
  confirmer: "Confirmer",
  /** Règle visible sous le premier champ. */
  regle: `${LONGUEUR_MINIMALE_MOT_DE_PASSE} caractères minimum`,
  tropCourt: `${LONGUEUR_MINIMALE_MOT_DE_PASSE} caractères minimum`,
  tropLong: `Le mot de passe ne doit pas dépasser ${LONGUEUR_MAXIMALE_MOT_DE_PASSE_OCTETS} caractères (moins s'il contient des accents)`,
  nonIdentiques: "Les deux mots de passe ne sont pas identiques",
  identiqueAuTemporaire: "Choisissez un mot de passe différent du mot de passe temporaire",
  enregistrer: "Enregistrer et continuer",
  enregistrementEnCours: "Enregistrement…",
  /** Erreur technique : rien n'a changé. */
  enregistrementImpossible: "Votre mot de passe n'a pas pu être enregistré. Réessayez.",
  /** Toast affiché à l'arrivée sur « Demandes ». */
  enregistre: "Mot de passe enregistré",
} as const;

/** Encadré d'information de la connexion I1 après 8 h d'inactivité (FR-9). */
export const MESSAGE_SESSION_EXPIREE = "Votre session a expiré. Reconnectez-vous pour continuer.";

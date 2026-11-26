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
  /** Réponse `ERREUR_INTERNE` de la désactivation (story 3.4) : rien n'a changé. */
  desactivationImpossible: "Le compte n'a pas pu être désactivé. Réessayez.",
  /** Réponse `ERREUR_INTERNE` de la réactivation (story 3.4) : rien n'a changé. */
  reactivationImpossible: "Le compte n'a pas pu être réactivé. Réessayez.",
  /** Réponse `CONFLIT` (RM-9, FR-25) : texte exact de l'UX, rien n'a changé. */
  dernierAdministrateur: "Impossible : il doit rester au moins un administrateur actif.",
  /** Saisie de la désactivation ou de la réactivation mal formée (appel direct). */
  etatInvalide: "Le compte ou l'état demandé n'est pas valide.",
  /** Compte mal désigné dans une réinitialisation (appel direct, story 3.5). */
  compteInvalide: "Le compte demandé n'est pas valide.",
  /**
   * Réponse `ERREUR_INTERNE` de la réinitialisation (story 3.5), dans
   * l'encadré de la fenêtre ; la saisie est gardée.
   */
  reinitialisationImpossible: "Le mot de passe n'a pas pu être réinitialisé. Réessayez.",
  /**
   * Réponse `ERREUR_INTERNE` de la modification du nom ou du rôle (story
   * 3.3), dans l'encadré de la fenêtre ; la saisie est gardée.
   */
  modificationImpossible: "Le compte n'a pas pu être modifié. Réessayez.",
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
  /** Écran I5 (story 2.3). */
  nouvelleDemande: "Nouvelle demande",
  /** Fin de la pastille, pour les lecteurs d'écran : « Demandes, 5 à traiter ». */
  pastilleATraiter: "à traiter",
  /** Titre de la section du menu réservée aux administrateurs (story 3.1). */
  administration: "Administration",
  /** Écran A1 (story 3.1). */
  comptes: "Comptes",
  version: (version: string) => `Version v${version}`,
} as const;

/**
 * Écran A1 « Comptes » (EXPERIENCE.md, FR-24). Pas d'état vide :
 * l'administrateur connecté a toujours son compte. Les libellés des rôles
 * viennent de `LIBELLES_ROLES`.
 */
export const MESSAGES_COMPTES = {
  titre: "Comptes",
  legendeTableau: "Comptes internes, triés par nom",
  colonnes: {
    nom: "Nom",
    email: "Email",
    role: "Rôle",
    etat: "État",
    actions: "Actions",
  },
  actif: "Actif",
  /** Badge gris, toujours écrit en toutes lettres. */
  desactive: "Désactivé",
  /** État d'erreur, suivi de « Réessayer » (`BoutonReessayer`, texte de `MESSAGES_LISTE`). */
  erreur: "Impossible de charger les comptes.",
  chargement: "Chargement…",
  /** Bouton principal à côté du titre (story 3.2). */
  creerUnCompte: "Créer un compte",
  /**
   * Fenêtre « Créer un compte » (story 3.2, FR-21, RM-8). Les erreurs sous
   * les champs et l'encadré de panne viennent de `MESSAGES_COMPTE`.
   */
  creation: {
    titre: "Créer un compte",
    nom: "Nom",
    email: "Email",
    role: "Rôle",
    motDePasse: "Mot de passe temporaire",
    generer: "Générer",
    /** Nom du bouton « Générer » pour les lecteurs d'écran. */
    genererNom: "Générer un mot de passe temporaire",
    aide: "Transmettez ce mot de passe vous-même à la personne. Elle devra le changer à sa première connexion.",
    creerLeCompte: "Créer le compte",
    creationEnCours: "Création…",
    annuler: "Annuler",
    fermer: "Fermer",
    copier: "Copier",
    copie: "Copié",
    /** Toast de succès. */
    compteCree: "Compte créé",
  },
  /**
   * « Désactiver » et « Réactiver » de la colonne Actions (story 3.4 ;
   * FR-22, FR-25, RM-9, RM-10). Les pannes et le refus du dernier
   * administrateur viennent de `MESSAGES_COMPTE`.
   */
  etat: {
    desactiver: "Désactiver",
    /** Nom du bouton pour les lecteurs d'écran : « Désactiver le compte de Lucas Bernard ». */
    desactiverNom: (nom: string) => `Désactiver le compte de ${nom}`,
    desactivationEnCours: "Désactivation…",
    reactiver: "Réactiver",
    /** Nom du bouton pour les lecteurs d'écran : « Réactiver le compte de Lucas Bernard ». */
    reactiverNom: (nom: string) => `Réactiver le compte de ${nom}`,
    reactivationEnCours: "Réactivation…",
    /** Titre de la fenêtre de confirmation. */
    fenetreTitre: (nom: string) => `Désactiver le compte de ${nom} ?`,
    /** Texte de l'UX, avec le premier mot du nom : « Lucas ne pourra plus se connecter… ». */
    fenetreTexte: (prenom: string) =>
      `${prenom} ne pourra plus se connecter. Son nom restera dans l'historique des demandes.`,
    annuler: "Annuler",
    /** Toasts de succès (5 s). */
    compteDesactive: "Compte désactivé",
    compteReactive: "Compte réactivé",
  },
  /**
   * « Réinitialiser le mot de passe » de la colonne Actions (story 3.5 ;
   * FR-23). « 12 caractères minimum » et la panne viennent de
   * `MESSAGES_COMPTE`.
   */
  reinitialisation: {
    bouton: "Réinitialiser le mot de passe",
    /** Nom du bouton pour les lecteurs d'écran : « Réinitialiser le mot de passe de Lucas Bernard ». */
    boutonNom: (nom: string) => `Réinitialiser le mot de passe de ${nom}`,
    /** Titre de la fenêtre. */
    titre: (nom: string) => `Réinitialiser le mot de passe de ${nom}`,
    motDePasse: "Nouveau mot de passe temporaire",
    generer: "Générer",
    /** Nom du bouton « Générer » pour les lecteurs d'écran. */
    genererNom: "Générer un mot de passe temporaire",
    /** Texte de l'UX, avec le premier mot du nom : « … Lucas devra choisir… ». */
    texte: (prenom: string) =>
      `L'ancien mot de passe ne fonctionnera plus. ${prenom} devra choisir un nouveau mot de passe à sa prochaine connexion.`,
    annuler: "Annuler",
    reinitialiser: "Réinitialiser",
    reinitialisationEnCours: "Réinitialisation…",
    fermer: "Fermer",
    copier: "Copier",
    copie: "Copié",
    /** Toast de succès (5 s), comme à la création. */
    motDePasseReinitialise: "Mot de passe réinitialisé",
  },
  /**
   * « Modifier » de la colonne Actions, en premier (story 3.3 ; FR-22,
   * FR-25, RM-9). Les erreurs sous les champs, la panne et le refus du
   * dernier administrateur viennent de `MESSAGES_COMPTE`.
   */
  modification: {
    bouton: "Modifier",
    /** Nom du bouton pour les lecteurs d'écran : « Modifier le compte de Lucas Bernard ». */
    boutonNom: (nom: string) => `Modifier le compte de ${nom}`,
    /** Titre de la fenêtre. */
    titre: (nom: string) => `Modifier le compte de ${nom}`,
    nom: "Nom",
    role: "Rôle",
    /** Affiché en texte : il ne peut pas être modifié. */
    email: "Email",
    annuler: "Annuler",
    enregistrer: "Enregistrer",
    enregistrementEnCours: "Enregistrement…",
    /** Toast de succès (5 s). */
    compteModifie: "Compte modifié",
  },
} as const;

/**
 * Titre d'onglet neutre des pages d'administration : il ne dit rien de la
 * page à un collaborateur refusé (S1).
 */
export const TITRE_ONGLET_ADMINISTRATION = "Administration — Nova Services";

/** S1 — Accès refusé (EXPERIENCE.md, FR-24, RM-7). */
export const MESSAGES_ACCES_REFUSE = {
  message: "Accès refusé. Cette page est réservée aux administrateurs.",
  retourAuxDemandes: "Retour aux demandes",
  /** Réponse `ACCES_REFUSE` d'une Server Function d'administration (RM-7). */
  action: "Accès refusé.",
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
  /** Sous-texte de la carte quand rien n'est à traiter : sans félicitations (EXPERIENCE.md, SM-C3). */
  toutEstAJour: "Tout est à jour",
  /** Bas de la carte compteur, qui ouvre la liste filtrée (story 2.2). */
  afficherATraiter: "Afficher ces demandes",
  /** Nom de la carte pour les lecteurs d'écran : « 5 à traiter, afficher ces demandes ». */
  nomCarteATraiter: (nombre: string) => `${nombre} à traiter, afficher ces demandes`,
  /** Même nom quand le compteur n'a pas pu être lu (le tiret « — » n'est pas lu à voix haute). */
  nomCarteATraiterIndisponible: "Nombre à traiter indisponible, afficher ces demandes",
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
  /** Bouton principal à côté du titre (vers I5). */
  nouvelleDemande: "Nouvelle demande",
  videTitre: "Aucune demande pour le moment.",
  videTexte: "Les demandes déposées sur le formulaire apparaîtront ici.",
  /** Bouton secondaire de l'état vide (vers I5). */
  videSaisir: "Saisir une demande reçue par téléphone",
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
  /** Rangée de filtres (story 2.1) : « Statut : Tous », « Catégorie : Toutes », « Canal : Tous ». */
  filtres: "Filtres",
  filtreStatut: "Statut",
  filtreCategorie: "Catégorie",
  filtreCanal: "Canal",
  /** Bouton bascule de la rangée de filtres (story 2.2), à droite de « Canal ». */
  filtreATraiter: "À traiter",
  tous: "Tous",
  toutes: "Toutes",
  /** Après le nom d'une catégorie désactivée, dans le filtre Catégorie. */
  desactivee: "(désactivée)",
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

/**
 * Encadré neutre de la connexion I1 quand le compte a été désactivé pendant
 * la session (FR-22) : il ne dit pas pourquoi.
 */
export const MESSAGE_SESSION_TERMINEE = "Votre session a pris fin. Contactez votre administrateur si besoin.";

/**
 * Écran I4 « Détail d'une demande » (EXPERIENCE.md, FR-15, FR-17). Le
 * message « demande introuvable » est le texte exact de l'UX.
 */
export const MESSAGES_DETAIL = {
  titre: "Détail d'une demande",
  filAriane: "Fil d'Ariane",
  /** Lien « ← Demandes » du fil d'Ariane. */
  retourListe: "Demandes",
  blocDemande: "Demande",
  blocDemandeur: "Demandeur",
  blocInformations: "Informations",
  blocHistorique: "Historique",
  panneauStatut: "Statut",
  statutActuel: "Actuel :",
  nom: "Nom",
  email: "Email",
  telephone: "Téléphone",
  entreprise: "Entreprise",
  categorie: "Catégorie",
  canal: "Canal",
  deposeeLe: "Déposée le",
  /** Téléphone absent. */
  nonRenseigne: "Non renseigné",
  /** Entreprise absente. */
  nonRenseignee: "Non renseignée",
  /** Lien du bloc Demandeur vers la liste cherchée sur son email (story 2.4). */
  autresDemandes: "Voir ses autres demandes",
  introuvable: "Cette demande n'existe pas ou a été supprimée.",
  retourAuxDemandes: "Retour aux demandes",
  chargement: "Chargement…",
} as const;

/**
 * Changement de statut, écran I4 (EXPERIENCE.md, FR-16 ; décisions d'Aurel
 * du 21 nov. 2026 pour la fenêtre « Rouvrir »). Les libellés des boutons
 * viennent de `libelleTransition` (`src/shared/libelles.ts`).
 */
export const MESSAGES_STATUT = {
  /** Nom du groupe de boutons, pour les lecteurs d'écran. */
  actions: "Changer le statut",
  /** Toast de succès (5 s). */
  misAJour: "Statut mis à jour",
  /** Toast d'erreur (jusqu'à fermeture) : rien n'a changé. */
  echec: "Le statut n'a pas pu être modifié. Réessayez.",
  /** Bloc « Informations », demande *Traitée*. */
  clotureeLe: "Clôturée le",
  /** Fenêtre de confirmation de la réouverture. */
  fenetreRouvrirTitre: (reference: string) => `Rouvrir la demande ${reference} ?`,
  fenetreRouvrirTexte: "Elle repassera En cours et sa date de clôture sera effacée.",
  annuler: "Annuler",
  confirmerRouvrir: "Rouvrir la demande",
  /** Encadré quand un collègue est passé avant, sans savoir qui (cas imprévu). */
  modifieeEntreTemps: "Cette demande a été modifiée entre-temps. L'affichage a été mis à jour.",
} as const;

/**
 * Encadré d'information quand un collègue a changé le statut juste avant
 * (EXPERIENCE.md, I4 « modifiée entre-temps ») : « Cette demande a été
 * modifiée par Lucas Bernard à 9 h 11. L'affichage a été mis à jour. »
 * `heure` est déjà écrite à la française (`formaterHeure`).
 */
export function messageModifieePar(nom: string, heure: string): string {
  return `Cette demande a été modifiée par ${nom} à ${heure}. L'affichage a été mis à jour.`;
}

/**
 * Écran I5 « Nouvelle demande » (EXPERIENCE.md, FR-30, RM-12). Les champs
 * communs avec P1 gardent les messages de `MESSAGES_DEPOT` ; s'y ajoutent le
 * canal et la case remplie par l'utilisateur interne. Les légendes des
 * blocs ne s'adressent pas au demandeur (« Demandeur », « Demande »).
 */
export const MESSAGES_SAISIE = {
  titre: "Nouvelle demande",
  sousTitre: "Saisissez une demande reçue par téléphone ou par email.",
  canal: "Canal",
  canalObligatoire: "Le canal est obligatoire",
  /** Appel direct avec un canal autre que Téléphone ou Email (*Formulaire* compris). */
  canalInconnu: "Le canal doit être Téléphone ou Email",
  blocDemandeur: "Demandeur",
  blocDemande: "Demande",
  caseEtiquette: "La personne a été informée de l'usage de ses données.",
  caseObligatoire: "Confirmez que la personne a été informée de l'usage de ses données",
  /** Lien qui déplie la mention de P1, à lire à la personne. */
  texteALire: "Texte à lui lire",
  enregistrer: "Enregistrer la demande",
  enregistrementEnCours: "Enregistrement…",
  /** Encadré de panne : rien n'est perdu, le même envoi peut être relancé. */
  panne: "La demande n'a pas pu être enregistrée. Réessayez.",
  /** Numéro d'envoi absent ou mal formé : seul un appel direct peut l'envoyer. */
  formulaireIncomplet: "Le formulaire est incomplet. Rechargez la page.",
  chargement: "Chargement du formulaire…",
} as const;

/** Toast après l'enregistrement d'une saisie (I5) : « Demande NOVA-2026-0043 créée ». */
export function messageDemandeCreee(reference: string): string {
  return `Demande ${reference} créée`;
}

/** Bouton qui ferme un toast d'erreur (ceux-ci restent jusqu'à fermeture). */
export const MESSAGE_FERMER_NOTIFICATION = "Fermer la notification";

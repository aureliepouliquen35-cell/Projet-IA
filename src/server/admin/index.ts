import "server-only";

import { z } from "zod";

import { journaliser, type DetailsJournal } from "@/server/journal";
import { creerClientSecret } from "@/server/supabase-secret";
import { nouveauCodeSupport } from "@/shared/code-support";
import type { Role } from "@/shared/constantes";
import { MESSAGES_ACCES_REFUSE, MESSAGES_COMPTE, MESSAGES_PARAMETRES, resumeErreurs } from "@/shared/messages";
import { echec, succes, type ErreursChamps, type Reponse } from "@/shared/reponse";
import { validerCompte, validerEtatCompte, validerReinitialisation } from "@/shared/schemas/compte";
import { validerParametres, type DonneesParametres } from "@/shared/schemas/parametres";

// Comptes internes et informations générales (AD-6, AD-9, AD-13).
//
// Seule façon de créer un compte, en deux temps : le compte est créé dans
// Supabase Auth (« email confirmé », aucun email envoyé, aucun rôle dans ses
// métadonnées), puis la fonction SQL `creer_profil` crée son profil et garde
// l'empreinte du mot de passe temporaire. Si le profil échoue, le compte Auth
// est supprimé : il n'existe jamais de compte sans profil.
//
// Utilisé par la procédure d'installation (`scripts/installation`, story 1.5),
// par l'écran A1 (`actionCreerCompte`, story 3.2) et, plus tard, par l'écran
// A3 (story 4.3).
//
// Désactivation et réactivation (story 3.4) : `changerEtatCompte`, la base
// d'abord (`modifier_compte`, règle du dernier administrateur), puis le
// blocage dans Supabase Auth, avec retour arrière si Auth échoue.
//
// Réinitialisation du mot de passe (story 3.5) : `reinitialiserMotDePasse`,
// la base d'abord (`reinitialiser_mdp`), puis le mot de passe dans Supabase
// Auth, sans retour arrière.
//
// Jamais de mot de passe dans le journal ni dans les messages d'erreur.

/** Au-delà, on abandonne : la commande ou l'écran ne restent pas bloqués. */
const DELAI_MS = 10000;

// Le générateur est dans `src/shared` (story 3.2) : le bouton « Générer »
// d'A1 tire le mot de passe dans le navigateur. Réexporté ici pour la
// procédure d'installation.
export {
  ALPHABET_MOT_DE_PASSE,
  genererMotDePasseTemporaire,
  LONGUEUR_MOT_DE_PASSE_TEMPORAIRE,
} from "@/shared/mot-de-passe-temporaire";

/** Clés absentes du fichier d'environnement. */
export const MESSAGE_CLES_ABSENTES =
  "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY manquante ou invalide : complétez le fichier d'environnement en suivant le modèle .env.example.";

type ClientSecret = ReturnType<typeof creerClientSecret>;

function clientSecret(): ClientSecret | null {
  try {
    return creerClientSecret();
  } catch {
    return null;
  }
}

/**
 * Vérifie que les clés sont présentes, et donne l'adresse du projet Supabase
 * visé (affichée avant toute action, pour ne pas se tromper de projet).
 * Les clés elles-mêmes ne sont jamais renvoyées.
 */
export function preparerInstallation(): Reponse<{ adresseProjet: string }> {
  if (!clientSecret()) return echec("ERREUR_INTERNE", MESSAGE_CLES_ABSENTES);
  return succes({ adresseProjet: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "" });
}

/** Erreur imprévue : journalisée avec un code court, sans détail personnel. */
async function erreurImprevue(
  message: string,
  details: DetailsJournal,
): Promise<Reponse<never>> {
  const codeSupport = nouveauCodeSupport();
  console.error(`[admin] erreur inattendue (code ${codeSupport}) :`, details);
  await journaliser("erreur", "erreur_inattendue", { type: "admin", ...details }, codeSupport);
  return echec("ERREUR_INTERNE", message, { codeSupport });
}

function echecValidation(champs: ErreursChamps): Reponse<never> {
  return echec("VALIDATION", resumeErreurs(Object.keys(champs).length), { champs });
}

/** Codes de Supabase Auth pour un email déjà pris. */
const CODES_EMAIL_EXISTANT = new Set(["email_exists", "user_already_exists"]);

export type CompteCree = { id: string; nom: string; email: string; role: Role };

/**
 * Crée un compte interne (FR-21) : compte Auth confirmé, puis profil (rôle,
 * actif, « doit changer son mot de passe ») et empreinte du mot de passe
 * temporaire, puis `compte_cree` au journal.
 *
 * `saisie` : nom, email, rôle, mot de passe temporaire (12 caractères au
 * moins, à afficher une seule fois par l'appelant). `auteur` : qui crée le
 * compte (l'identifiant d'un administrateur, ou « installation »).
 */
export async function creerCompte(
  saisie: unknown,
  { auteur = "installation" }: { auteur?: string } = {},
): Promise<Reponse<CompteCree>> {
  const validation = validerCompte(saisie);
  if (!validation.ok) return echecValidation(validation.champs);
  const { nom, email, role, motDePasseTemporaire } = validation.donnees;

  const client = clientSecret();
  if (!client) return echec("ERREUR_INTERNE", MESSAGE_CLES_ABSENTES);

  // 1. Compte Auth, sans aucune métadonnée (le rôle n'est que dans profils).
  let id: string;
  try {
    const { data, error } = await client.auth.admin.createUser({
      email,
      password: motDePasseTemporaire,
      email_confirm: true,
    });
    if (error) {
      if (error.code && CODES_EMAIL_EXISTANT.has(error.code)) {
        return echec("CONFLIT", MESSAGES_COMPTE.compteExistant, {
          champs: { email: MESSAGES_COMPTE.emailDejaUtilise },
        });
      }
      if (error.code === "weak_password") {
        return echecValidation({ motDePasseTemporaire: MESSAGES_COMPTE.motDePasseTropCourt });
      }
      return erreurImprevue(MESSAGES_COMPTE.creationImpossible, {
        action: "creer_compte",
        etape: "auth",
        code_base: error.code ?? String(error.status ?? "inconnu"),
      });
    }
    id = data.user.id;
  } catch {
    return erreurImprevue(MESSAGES_COMPTE.creationImpossible, {
      action: "creer_compte",
      etape: "auth",
      code_base: "injoignable",
    });
  }

  // 2. Profil et empreinte du mot de passe temporaire.
  let refus: string | null = null;
  try {
    const { error } = await client
      .rpc("creer_profil", {
        p_id: id,
        p_nom: nom,
        p_email: email,
        p_role: role,
        p_mdp_temporaire: motDePasseTemporaire,
      })
      .abortSignal(AbortSignal.timeout(DELAI_MS));
    if (error) refus = error.code || "inconnu";
  } catch {
    refus = "injoignable";
  }

  if (refus) {
    // 3. Retour arrière (AD-6) : pas de compte Auth sans profil.
    const supprime = await supprimerCompteAuth(client, id);
    if (!supprime) {
      return erreurImprevue(
        `La création du compte n'a pas pu être confirmée, et sa suppression dans Supabase Auth a échoué (identifiant : ${id}). Ouvrez Table Editor > profils et cherchez cet identifiant : si une ligne existe, le compte a bien été créé (son mot de passe temporaire devra être réinitialisé) ; sinon, supprimez le compte dans Authentication > Users, puis relancez la commande.`,
        { action: "creer_compte", etape: "creer_profil", code_base: refus, compte_id: id, compte_auth_supprime: false },
      );
    }
    // Profil déjà présent avec cet email (index `profils_email_unique`).
    if (refus === "23505") {
      return echec("CONFLIT", MESSAGES_COMPTE.compteExistant, {
        champs: { email: MESSAGES_COMPTE.emailDejaUtilise },
      });
    }
    return erreurImprevue(MESSAGES_COMPTE.creationImpossible, {
      action: "creer_compte",
      etape: "creer_profil",
      code_base: refus,
      compte_id: id,
      compte_auth_supprime: true,
    });
  }

  await journaliser("info", "compte_cree", { compte_id: id, email, role, auteur });
  return succes({ id, nom, email, role });
}

/** Supprime un compte Auth qui n'a pas de profil. Vrai si c'est fait. */
async function supprimerCompteAuth(client: ClientSecret, id: string): Promise<boolean> {
  try {
    const { error } = await client.auth.admin.deleteUser(id);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Remplace les informations générales affichées aux demandeurs (FR-31) :
 * téléphone (facultatif), email de contact, contact pour les données
 * personnelles. Visibles aussitôt sur le formulaire et la confirmation, qui
 * les relisent à chaque affichage. `parametres_modifies` au journal.
 */
export async function installerParametres(
  saisie: unknown,
  { auteur = "installation" }: { auteur?: string } = {},
): Promise<Reponse<DonneesParametres>> {
  const validation = validerParametres(saisie);
  if (!validation.ok) return echecValidation(validation.champs);
  const { telephone, emailContact, contactDonnees } = validation.donnees;

  const client = clientSecret();
  if (!client) return echec("ERREUR_INTERNE", MESSAGE_CLES_ABSENTES);

  let refus: string | null = null;
  try {
    const { error } = await client
      .rpc("modifier_parametres", {
        p_telephone: telephone,
        p_email_contact: emailContact,
        p_contact_donnees: contactDonnees,
      })
      .abortSignal(AbortSignal.timeout(DELAI_MS));
    if (error) refus = error.code || "inconnu";
  } catch {
    refus = "injoignable";
  }

  if (refus === "NV103") return echecValidation({ emailContact: MESSAGES_PARAMETRES.emailForme });
  if (refus) {
    return erreurImprevue(MESSAGES_PARAMETRES.enregistrementImpossible, {
      action: "modifier_parametres",
      code_base: refus,
    });
  }

  await journaliser("info", "parametres_modifies", { auteur });
  return succes({ telephone, emailContact, contactDonnees });
}

// ---------------------------------------------------------------------------
// Désactivation et réactivation (story 3.4 ; FR-22, FR-25, RM-9, RM-10)
// ---------------------------------------------------------------------------

/**
 * Blocage d'un compte désactivé dans Supabase Auth : environ cent ans. Sa
 * session ne peut plus se renouveler, et Auth refuse toute connexion
 * (`user_banned`, lu comme « Identifiants incorrects »).
 */
export const DUREE_BLOCAGE_AUTH = "876000h";

/** Refus prévus de `modifier_compte` (codes SQL propres à l'application). */
const REFUS_AUTEUR = "NV202";
const REFUS_DERNIER_ADMINISTRATEUR = "NV203";
const REFUS_COMPTE_INTROUVABLE = "NV204";

const schemaModification = z.object({
  nom: z.string(),
  email: z.string(),
  change: z.boolean(),
});

/** Compte après une désactivation ou une réactivation. */
export type EtatCompteModifie = {
  id: string;
  nom: string;
  email: string;
  /** État en place après l'appel. */
  actif: boolean;
  /** Faux si le compte était déjà dans cet état : rien n'a été fait. */
  change: boolean;
};

/**
 * Désactive (`actif` faux) ou réactive (`actif` vrai) le compte `compteId`.
 * Un compte n'est jamais supprimé (RM-10).
 *
 * 1. Saisie vérifiée (Zod) : `VALIDATION` sans aucun appel.
 * 2. La base d'abord, par `modifier_compte` : elle seule tient la règle du
 *    dernier administrateur actif (RM-9, AD-10) et revérifie que `auteur`
 *    est un administrateur actif. Refus : `CONFLIT` (dernier
 *    administrateur, message exact), `ACCES_REFUSE` (auteur), `INTROUVABLE`.
 * 3. Puis Supabase Auth : compte bloqué (`ban_duration`), ou débloqué. Si
 *    Auth échoue, le profil est remis comme avant (`retablir_compte`) :
 *    l'état ne change pas, et l'échec est journalisé avec un code court.
 *    Profil déjà dans l'état voulu : Auth est quand même remis d'accord
 *    (sans retour arrière s'il échoue), puis réussite avec `change` faux,
 *    sans rien au journal.
 * 4. `compte_desactive` ou `compte_reactive` au journal (compte, email,
 *    auteur).
 *
 * `auteur` : identifiant de l'administrateur, déjà vérifié par
 * `exigerAdministrateur()`.
 */
export async function changerEtatCompte(
  compteId: unknown,
  actif: unknown,
  { auteur }: { auteur: string },
): Promise<Reponse<EtatCompteModifie>> {
  const validation = validerEtatCompte({ compteId, actif });
  if (!validation.ok) return echecValidation(validation.champs);
  const { compteId: id, actif: voulu } = validation.donnees;

  const messagePanne = voulu ? MESSAGES_COMPTE.reactivationImpossible : MESSAGES_COMPTE.desactivationImpossible;
  const action = voulu ? "reactiver_compte" : "desactiver_compte";

  const client = clientSecret();
  if (!client) return echec("ERREUR_INTERNE", MESSAGE_CLES_ABSENTES);

  // 1. La base, qui tient la règle du dernier administrateur.
  let refus: string | null = null;
  let reponseBase: unknown = null;
  try {
    const { data, error } = await client
      .rpc("modifier_compte", { p_auteur: auteur, p_compte: id, p_actif: voulu })
      .abortSignal(AbortSignal.timeout(DELAI_MS));
    if (error) refus = error.code || "inconnu";
    else reponseBase = data;
  } catch {
    refus = "injoignable";
  }

  if (refus === REFUS_DERNIER_ADMINISTRATEUR) return echec("CONFLIT", MESSAGES_COMPTE.dernierAdministrateur);
  if (refus === REFUS_AUTEUR) return echec("ACCES_REFUSE", MESSAGES_ACCES_REFUSE.action);
  if (refus === REFUS_COMPTE_INTROUVABLE) return echec("INTROUVABLE", messagePanne);
  if (refus) {
    return erreurImprevue(messagePanne, { action, etape: "modifier_compte", code_base: refus, compte_id: id });
  }

  const lu = schemaModification.safeParse(reponseBase);
  if (!lu.success) {
    // Réponse illisible : on ne sait pas si le profil a changé, donc rien
    // n'est remis. Un nouvel essai resynchronise Auth (branche suivante).
    return erreurImprevue(messagePanne, {
      action,
      etape: "modifier_compte",
      code_base: "reponse_inattendue",
      compte_id: id,
    });
  }
  const { nom, email, change } = lu.data;

  // 2. Supabase Auth : la session ne peut plus se renouveler (ou de nouveau).
  const refusAuth = await bloquerDansAuth(client, id, voulu);

  if (!change) {
    // Profil déjà dans l'état voulu : Auth est seulement remis d'accord avec
    // lui (après un retour arrière manqué, par exemple). Rien à défaire,
    // rien au journal comme désactivation ou réactivation.
    if (refusAuth) {
      return erreurImprevue(messagePanne, { action, etape: "auth", code_base: refusAuth, compte_id: id });
    }
    return succes({ id, nom, email, actif: voulu, change: false });
  }

  if (refusAuth) {
    // 3. Retour arrière : le profil est remis comme avant.
    const retabli = await retablirCompte(client, id, !voulu);
    return erreurImprevue(messagePanne, {
      action,
      etape: "auth",
      code_base: refusAuth,
      compte_id: id,
      profil_retabli: retabli,
    });
  }

  await journaliser("info", voulu ? "compte_reactive" : "compte_desactive", { compte_id: id, email, auteur });
  return succes({ id, nom, email, actif: voulu, change: true });
}

/**
 * Bloque (`actif` faux) ou débloque (`actif` vrai) le compte dans Supabase
 * Auth. Renvoie `null` si c'est fait, sinon un code court de l'échec.
 */
async function bloquerDansAuth(client: ClientSecret, id: string, actif: boolean): Promise<string | null> {
  try {
    const { error } = await client.auth.admin.updateUserById(id, {
      ban_duration: actif ? "none" : DUREE_BLOCAGE_AUTH,
    });
    return error ? (error.code ?? String(error.status ?? "inconnu")) : null;
  } catch {
    return "injoignable";
  }
}

// ---------------------------------------------------------------------------
// Réinitialisation du mot de passe (story 3.5 ; FR-23)
// ---------------------------------------------------------------------------

/** Refus prévu de `reinitialiser_mdp` : mot de passe temporaire trop court. */
const REFUS_MOT_DE_PASSE_TROP_COURT = "NV205";

/** Codes de Supabase Auth pour un mot de passe identique à l'actuel : déjà en place. */
const CODES_MEME_MOT_DE_PASSE = new Set(["same_password"]);

const schemaReinitialisationBase = z.object({
  nom: z.string(),
  email: z.string(),
});

/** Compte dont le mot de passe vient d'être réinitialisé. Jamais le mot de passe. */
export type MotDePasseReinitialise = { id: string; nom: string; email: string };

/**
 * Donne au compte un nouveau mot de passe temporaire (FR-23). L'ancien ne
 * fonctionne plus, et la personne doit en choisir un nouveau à sa prochaine
 * connexion (I2, par la garde). Un compte désactivé le reste.
 *
 * 1. Saisie vérifiée (Zod : identifiant, 12 caractères au moins) :
 *    `VALIDATION` sans aucun appel.
 * 2. La base d'abord, par `reinitialiser_mdp` : auteur revérifié,
 *    « doit changer son mot de passe », empreinte du mot de passe
 *    temporaire remplacée. Refus : `ACCES_REFUSE` (auteur), `INTROUVABLE`,
 *    `VALIDATION` (trop court).
 * 3. Puis Supabase Auth : le mot de passe du compte est remplacé. Si Auth
 *    échoue, rien n'est défait : l'ancien mot de passe marche encore et
 *    devra être changé à la connexion ; un nouvel essai répare.
 * 4. `mot_de_passe_reinitialise` au journal (compte, email, auteur), jamais
 *    le mot de passe.
 *
 * `auteur` : identifiant de l'administrateur, déjà vérifié par
 * `exigerAdministrateur()`.
 */
export async function reinitialiserMotDePasse(
  saisie: unknown,
  { auteur }: { auteur: string },
): Promise<Reponse<MotDePasseReinitialise>> {
  const validation = validerReinitialisation(saisie);
  if (!validation.ok) return echecValidation(validation.champs);
  const { compteId: id, motDePasseTemporaire } = validation.donnees;

  const messagePanne = MESSAGES_COMPTE.reinitialisationImpossible;
  const action = "reinitialiser_mot_de_passe";

  const client = clientSecret();
  if (!client) return echec("ERREUR_INTERNE", MESSAGE_CLES_ABSENTES);

  // 1. La base : obligation de changer le mot de passe, nouvelle empreinte.
  let refus: string | null = null;
  let reponseBase: unknown = null;
  try {
    const { data, error } = await client
      .rpc("reinitialiser_mdp", { p_auteur: auteur, p_compte: id, p_mdp_temporaire: motDePasseTemporaire })
      .abortSignal(AbortSignal.timeout(DELAI_MS));
    if (error) refus = error.code || "inconnu";
    else reponseBase = data;
  } catch {
    refus = "injoignable";
  }

  if (refus === REFUS_AUTEUR) return echec("ACCES_REFUSE", MESSAGES_ACCES_REFUSE.action);
  if (refus === REFUS_COMPTE_INTROUVABLE) return echec("INTROUVABLE", messagePanne);
  if (refus === REFUS_MOT_DE_PASSE_TROP_COURT) {
    return echecValidation({ motDePasseTemporaire: MESSAGES_COMPTE.motDePasseTropCourt });
  }
  if (refus) {
    return erreurImprevue(messagePanne, { action, etape: "reinitialiser_mdp", code_base: refus, compte_id: id });
  }

  const lu = schemaReinitialisationBase.safeParse(reponseBase);
  if (!lu.success) {
    return erreurImprevue(messagePanne, {
      action,
      etape: "reinitialiser_mdp",
      code_base: "reponse_inattendue",
      compte_id: id,
    });
  }
  const { nom, email } = lu.data;

  // 2. Supabase Auth : l'ancien mot de passe ne fonctionne plus.
  try {
    const { error } = await client.auth.admin.updateUserById(id, { password: motDePasseTemporaire });
    if (error && !(error.code && CODES_MEME_MOT_DE_PASSE.has(error.code))) {
      if (error.code === "weak_password") {
        return echecValidation({ motDePasseTemporaire: MESSAGES_COMPTE.motDePasseTropCourt });
      }
      return erreurImprevue(messagePanne, {
        action,
        etape: "auth",
        code_base: error.code ?? String(error.status ?? "inconnu"),
        compte_id: id,
      });
    }
  } catch {
    return erreurImprevue(messagePanne, { action, etape: "auth", code_base: "injoignable", compte_id: id });
  }

  await journaliser("info", "mot_de_passe_reinitialise", { compte_id: id, email, auteur });
  return succes({ id, nom, email });
}

/** Remet `profils.actif` du compte comme avant. Vrai si c'est fait. */
async function retablirCompte(client: ClientSecret, id: string, actif: boolean): Promise<boolean> {
  try {
    const { error } = await client
      .rpc("retablir_compte", { p_compte: id, p_actif: actif })
      .abortSignal(AbortSignal.timeout(DELAI_MS));
    return !error;
  } catch {
    return false;
  }
}

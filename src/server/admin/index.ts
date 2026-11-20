import "server-only";

import { randomInt } from "node:crypto";

import { journaliser, type DetailsJournal } from "@/server/journal";
import { creerClientSecret } from "@/server/supabase-secret";
import { nouveauCodeSupport } from "@/shared/code-support";
import type { Role } from "@/shared/constantes";
import { MESSAGES_COMPTE, MESSAGES_PARAMETRES, resumeErreurs } from "@/shared/messages";
import { echec, succes, type ErreursChamps, type Reponse } from "@/shared/reponse";
import { validerCompte } from "@/shared/schemas/compte";
import { validerParametres, type DonneesParametres } from "@/shared/schemas/parametres";

// Comptes internes et informations générales (AD-6, AD-9, AD-13).
//
// Seule façon de créer un compte, en deux temps : le compte est créé dans
// Supabase Auth (« email confirmé », aucun email envoyé, aucun rôle dans ses
// métadonnées), puis la fonction SQL `creer_profil` crée son profil et garde
// l'empreinte du mot de passe temporaire. Si le profil échoue, le compte Auth
// est supprimé : il n'existe jamais de compte sans profil.
//
// Utilisé par la procédure d'installation (`scripts/installation`, story 1.5)
// et, plus tard, par les écrans A1 et A3 (stories 3.2 et 4.3).
//
// Jamais de mot de passe dans le journal ni dans les messages d'erreur.

/** Au-delà, on abandonne : la commande ou l'écran ne restent pas bloqués. */
const DELAI_MS = 10000;

/** Longueur d'un mot de passe temporaire tiré au hasard (12 au moins, NFR-11). */
export const LONGUEUR_MOT_DE_PASSE_TEMPORAIRE = 16;

/**
 * Caractères d'un mot de passe temporaire : lettres et chiffres, sans ceux
 * qu'on confond en le recopiant (0 et O, o ; 1, l et I).
 */
export const ALPHABET_MOT_DE_PASSE = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Mot de passe temporaire tiré au hasard (générateur cryptographique). */
export function genererMotDePasseTemporaire(): string {
  let motDePasse = "";
  for (let i = 0; i < LONGUEUR_MOT_DE_PASSE_TEMPORAIRE; i += 1) {
    motDePasse += ALPHABET_MOT_DE_PASSE[randomInt(ALPHABET_MOT_DE_PASSE.length)];
  }
  return motDePasse;
}

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

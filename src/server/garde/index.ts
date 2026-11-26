import "server-only";

import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { poserSessionTerminee } from "@/server/passage";
import {
  ADRESSE_ACCUEIL_INTERNE,
  ADRESSE_CONNEXION,
  ADRESSE_NOUVEAU_MOT_DE_PASSE,
} from "@/shared/acces";
import { ROLES, type Role } from "@/shared/constantes";

// Garde d'accès de l'espace interne (AD-7). Chaque page interne et chaque
// Server Function interne commence par `exigerUtilisateur()` ; l'écran I2 et
// sa Server Function, par `exigerChangementMotDePasse()` ; chaque page,
// lecture et Server Function d'administration, par `exigerAdministrateur()`.
//
// La session vient des cookies (vérifiée par `getClaims`) ; le nom, l'email, le rôle,
// l'état du compte et « doit changer son mot de passe » sont **relus dans
// `profils`** à chaque requête, avec la session de la personne (règle RLS
// « sa propre ligne »). Le rôle n'est jamais lu dans les métadonnées du
// compte Supabase, que l'utilisateur peut modifier lui-même.
//
// Compte désactivé pendant la session (FR-22, story 3.4) : la session est
// fermée et la connexion I1 affichera « Votre session a pris fin… ». Pour
// une page, le proxy l'a déjà fait avant l'affichage (Next.js n'écrit pas de
// cookie pendant un rendu) ; pour une Server Function, c'est la garde.
//
// Le proxy renvoie déjà vers I2 ou la connexion avant l'affichage ; la garde
// reste la vraie protection (Server Functions, pages).

/** Ce que l'espace interne sait de la personne connectée. */
export type UtilisateurConnecte = {
  id: string;
  nom: string;
  /**
   * Email du profil (`profils.email`), écrit comme auteur au journal
   * (`parametres_modifies`, story 4.3).
   */
  email: string;
  role: Role;
  /** Vrai tant que le mot de passe temporaire n'a pas été remplacé (I2). */
  doitChangerMdp: boolean;
};

/** Au-delà, on abandonne : la page ne reste pas bloquée. */
const DELAI_MS = 8000;

const estUnRole = (valeur: unknown): valeur is Role =>
  typeof valeur === "string" && (ROLES as readonly string[]).includes(valeur);

/**
 * Session lue : la personne connectée et active, ou `null` ; `desactive` est
 * vrai si la session appartient à un compte dont le profil existe mais est
 * inactif (compte désactivé pendant la session).
 */
type LectureSession = { utilisateur: UtilisateurConnecte | null; desactive: boolean };

const SANS_UTILISATEUR: LectureSession = { utilisateur: null, desactive: false };

/** Lit la session et le profil, une seule fois par requête (`cache` de React). */
const lireSession = cache(async (): Promise<LectureSession> => {
  const supabase = await createClient();

  const { data: session, error: erreurSession } = await supabase.auth.getClaims();
  if (erreurSession) {
    if (isAuthRetryableFetchError(erreurSession)) {
      throw new Error(`Vérification de la session impossible (code ${erreurSession.status}).`);
    }
    return SANS_UTILISATEUR;
  }
  const id = session?.claims?.sub;
  if (typeof id !== "string" || id === "") return SANS_UTILISATEUR;

  const { data: profil, error } = await supabase
    .from("profils")
    .select("id, nom, email, role, actif, doit_changer_mdp")
    .eq("id", id)
    .abortSignal(AbortSignal.timeout(DELAI_MS))
    .maybeSingle();
  if (error) {
    throw new Error(`Lecture du profil impossible (code ${error.code || "inconnu"}).`);
  }
  if (!profil) return SANS_UTILISATEUR;
  if (profil.actif === false) return { utilisateur: null, desactive: true };
  if (profil.actif !== true) return SANS_UTILISATEUR;
  if (typeof profil.nom !== "string" || typeof profil.email !== "string" || !estUnRole(profil.role)) {
    throw new Error("Le profil lu n'a pas de nom, d'email ou de rôle reconnu.");
  }
  if (typeof profil.doit_changer_mdp !== "boolean") {
    throw new Error("Le profil lu ne dit pas si le mot de passe doit être changé.");
  }

  return {
    utilisateur: {
      id,
      nom: profil.nom,
      email: profil.email,
      role: profil.role,
      doitChangerMdp: profil.doit_changer_mdp,
    },
    desactive: false,
  };
});

/**
 * La personne connectée, ou `null` : pas de session, session invalide,
 * compte sans profil ou inactif.
 *
 * Lit une seule fois par requête (`cache` de React). Lève une erreur si
 * Supabase ne répond pas : la page affiche alors l'écran S3.
 */
export const lireUtilisateur = cache(async (): Promise<UtilisateurConnecte | null> => {
  return (await lireSession()).utilisateur;
});

/**
 * Ferme la session d'un compte désactivé (`scope: "local"`) et pose le
 * message « Votre session a pris fin… » de la connexion. `cache` évite de
 * la relancer pendant le rendu d'une même page ; dans une Server Function,
 * il ne garde rien, mais un second appel est sans effet gênant (session
 * déjà fermée, même cookie). Pendant le rendu d'une page, Next.js refuse
 * d'écrire un cookie : l'échec est sans conséquence, le proxy l'a déjà
 * fait avant le rendu.
 */
const terminerSessionDesactivee = cache(async (): Promise<void> => {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      console.error("[garde] fermeture de session signalée par Auth :", error.code ?? error.status);
    }
  } catch (cause) {
    console.error(
      "[garde] fermeture de session impossible :",
      cause instanceof Error ? cause.message : cause,
    );
  }
  try {
    await poserSessionTerminee();
  } catch {
    // Rendu d'une page : cookie impossible à écrire ici (le proxy l'a posé).
  }
});

/**
 * Sans personne connectée et active, renvoi vers la connexion ; pour un
 * compte désactivé pendant la session, la session est d'abord fermée et le
 * message posé.
 */
async function exigerSession(): Promise<UtilisateurConnecte> {
  const { utilisateur, desactive } = await lireSession();
  if (!utilisateur) {
    if (desactive) await terminerSessionDesactivee();
    redirect(ADRESSE_CONNEXION);
  }
  return utilisateur;
}

/**
 * La personne connectée ; sinon, renvoi vers la connexion (I1). Tant que son
 * mot de passe temporaire n'est pas remplacé, renvoi vers I2. Compte
 * désactivé pendant la session : session fermée, puis I1 avec « Votre
 * session a pris fin… ». À appeler en premier dans chaque page et chaque
 * Server Function internes.
 */
export async function exigerUtilisateur(): Promise<UtilisateurConnecte> {
  const utilisateur = await exigerSession();
  if (utilisateur.doitChangerMdp) redirect(ADRESSE_NOUVEAU_MOT_DE_PASSE);
  return utilisateur;
}

/**
 * La personne connectée si elle est administrateur, sinon `null` (FR-24,
 * RM-7). Commence par `exigerUtilisateur()` : sans session ou avec un compte
 * inactif, renvoi vers la connexion ; mot de passe à choisir, renvoi vers
 * I2. Le rôle est celui relu dans `profils` pour cette requête (AD-7) : un
 * administrateur rétrogradé perd ses droits à sa prochaine action.
 *
 * À appeler en premier dans chaque page, lecture et Server Function
 * d'administration. `null` n'est pas une panne : la page affiche S1 et une
 * action répond `ACCES_REFUSE`.
 */
export async function exigerAdministrateur(): Promise<UtilisateurConnecte | null> {
  const utilisateur = await exigerUtilisateur();
  return utilisateur.role === "administrateur" ? utilisateur : null;
}

/**
 * La personne connectée qui doit choisir son mot de passe (écran I2). Sans
 * session : renvoi vers la connexion (compte désactivé : session fermée et
 * message, comme `exigerUtilisateur`) ; mot de passe déjà choisi : renvoi
 * vers « Demandes ». À appeler en premier dans l'écran I2 et sa Server
 * Function.
 */
export async function exigerChangementMotDePasse(): Promise<UtilisateurConnecte> {
  const utilisateur = await exigerSession();
  if (!utilisateur.doitChangerMdp) redirect(ADRESSE_ACCUEIL_INTERNE);
  return utilisateur;
}

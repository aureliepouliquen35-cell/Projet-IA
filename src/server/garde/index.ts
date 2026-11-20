import "server-only";

import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import {
  ADRESSE_ACCUEIL_INTERNE,
  ADRESSE_CONNEXION,
  ADRESSE_NOUVEAU_MOT_DE_PASSE,
} from "@/shared/acces";
import { ROLES, type Role } from "@/shared/constantes";

// Garde d'accès de l'espace interne (AD-7). Chaque page interne et chaque
// Server Function interne commence par `exigerUtilisateur()` ; l'écran I2 et
// sa Server Function, par `exigerChangementMotDePasse()`.
//
// La session vient des cookies (vérifiée par `getClaims`) ; le nom, le rôle,
// l'état du compte et « doit changer son mot de passe » sont **relus dans
// `profils`** à chaque requête, avec la session de la personne (règle RLS
// « sa propre ligne »). Le rôle n'est jamais lu dans les métadonnées du
// compte Supabase, que l'utilisateur peut modifier lui-même.
//
// Le proxy renvoie déjà vers I2 ou la connexion avant l'affichage ; la garde
// reste la vraie protection (Server Functions, pages).

/** Ce que l'espace interne sait de la personne connectée. */
export type UtilisateurConnecte = {
  id: string;
  nom: string;
  role: Role;
  /** Vrai tant que le mot de passe temporaire n'a pas été remplacé (I2). */
  doitChangerMdp: boolean;
};

/** Au-delà, on abandonne : la page ne reste pas bloquée. */
const DELAI_MS = 8000;

const estUnRole = (valeur: unknown): valeur is Role =>
  typeof valeur === "string" && (ROLES as readonly string[]).includes(valeur);

/**
 * La personne connectée, ou `null` : pas de session, session invalide,
 * compte sans profil ou inactif.
 *
 * Lit une seule fois par requête (`cache` de React). Lève une erreur si
 * Supabase ne répond pas : la page affiche alors l'écran S3.
 */
export const lireUtilisateur = cache(async (): Promise<UtilisateurConnecte | null> => {
  const supabase = await createClient();

  const { data: session, error: erreurSession } = await supabase.auth.getClaims();
  if (erreurSession) {
    if (isAuthRetryableFetchError(erreurSession)) {
      throw new Error(`Vérification de la session impossible (code ${erreurSession.status}).`);
    }
    return null;
  }
  const id = session?.claims?.sub;
  if (typeof id !== "string" || id === "") return null;

  const { data: profil, error } = await supabase
    .from("profils")
    .select("id, nom, role, actif, doit_changer_mdp")
    .eq("id", id)
    .abortSignal(AbortSignal.timeout(DELAI_MS))
    .maybeSingle();
  if (error) {
    throw new Error(`Lecture du profil impossible (code ${error.code || "inconnu"}).`);
  }
  if (!profil || profil.actif !== true) return null;
  if (typeof profil.nom !== "string" || !estUnRole(profil.role)) {
    throw new Error("Le profil lu n'a pas de nom ou de rôle reconnu.");
  }
  if (typeof profil.doit_changer_mdp !== "boolean") {
    throw new Error("Le profil lu ne dit pas si le mot de passe doit être changé.");
  }

  return { id, nom: profil.nom, role: profil.role, doitChangerMdp: profil.doit_changer_mdp };
});

/**
 * La personne connectée ; sinon, renvoi vers la connexion (I1). Tant que son
 * mot de passe temporaire n'est pas remplacé, renvoi vers I2. À appeler en
 * premier dans chaque page et chaque Server Function internes.
 */
export async function exigerUtilisateur(): Promise<UtilisateurConnecte> {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) redirect(ADRESSE_CONNEXION);
  if (utilisateur.doitChangerMdp) redirect(ADRESSE_NOUVEAU_MOT_DE_PASSE);
  return utilisateur;
}

/**
 * La personne connectée qui doit choisir son mot de passe (écran I2). Sans
 * session : renvoi vers la connexion ; mot de passe déjà choisi : renvoi
 * vers « Demandes ». À appeler en premier dans l'écran I2 et sa Server
 * Function.
 */
export async function exigerChangementMotDePasse(): Promise<UtilisateurConnecte> {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) redirect(ADRESSE_CONNEXION);
  if (!utilisateur.doitChangerMdp) redirect(ADRESSE_ACCUEIL_INTERNE);
  return utilisateur;
}

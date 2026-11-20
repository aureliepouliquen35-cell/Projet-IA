import "server-only";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { poserActivite } from "@/server/garde/activite";
import { journaliser } from "@/server/journal";
import { creerClientSecret } from "@/server/supabase-secret";

// Connexion à l'espace interne (AD-7, AD-8, AD-13).
//
// - Le blocage est vérifié **avant** d'appeler Supabase Auth, avec la clé
//   secrète (la personne n'est pas encore connectée) : 5 échecs d'affilée en
//   15 minutes bloquent, que l'email ait un compte ou non. Un essai pendant
//   le blocage n'est pas enregistré (il prolongerait le blocage).
// - Supabase Auth vérifie l'email et le mot de passe, avec la clé publique :
//   c'est lui qui ouvre la session (cookies).
// - Le profil est relu dans `profils` avec cette session (règle « sa propre
//   ligne ») : un compte sans profil ou inactif voit sa session refermée
//   aussitôt, et l'essai compte comme un échec (RM-10).
// - À la réussite, le cookie de dernière activité est posé (expiration après
//   8 h d'inactivité, `src/server/garde/activite.ts`).
//
// Les seules réponses sont « réussie » (ou « mot de passe à changer »),
// « refusée » et « bloquée » : un email inconnu, un mauvais mot de passe et un
// compte inactif donnent la même (AD-8). Jamais de mot de passe dans le
// journal ni dans une erreur.
//
// Le choix du mot de passe définitif (écran I2, `choisirMotDePasse`) est
// aussi ici : il compare le mot de passe proposé au temporaire avec la clé
// secrète (AD-6, AD-9).

/** Au-delà, on abandonne : la page de connexion ne reste pas bloquée. */
const DELAI_MS = 8000;

export type ResultatConnexion = "reussie" | "mot_de_passe_a_changer" | "refusee" | "bloquee";

/**
 * Codes de Supabase Auth qui veulent dire « ces identifiants ne permettent
 * pas d'entrer » : email inconnu ou mauvais mot de passe, compte bloqué dans
 * Auth (désactivation, AD-6). Toute autre erreur est une panne.
 */
const CODES_IDENTIFIANTS_REFUSES = new Set(["invalid_credentials", "user_banned"]);

type ClientSession = Awaited<ReturnType<typeof createClient>>;

async function estBloquee(email: string): Promise<boolean> {
  const { data, error } = await creerClientSecret()
    .rpc("connexion_bloquee", { p_email: email })
    .abortSignal(AbortSignal.timeout(DELAI_MS));
  if (error) {
    throw new Error(`La fonction connexion_bloquee a échoué (code ${error.code || "inconnu"}).`);
  }
  return data === true;
}

async function enregistrerTentative(email: string, reussite: boolean): Promise<void> {
  const { error } = await creerClientSecret()
    .rpc("enregistrer_tentative", { p_email: email, p_reussite: reussite })
    .abortSignal(AbortSignal.timeout(DELAI_MS));
  if (error) {
    throw new Error(`La fonction enregistrer_tentative a échoué (code ${error.code || "inconnu"}).`);
  }
}

/**
 * État du profil de ce compte (lu avec sa session) : `null` s'il n'existe pas
 * ou est inactif ; sinon, s'il doit encore changer son mot de passe.
 */
async function lireProfilActif(
  supabase: ClientSession,
  id: string,
): Promise<{ doitChangerMdp: boolean } | null> {
  const { data, error } = await supabase
    .from("profils")
    .select("actif, doit_changer_mdp")
    .eq("id", id)
    .abortSignal(AbortSignal.timeout(DELAI_MS))
    .maybeSingle();
  if (error) {
    throw new Error(`Lecture du profil impossible (code ${error.code || "inconnu"}).`);
  }
  if (data?.actif !== true) return null;
  // Valeur inattendue : le changement est imposé (la garde relira le profil).
  return { doitChangerMdp: data.doit_changer_mdp !== false };
}

/**
 * Ferme la session de ce navigateur seulement (`scope: "local"`). Les
 * cookies de session sont effacés même si Supabase Auth ne répond pas : ne
 * lève jamais.
 */
async function fermerSession(supabase: ClientSession): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      console.error("[connexion] fermeture de session signalée par Auth :", error.code ?? error.status);
    }
  } catch (cause) {
    console.error(
      "[connexion] fermeture de session impossible :",
      cause instanceof Error ? cause.message : cause,
    );
  }
}

/**
 * Essaie d'ouvrir une session avec ces identifiants, déjà vérifiés par le
 * schéma (`email` en minuscules).
 *
 * - `bloquee` : 5 échecs récents ; Supabase n'est pas appelé, rien n'est
 *   enregistré, `connexion_bloquee` au journal.
 * - `refusee` : email inconnu, mauvais mot de passe, compte inactif ou sans
 *   profil ; échec enregistré, `connexion_echouee` au journal, aucune
 *   session ouverte.
 * - `reussie` : session ouverte (cookies), réussite enregistrée, cookie
 *   d'activité posé, `connexion_reussie` au journal ;
 * - `mot_de_passe_a_changer` : comme `reussie`, pour un compte qui doit
 *   encore remplacer son mot de passe temporaire (écran I2).
 *
 * Toute autre erreur (base ou Auth injoignable…) est levée : l'enveloppe des
 * actions la journalise et répond `ERREUR_INTERNE`. Si elle survient après
 * l'ouverture de la session, la session est refermée d'abord.
 */
export async function connecter(email: string, motDePasse: string): Promise<ResultatConnexion> {
  if (await estBloquee(email)) {
    await journaliser("avertissement", "connexion_bloquee", { email });
    return "bloquee";
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });

  if (error) {
    if (!error.code || !CODES_IDENTIFIANTS_REFUSES.has(error.code)) {
      throw new Error(
        `Supabase Auth a refusé la connexion (code ${error.code ?? String(error.status ?? "inconnu")}).`,
      );
    }
    await enregistrerTentative(email, false);
    await journaliser("avertissement", "connexion_echouee", { email, motif: error.code });
    return "refusee";
  }

  const id = data.user.id;
  let doitChangerMdp: boolean;
  try {
    const profil = await lireProfilActif(supabase, id);
    if (!profil) {
      await fermerSession(supabase);
      await enregistrerTentative(email, false);
      await journaliser("avertissement", "connexion_echouee", {
        email,
        compte_id: id,
        motif: "compte_inactif",
      });
      return "refusee";
    }

    doitChangerMdp = profil.doitChangerMdp;
    await enregistrerTentative(email, true);
    poserActivite(await cookies());
  } catch (erreur) {
    // Pas de session ouverte sans réussite enregistrée, profil vérifié et
    // cookie d'activité posé.
    await fermerSession(supabase);
    throw erreur;
  }

  await journaliser("info", "connexion_reussie", { email, compte_id: id });
  return doitChangerMdp ? "mot_de_passe_a_changer" : "reussie";
}

/**
 * Ferme la session de ce navigateur (bouton « Se déconnecter », FR-9). Ne
 * lève jamais : les cookies de session sont effacés dans tous les cas.
 */
export async function deconnecter(): Promise<void> {
  await fermerSession(await createClient());
}

// ---------------------------------------------------------------------------
// Choix du mot de passe définitif (écran I2, FR-21, AD-6)
// ---------------------------------------------------------------------------

export type ResultatChoixMotDePasse = "enregistre" | "temporaire";

/** Vrai si c'est le mot de passe temporaire de ce compte (empreinte comparée par la base). */
async function estMotDePasseTemporaire(id: string, motDePasse: string): Promise<boolean> {
  const { data, error } = await creerClientSecret()
    .rpc("est_mot_de_passe_temporaire", { p_id: id, p_mdp: motDePasse })
    .abortSignal(AbortSignal.timeout(DELAI_MS));
  if (error) {
    throw new Error(
      `La fonction est_mot_de_passe_temporaire a échoué (code ${error.code || "inconnu"}).`,
    );
  }
  return data === true;
}

/**
 * Remplace le mot de passe temporaire du compte connecté `id` (déjà vérifié
 * par la garde) par `motDePasse` (déjà vérifié par le schéma : 12 caractères
 * au moins, 72 octets au plus).
 *
 * 1. Le mot de passe temporaire est refusé (`temporaire`) : Supabase Auth
 *    n'est pas appelé.
 * 2. Le mot de passe est changé dans Supabase Auth, avec la session de la
 *    personne. S'il y est déjà (`same_password` : envoi refait après une
 *    panne de l'étape 3), le changement est considéré comme fait.
 * 3. `terminer_changement_mdp` lève « doit changer son mot de passe » et
 *    efface l'empreinte du temporaire (`enregistre`).
 *
 * Toute autre erreur (base ou Auth injoignable…) est levée : l'enveloppe des
 * actions la journalise et répond `ERREUR_INTERNE`. Jamais de mot de passe
 * dans le journal ni dans une erreur.
 */
export async function choisirMotDePasse(
  id: string,
  motDePasse: string,
): Promise<ResultatChoixMotDePasse> {
  if (await estMotDePasseTemporaire(id, motDePasse)) return "temporaire";

  const supabase = await createClient();
  const { error: erreurAuth } = await supabase.auth.updateUser({ password: motDePasse });
  if (erreurAuth && erreurAuth.code !== "same_password") {
    throw new Error(
      `Supabase Auth a refusé le changement de mot de passe (code ${erreurAuth.code ?? String(erreurAuth.status ?? "inconnu")}).`,
    );
  }

  const { error } = await creerClientSecret()
    .rpc("terminer_changement_mdp", { p_id: id, p_mdp: motDePasse })
    .abortSignal(AbortSignal.timeout(DELAI_MS));
  if (error) {
    // Mot de passe temporaire remis entre-temps (réinitialisation) : même
    // réponse qu'à l'étape 1.
    if (error.code === "NV106") return "temporaire";
    throw new Error(
      `La fonction terminer_changement_mdp a échoué (code ${error.code || "inconnu"}).`,
    );
  }
  return "enregistre";
}

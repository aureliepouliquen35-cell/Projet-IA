import "server-only";

import { createClient } from "@/lib/supabase/server";
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
//
// Les seules réponses sont « réussie », « refusée » et « bloquée » : un
// email inconnu, un mauvais mot de passe et un compte inactif donnent la même
// (AD-8). Jamais de mot de passe dans le journal ni dans une erreur.

/** Au-delà, on abandonne : la page de connexion ne reste pas bloquée. */
const DELAI_MS = 8000;

export type ResultatConnexion = "reussie" | "refusee" | "bloquee";

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

/** Vrai si le profil de ce compte existe et est actif (lu avec sa session). */
async function profilActif(supabase: ClientSession, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("profils")
    .select("actif")
    .eq("id", id)
    .abortSignal(AbortSignal.timeout(DELAI_MS))
    .maybeSingle();
  if (error) {
    throw new Error(`Lecture du profil impossible (code ${error.code || "inconnu"}).`);
  }
  return data?.actif === true;
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
 * - `reussie` : session ouverte (cookies), réussite enregistrée,
 *   `connexion_reussie` au journal.
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
  try {
    if (!(await profilActif(supabase, id))) {
      await fermerSession(supabase);
      await enregistrerTentative(email, false);
      await journaliser("avertissement", "connexion_echouee", {
        email,
        compte_id: id,
        motif: "compte_inactif",
      });
      return "refusee";
    }

    await enregistrerTentative(email, true);
  } catch (erreur) {
    // Pas de session ouverte sans réussite enregistrée ni profil vérifié.
    await fermerSession(supabase);
    throw erreur;
  }

  await journaliser("info", "connexion_reussie", { email, compte_id: id });
  return "reussie";
}

/**
 * Ferme la session de ce navigateur (bouton « Se déconnecter », FR-9). Ne
 * lève jamais : les cookies de session sont effacés dans tous les cas.
 */
export async function deconnecter(): Promise<void> {
  await fermerSession(await createClient());
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { activiteValide, COOKIE_ACTIVITE, optionsActivite, poserActivite } from "@/server/garde/activite";
import {
  COOKIE_MESSAGE_CONNEXION,
  optionsMessageConnexion,
  valeurSessionExpiree,
  valeurSessionTerminee,
} from "@/server/passage";
import {
  ADRESSE_ACCUEIL_INTERNE,
  ADRESSE_CONNEXION,
  ADRESSE_NOUVEAU_MOT_DE_PASSE,
  COOKIE_ROLE,
  estPageNouveauMotDePasse,
  estPageProtegee,
} from "@/shared/acces";
import { ROLES, type Role } from "@/shared/constantes";

/**
 * Pages internes : jamais gardées en cache, ni par le navigateur (bouton
 * Retour après la déconnexion, FR-9) ni par un intermédiaire.
 */
export const CACHE_PAGES_INTERNES = "private, no-cache, no-store, max-age=0, must-revalidate";

/** Au-delà, la lecture du profil est abandonnée : la garde de la page décidera. */
const DELAI_MS = 8000;

/**
 * Cookie `nova_role` (story 3.3) : lisible par la page (pas `httpOnly`), pour
 * tout le site, `sameSite: lax`, `secure` hors développement ; il dure le
 * temps du navigateur ouvert.
 */
export const OPTIONS_COOKIE_ROLE = {
  httpOnly: false,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV !== "development",
  path: "/",
};

// Garde de chaque requête (AD-7). Pour toutes les pages, il rafraîchit la
// session Supabase (cookies d'auth) avant chaque rendu. Pour les pages
// protégées (pages internes et écran I2) :
// - sans session : renvoi vers la connexion (I1, FR-10) ;
// - plus de 8 h sans activité (cookie d'activité trop ancien, absent ou
//   falsifié) : session fermée, renvoi vers I1 avec le message « session
//   expirée » (cookie de `src/server/passage`, AD-20) ;
// - compte désactivé pendant la session (`profils.actif` faux, FR-22) :
//   session fermée, renvoi vers I1 avec le message « session terminée »
//   (story 3.4). De même si le renouvellement de la session est refusé
//   parce que le compte est bloqué dans Auth (`user_banned`) ;
// - mot de passe temporaire à remplacer (`profils.doit_changer_mdp`) : renvoi
//   vers I2 ; I2 sans changement à faire : renvoi vers « Demandes ». Si le
//   profil ne peut pas être lu, la requête passe : la garde décide ;
// - sinon : cookie d'activité renouvelé, et cookie `nova_role` posé avec le
//   rôle lu dans le profil (story 3.3) ;
// - jamais de mise en cache.
//
// Une Server Function (requête `POST` avec l'en-tête `next-action`) n'est
// jamais renvoyée ailleurs par HTTP : sa garde (`exigerUtilisateur`,
// `exigerChangementMotDePasse`) renvoie elle-même vers la bonne page (et
// ferme la session d'un compte désactivé). Une session expirée y est quand
// même fermée.
//
// Le rôle ne sert ici qu'à un signal d'affichage : le cookie `nova_role`,
// lisible par la page, que le menu latéral compare au rôle avec lequel il a
// été rendu, pour se recharger quand il a changé (administrateur rétrogradé,
// FR-22). Le proxy ne refuse ni ne renvoie rien selon le rôle : il est relu
// par la garde de la page et des Server Functions (`src/server/garde`), et
// par la base, qui restent la vraie protection. Pas de cookie pour une
// Server Function (le profil n'y est pas lu).
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Ne rien insérer entre la création du client et cet appel :
  // il déclenche le rafraîchissement du jeton si nécessaire.
  const { data, error: erreurSession } = await supabase.auth.getClaims();

  const chemin = request.nextUrl.pathname;
  if (!estPageProtegee(chemin)) return response;

  const estAction = request.method === "POST" && request.headers.has("next-action");

  /** Laisse passer la requête, sans mise en cache. */
  const passer = () => {
    response.headers.set("Cache-Control", CACHE_PAGES_INTERNES);
    return response;
  };

  /** Renvoie vers `chemin`, en gardant les cookies posés ou effacés jusqu'ici. */
  const renvoyer = (destination: string) => {
    const adresse = request.nextUrl.clone();
    adresse.pathname = destination;
    adresse.search = "";
    const renvoi = NextResponse.redirect(adresse);
    response.cookies.getAll().forEach((cookie) => renvoi.cookies.set(cookie));
    renvoi.headers.set("Cache-Control", CACHE_PAGES_INTERNES);
    return renvoi;
  };

  /**
   * Compte désactivé pendant la session : même fin que l'expiration, avec
   * un message neutre qui ne dit pas pourquoi (« session terminée »).
   */
  const terminerSession = async () => {
    await fermerSession();
    response.cookies.set(COOKIE_ACTIVITE, "", { ...optionsActivite(), maxAge: 0 });
    response.cookies.set(COOKIE_ROLE, "", { ...OPTIONS_COOKIE_ROLE, maxAge: 0 });
    response.cookies.set(COOKIE_MESSAGE_CONNEXION, valeurSessionTerminee(), optionsMessageConnexion());
    return renvoyer(ADRESSE_CONNEXION);
  };

  const id = data?.claims?.sub;
  if (typeof id !== "string" || id === "") {
    if (estAction) return passer();
    // Jeton d'accès expiré d'un compte bloqué dans Auth (désactivé) : le
    // renouvellement est refusé, sans profil lisible. Code `user_banned`
    // attendu d'après Supabase Auth, pas observé en vrai.
    if (erreurSession?.code === "user_banned") return terminerSession();
    return renvoyer(ADRESSE_CONNEXION);
  }

  if (!activiteValide(request.cookies.get(COOKIE_ACTIVITE)?.value)) {
    await fermerSession();
    response.cookies.set(COOKIE_ACTIVITE, "", { ...optionsActivite(), maxAge: 0 });
    response.cookies.set(COOKIE_ROLE, "", { ...OPTIONS_COOKIE_ROLE, maxAge: 0 });
    response.cookies.set(COOKIE_MESSAGE_CONNEXION, valeurSessionExpiree(), optionsMessageConnexion());
    return estAction ? passer() : renvoyer(ADRESSE_CONNEXION);
  }

  let destination: string | null = null;
  let role: Role | null = null;
  if (!estAction) {
    const profil = await lireProfil(id);
    role = profil?.role ?? null;
    if (profil?.actif === false) return terminerSession();
    const doitChangerMdp = profil?.doitChangerMdp ?? null;
    if (doitChangerMdp === true && !estPageNouveauMotDePasse(chemin)) {
      destination = ADRESSE_NOUVEAU_MOT_DE_PASSE;
    } else if (doitChangerMdp === false && estPageNouveauMotDePasse(chemin)) {
      destination = ADRESSE_ACCUEIL_INTERNE;
    }
  }

  // Après tous les appels à Supabase : `setAll` remplace `response`.
  poserActivite(response.cookies);
  // Signal d'affichage du menu : jamais une protection (voir plus haut).
  if (role) response.cookies.set(COOKIE_ROLE, role, OPTIONS_COOKIE_ROLE);
  return destination ? renvoyer(destination) : passer();

  /**
   * `profils.actif`, `profils.doit_changer_mdp` et `profils.role`, lus avec
   * la session (sa propre ligne, même désactivée) ; `null` si le profil
   * n'existe pas, n'est pas lisible ou ne répond pas, et pour une valeur
   * inattendue (la garde décidera).
   */
  async function lireProfil(
    idCompte: string,
  ): Promise<{ actif: boolean | null; doitChangerMdp: boolean | null; role: Role | null } | null> {
    try {
      const { data: profil, error } = await supabase
        .from("profils")
        .select("actif, doit_changer_mdp, role")
        .eq("id", idCompte)
        .abortSignal(AbortSignal.timeout(DELAI_MS))
        .maybeSingle();
      if (error || !profil) return null;
      return {
        actif: typeof profil.actif === "boolean" ? profil.actif : null,
        doitChangerMdp: typeof profil.doit_changer_mdp === "boolean" ? profil.doit_changer_mdp : null,
        role: (ROLES as readonly unknown[]).includes(profil.role) ? (profil.role as Role) : null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Ferme la session de ce navigateur (`scope: "local"`). Les cookies de
   * session sont effacés même si Supabase Auth ne répond pas, pour la
   * réponse comme pour la suite de la requête (la garde d'une Server
   * Function ne voit plus de session).
   */
  async function fermerSession(): Promise<void> {
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        console.error("[proxy] fermeture de session signalée par Auth :", error.code ?? error.status);
      }
    } catch (cause) {
      console.error(
        "[proxy] fermeture de session impossible :",
        cause instanceof Error ? cause.message : cause,
      );
    }

    const restants = request.cookies
      .getAll()
      .filter(({ name, value }) => name.startsWith("sb-") && name.includes("-auth-token") && value !== "");
    if (restants.length === 0) return;

    restants.forEach(({ name }) => request.cookies.delete(name));
    const precedente = response;
    response = NextResponse.next({ request });
    precedente.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    restants.forEach(({ name }) => response.cookies.set(name, "", { path: "/", maxAge: 0 }));
  }
}

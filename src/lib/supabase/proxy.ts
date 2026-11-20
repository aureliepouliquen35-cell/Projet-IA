import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { activiteValide, COOKIE_ACTIVITE, optionsActivite, poserActivite } from "@/server/garde/activite";
import {
  COOKIE_MESSAGE_CONNEXION,
  optionsMessageConnexion,
  valeurSessionExpiree,
} from "@/server/passage";
import {
  ADRESSE_ACCUEIL_INTERNE,
  ADRESSE_CONNEXION,
  ADRESSE_NOUVEAU_MOT_DE_PASSE,
  estPageNouveauMotDePasse,
  estPageProtegee,
} from "@/shared/acces";

/**
 * Pages internes : jamais gardées en cache, ni par le navigateur (bouton
 * Retour après la déconnexion, FR-9) ni par un intermédiaire.
 */
export const CACHE_PAGES_INTERNES = "private, no-cache, no-store, max-age=0, must-revalidate";

/** Au-delà, la lecture du profil est abandonnée : la garde de la page décidera. */
const DELAI_MS = 8000;

// Garde de chaque requête (AD-7). Pour toutes les pages, il rafraîchit la
// session Supabase (cookies d'auth) avant chaque rendu. Pour les pages
// protégées (pages internes et écran I2) :
// - sans session : renvoi vers la connexion (I1, FR-10) ;
// - plus de 8 h sans activité (cookie d'activité trop ancien, absent ou
//   falsifié) : session fermée, renvoi vers I1 avec le message « session
//   expirée » (cookie de `src/server/passage`, AD-20) ;
// - mot de passe temporaire à remplacer (`profils.doit_changer_mdp`) : renvoi
//   vers I2 ; I2 sans changement à faire : renvoi vers « Demandes ». Si le
//   profil ne peut pas être lu, la requête passe : la garde décide ;
// - sinon : cookie d'activité renouvelé ;
// - jamais de mise en cache.
//
// Une Server Function (requête `POST` avec l'en-tête `next-action`) n'est
// jamais renvoyée ailleurs par HTTP : sa garde (`exigerUtilisateur`,
// `exigerChangementMotDePasse`) renvoie elle-même vers la bonne page. Une
// session expirée y est quand même fermée.
//
// Le proxy ne regarde pas le reste du profil (actif, rôle) : il est relu par
// la garde de la page (`src/server/garde`), qui reste la vraie protection.
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
  const { data } = await supabase.auth.getClaims();

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

  const id = data?.claims?.sub;
  if (typeof id !== "string" || id === "") {
    return estAction ? passer() : renvoyer(ADRESSE_CONNEXION);
  }

  if (!activiteValide(request.cookies.get(COOKIE_ACTIVITE)?.value)) {
    await fermerSession();
    response.cookies.set(COOKIE_ACTIVITE, "", { ...optionsActivite(), maxAge: 0 });
    response.cookies.set(COOKIE_MESSAGE_CONNEXION, valeurSessionExpiree(), optionsMessageConnexion());
    return estAction ? passer() : renvoyer(ADRESSE_CONNEXION);
  }

  let destination: string | null = null;
  if (!estAction) {
    const doitChangerMdp = await lireDoitChangerMdp(id);
    if (doitChangerMdp === true && !estPageNouveauMotDePasse(chemin)) {
      destination = ADRESSE_NOUVEAU_MOT_DE_PASSE;
    } else if (doitChangerMdp === false && estPageNouveauMotDePasse(chemin)) {
      destination = ADRESSE_ACCUEIL_INTERNE;
    }
  }

  // Après tous les appels à Supabase : `setAll` remplace `response`.
  poserActivite(response.cookies);
  return destination ? renvoyer(destination) : passer();

  /**
   * `profils.doit_changer_mdp`, lu avec la session ; `null` si le profil
   * n'existe pas, n'est pas lisible ou ne répond pas (la garde décidera).
   */
  async function lireDoitChangerMdp(idCompte: string): Promise<boolean | null> {
    try {
      const { data: profil, error } = await supabase
        .from("profils")
        .select("doit_changer_mdp")
        .eq("id", idCompte)
        .abortSignal(AbortSignal.timeout(DELAI_MS))
        .maybeSingle();
      if (error || !profil || typeof profil.doit_changer_mdp !== "boolean") return null;
      return profil.doit_changer_mdp;
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

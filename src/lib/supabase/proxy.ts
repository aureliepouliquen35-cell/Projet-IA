import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { ADRESSE_CONNEXION, estPageInterne } from "@/shared/acces";

/**
 * Pages internes : jamais gardées en cache, ni par le navigateur (bouton
 * Retour après la déconnexion, FR-9) ni par un intermédiaire.
 */
export const CACHE_PAGES_INTERNES = "private, no-cache, no-store, max-age=0, must-revalidate";

// Garde de chaque requête (AD-7) :
// - rafraîchit la session Supabase (cookies d'auth) avant chaque rendu ;
// - renvoie vers la connexion (I1) toute page interne demandée sans
//   session (FR-10) ;
// - interdit la mise en cache des pages internes.
//
// Le proxy ne regarde que la présence d'une session valide : le profil
// (actif, rôle) est relu par la garde de la page (`src/server/garde`).
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

  if (!estPageInterne(request.nextUrl.pathname)) return response;

  const connecte = typeof data?.claims?.sub === "string" && data.claims.sub !== "";
  if (!connecte) {
    const adresse = request.nextUrl.clone();
    adresse.pathname = ADRESSE_CONNEXION;
    adresse.search = "";
    const renvoi = NextResponse.redirect(adresse);
    // Garder les cookies que le rafraîchissement vient de poser ou d'effacer.
    response.cookies.getAll().forEach((cookie) => renvoi.cookies.set(cookie));
    renvoi.headers.set("Cache-Control", CACHE_PAGES_INTERNES);
    return renvoi;
  }

  response.headers.set("Cache-Control", CACHE_PAGES_INTERNES);
  return response;
}

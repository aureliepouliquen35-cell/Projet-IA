import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client Supabase pour les Server Components, Server Functions et Route Handlers.
// Créer un nouveau client à chaque requête : ne jamais le partager.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Appelé depuis un Server Component : l'écriture de cookies y est
            // impossible. Sans conséquence, car proxy.ts rafraîchit la session.
          }
        },
      },
    },
  );
}

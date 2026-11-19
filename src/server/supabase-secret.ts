import "server-only";

import { createClient } from "@supabase/supabase-js";

// Seul client Supabase avec la clé secrète (AD-9). Elle donne tous les droits
// sur la base : ce fichier ne doit jamais atteindre le navigateur
// (`server-only` fait échouer la compilation sinon).
//
// Il ne doit être importé que par les modules autorisés : `src/server/admin`,
// `src/server/depot`, `src/server/connexion` et `src/server/journal`
// (règle ESLint d'`eslint.config.mjs` : `npm run lint` signale tout autre import,
// et toute lecture de la variable ailleurs que dans ce fichier).
//
// Aucune session : ce client n'agit jamais au nom d'un utilisateur connecté.
export function creerClientSecret() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cleSecrete = process.env.SUPABASE_SECRET_KEY;
  if (!url || !cleSecrete) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY manquante (voir .env.example).",
    );
  }

  return createClient(url, cleSecrete, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

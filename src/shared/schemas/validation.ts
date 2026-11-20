import type { z } from "zod";

import type { ErreursChamps } from "@/shared/reponse";

export type Validation<T> = { ok: true; donnees: T } | { ok: false; champs: ErreursChamps };

/**
 * Vérifie une saisie avec un schéma d'objet. Tout ce qui n'est pas un objet
 * est lu comme un formulaire vierge. En cas d'erreur : un seul message par
 * champ (le premier), dans l'ordre de `champs` (l'ordre de l'écran).
 */
export function validerSaisie<S extends z.ZodType>(
  schema: S,
  champs: readonly string[],
  saisie: unknown,
): Validation<z.infer<S>> {
  const estUnObjet = typeof saisie === "object" && saisie !== null && !Array.isArray(saisie);
  const resultat = schema.safeParse(estUnObjet ? saisie : {});
  if (resultat.success) return { ok: true, donnees: resultat.data };

  const premiers: ErreursChamps = {};
  for (const probleme of resultat.error.issues) {
    const champ = probleme.path[0];
    if (typeof champ === "string" && champs.includes(champ) && !(champ in premiers)) {
      premiers[champ] = probleme.message;
    }
  }

  const erreurs: ErreursChamps = {};
  for (const champ of champs) {
    if (premiers[champ]) erreurs[champ] = premiers[champ];
  }
  return { ok: false, champs: erreurs };
}

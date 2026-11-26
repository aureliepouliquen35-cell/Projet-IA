import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { exigerAdministrateur } from "@/server/garde";
import { DELAI_MS, lire, reponseInattendue, type ResultatLecture } from "@/server/lectures/demandes";
import { FORME_IDENTIFIANT } from "@/shared/schemas/depot";

// Lecture de l'écran A2 « Catégories » (story 4.1, FR-26, RM-7). Appelée
// par un Server Component, jamais depuis le navigateur.
//
// - Elle commence par `exigerAdministrateur()` (AD-7) : sans session, renvoi
//   vers la connexion ; un collaborateur reçoit `accesRefuse`, sans aucun
//   appel à la base.
// - Elle passe par la fonction SQL `lister_categories_administration` avec
//   la session de la personne (rôle `authenticated`), qui vérifie elle-même
//   que l'appelant est un administrateur actif (refus NV202, AD-9) : aucune
//   table n'est lisible directement. Un refus NV202 (rôle retiré
//   entre-temps) donne aussi `accesRefuse`.
// - La réponse est contrôlée (Zod).
// - Une panne (base injoignable, réponse inattendue) n'est pas levée : elle
//   est journalisée avec un code court (AD-12, AD-13), et la lecture renvoie
//   `{ ok: false }` ; l'écran affiche alors son état d'erreur.
// - Une seule lecture par requête (`cache` de React).
//
// `lister_categories` (filtre de I3) et le formulaire public ne changent
// pas : ils relisent les catégories à chaque visite.

/** Une ligne de la liste A2. */
export type CategorieAdministration = {
  id: string;
  nom: string;
  /** Faux : catégorie désactivée (badge *Désactivée*, story 4.2). */
  active: boolean;
  /** Nombre de demandes qui utilisent la catégorie. */
  nombreDemandes: number;
};

/** Résultat de la lecture : les catégories, une panne déjà journalisée, ou un refus. */
export type LectureCategories = ResultatLecture<CategorieAdministration[]> | { ok: false; accesRefuse: true };

/** Refus de la base : l'appelant n'est pas un administrateur actif. */
const CODE_REFUS_ADMINISTRATEUR = "NV202";

const ACCES_REFUSE = { ok: false, accesRefuse: true } as const;

const schemaCategories = z.array(
  z.object({
    id: z.string().regex(FORME_IDENTIFIANT),
    nom: z.string(),
    active: z.boolean(),
    nombre_demandes: z.number().int().nonnegative(),
  }),
);

/**
 * Toutes les catégories, désactivées comprises, dans l'ordre d'affichage
 * (la base les trie), avec leur nombre de demandes.
 */
export const lireCategoriesAdministration = cache(async (): Promise<LectureCategories> => {
  if (!(await exigerAdministrateur())) return ACCES_REFUSE;

  const lecture = await lire(
    "lister_categories_administration",
    async (): Promise<CategorieAdministration[] | null> => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .rpc("lister_categories_administration")
        .abortSignal(AbortSignal.timeout(DELAI_MS));
      if (error?.code === CODE_REFUS_ADMINISTRATEUR) return null;
      if (error) {
        throw new Error(`La fonction lister_categories_administration a échoué (code ${error.code || "inconnu"}).`);
      }

      const resultat = schemaCategories.safeParse(data);
      if (!resultat.success) throw reponseInattendue("lister_categories_administration", resultat.error);
      return resultat.data.map(({ id, nom, active, nombre_demandes }) => ({
        id: id.toLowerCase(),
        nom,
        active,
        nombreDemandes: nombre_demandes,
      }));
    },
  );

  if (!lecture.ok) return lecture;
  if (lecture.donnees === null) return ACCES_REFUSE;
  return { ok: true, donnees: lecture.donnees };
});

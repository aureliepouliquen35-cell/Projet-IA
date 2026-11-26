import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { exigerAdministrateur } from "@/server/garde";
import { DELAI_MS, lire, reponseInattendue, type ResultatLecture } from "@/server/lectures/demandes";

// Lecture de l'écran A3 « Informations générales » (story 4.3, FR-31,
// RM-7). Appelée par un Server Component, jamais depuis le navigateur.
//
// - Elle commence par `exigerAdministrateur()` (AD-7) : sans session, renvoi
//   vers la connexion ; un collaborateur reçoit `accesRefuse`, sans aucun
//   appel à la base.
// - Elle passe par la fonction SQL `lire_parametres_administration` avec la
//   session de la personne (rôle `authenticated`), qui vérifie elle-même
//   que l'appelant est un administrateur actif (refus NV202, AD-9) : la
//   table `parametres` n'est pas lisible directement. Un refus NV202 (rôle
//   retiré entre-temps) donne aussi `accesRefuse`.
// - La réponse est contrôlée (Zod).
// - Une panne (base injoignable, ligne absente NV104, réponse inattendue)
//   n'est pas levée : elle est journalisée avec un code court (AD-12,
//   AD-13), et la lecture renvoie `{ ok: false }` ; l'écran affiche alors
//   « Impossible de charger les informations. » avec « Réessayer ».
// - Une seule lecture par requête (`cache` de React).
//
// Le formulaire public P1 et la confirmation P2 ne changent pas : ils
// relisent `parametres` à chaque visite (`src/server/depot`).

/** Les trois informations, telles que les champs de A3 les affichent. */
export type InformationsGenerales = {
  /** `null` : pas de téléphone, P1 et P2 montrent l'email de contact. */
  telephone: string | null;
  emailContact: string;
  contactDonnees: string;
};

/** Résultat de la lecture : les informations, une panne déjà journalisée, ou un refus. */
export type LectureInformations = ResultatLecture<InformationsGenerales> | { ok: false; accesRefuse: true };

/** Refus de la base : l'appelant n'est pas un administrateur actif. */
const CODE_REFUS_ADMINISTRATEUR = "NV202";

const ACCES_REFUSE = { ok: false, accesRefuse: true } as const;

const schemaInformations = z.object({
  telephone: z.string().nullable(),
  email_contact: z.string(),
  contact_donnees: z.string(),
});

/** Le téléphone, l'email de contact et le contact pour les données personnelles. */
export const lireInformationsGenerales = cache(async (): Promise<LectureInformations> => {
  if (!(await exigerAdministrateur())) return ACCES_REFUSE;

  const lecture = await lire(
    "lire_parametres_administration",
    async (): Promise<InformationsGenerales | null> => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .rpc("lire_parametres_administration")
        .abortSignal(AbortSignal.timeout(DELAI_MS));
      if (error?.code === CODE_REFUS_ADMINISTRATEUR) return null;
      if (error) {
        throw new Error(`La fonction lire_parametres_administration a échoué (code ${error.code || "inconnu"}).`);
      }

      const resultat = schemaInformations.safeParse(data);
      if (!resultat.success) throw reponseInattendue("lire_parametres_administration", resultat.error);
      const { telephone, email_contact, contact_donnees } = resultat.data;
      return { telephone, emailContact: email_contact, contactDonnees: contact_donnees };
    },
  );

  if (!lecture.ok) return lecture;
  if (lecture.donnees === null) return ACCES_REFUSE;
  return { ok: true, donnees: lecture.donnees };
});

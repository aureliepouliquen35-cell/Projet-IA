import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { exigerAdministrateur } from "@/server/garde";
import { DELAI_MS, lire, reponseInattendue, type ResultatLecture } from "@/server/lectures/demandes";
import { ROLES, type Role } from "@/shared/constantes";
import { FORME_IDENTIFIANT } from "@/shared/schemas/depot";

// Lecture de l'écran A1 « Comptes » (story 3.1, FR-24, RM-7). Appelée par
// un Server Component, jamais depuis le navigateur.
//
// - Elle commence par `exigerAdministrateur()` (AD-7) : sans session, renvoi
//   vers la connexion ; un collaborateur reçoit `accesRefuse`, sans aucun
//   appel à la base.
// - Elle passe par la fonction SQL `lister_comptes` avec la session de la
//   personne (rôle `authenticated`), qui vérifie elle-même que l'appelant est
//   un administrateur actif (refus NV202, AD-9) : aucune table n'est lisible
//   directement. Un refus NV202 (rôle retiré entre-temps) donne aussi
//   `accesRefuse`.
// - La réponse est contrôlée (Zod) : seuls l'identifiant, le nom, l'email,
//   le rôle et l'état sont gardés. Jamais de mot de passe ni d'empreinte.
// - Une panne (base injoignable, réponse inattendue) n'est pas levée : elle
//   est journalisée avec un code court, sans nom ni email (AD-12, AD-13), et
//   la lecture renvoie `{ ok: false }` ; l'écran affiche alors son état
//   d'erreur.
// - Une seule lecture par requête (`cache` de React).

/** Une ligne du tableau A1. */
export type CompteAdministration = {
  id: string;
  nom: string;
  email: string;
  role: Role;
  /** Faux : compte désactivé (badge *Désactivé*). */
  actif: boolean;
};

/** Résultat de la lecture : les comptes, une panne déjà journalisée, ou un refus. */
export type LectureComptes = ResultatLecture<CompteAdministration[]> | { ok: false; accesRefuse: true };

/** Refus de la base : l'appelant n'est pas un administrateur actif. */
const CODE_REFUS_ADMINISTRATEUR = "NV202";

const ACCES_REFUSE = { ok: false, accesRefuse: true } as const;

const schemaComptes = z.array(
  z.object({
    id: z.string().regex(FORME_IDENTIFIANT),
    nom: z.string(),
    email: z.string(),
    role: z.enum(ROLES),
    actif: z.boolean(),
  }),
);

/**
 * Tous les comptes internes, désactivés compris, triés par nom puis par
 * email (la base les trie).
 */
export const lireComptes = cache(async (): Promise<LectureComptes> => {
  if (!(await exigerAdministrateur())) return ACCES_REFUSE;

  const lecture = await lire("lister_comptes", async (): Promise<CompteAdministration[] | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("lister_comptes")
      .abortSignal(AbortSignal.timeout(DELAI_MS));
    if (error?.code === CODE_REFUS_ADMINISTRATEUR) return null;
    if (error) {
      throw new Error(`La fonction lister_comptes a échoué (code ${error.code || "inconnu"}).`);
    }

    const resultat = schemaComptes.safeParse(data);
    if (!resultat.success) throw reponseInattendue("lister_comptes", resultat.error);
    return resultat.data.map(({ id, nom, email, role, actif }) => ({ id: id.toLowerCase(), nom, email, role, actif }));
  });

  if (!lecture.ok) return lecture;
  if (lecture.donnees === null) return ACCES_REFUSE;
  return { ok: true, donnees: lecture.donnees };
});

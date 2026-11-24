import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { exigerUtilisateur } from "@/server/garde";
import { DELAI_MS, reponseInattendue } from "@/server/lectures/demandes";
import { FORME_IDENTIFIANT } from "@/shared/schemas/depot";

// Lecture de l'écran I5 « Nouvelle demande » (AD-1) : ce que le formulaire
// affiche. Appelée par un Server Component, jamais depuis le navigateur.
//
// - Elle commence par `exigerUtilisateur()` (AD-7) : sans session, ou avec
//   un compte inactif, renvoi vers la connexion.
// - Elle passe par la fonction SQL `lire_formulaire_saisie` avec la session
//   de la personne (rôle `authenticated`), jamais avec la clé secrète
//   (AD-9). La réponse est contrôlée (Zod).
// - Une panne (base injoignable, refus, réponse inattendue) est **levée** :
//   la page affiche l'écran S3 et `onRequestError` la journalise avec son
//   code. Les messages écrits ici ne contiennent que des codes et des noms
//   de champs (AD-12, AD-13).
// - Une seule lecture par requête (`cache` de React).

export type CategorieSaisie = { id: string; nom: string };

export type DonneesFormulaireSaisie = {
  /** Catégories actives, dans l'ordre d'affichage. */
  categories: CategorieSaisie[];
  /** Contact pour les données personnelles (mention de P1, « Texte à lui lire »). */
  contactDonnees: string;
};

const schemaFormulaire = z.object({
  categories: z.array(z.object({ id: z.string().regex(FORME_IDENTIFIANT), nom: z.string() })),
  contact_donnees: z.string().trim().min(1),
});

/** Catégories actives et contact données, pour le formulaire I5 (FR-30, FR-5). */
export const lireFormulaireSaisie = cache(async (): Promise<DonneesFormulaireSaisie> => {
  await exigerUtilisateur();

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("lire_formulaire_saisie")
    .abortSignal(AbortSignal.timeout(DELAI_MS));
  if (error) {
    throw new Error(`La fonction lire_formulaire_saisie a échoué (code ${error.code || "inconnu"}).`);
  }

  const resultat = schemaFormulaire.safeParse(data);
  if (!resultat.success) throw reponseInattendue("lire_formulaire_saisie", resultat.error);

  return {
    categories: resultat.data.categories.map(({ id, nom }) => ({ id: id.toLowerCase(), nom })),
    contactDonnees: resultat.data.contact_donnees,
  };
});

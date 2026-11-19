import "server-only";

import { creerClientSecret } from "@/server/supabase-secret";
import { FORME_REFERENCE } from "@/shared/constantes";
import { MESSAGES_DEPOT } from "@/shared/messages";
import type { ErreursChamps } from "@/shared/reponse";
import type { DonneesDepot } from "@/shared/schemas/depot";

// Dépôt public (AD-9) : le demandeur n'a pas de compte, et le rôle public de
// la base n'a aucun droit. Ce module agit donc avec la clé secrète, et
// seulement pour deux choses : lire de quoi afficher le formulaire, et créer
// une demande par la fonction SQL `deposer_demande` (AD-2) — jamais d'écriture
// directe dans une table.

export type CategorieProposee = { id: string; nom: string };

export type DonneesFormulaireDepot = {
  /** Catégories actives, dans l'ordre d'affichage. */
  categories: CategorieProposee[];
  /** Contact pour les données personnelles (mention du formulaire, FR-5). */
  contactDonnees: string;
};

/** Au-delà, on abandonne : la page ou l'envoi ne restent pas bloqués. */
const DELAI_LECTURE_MS = 8000;
const DELAI_ENVOI_MS = 10000;

/**
 * Lit ce que le formulaire de dépôt affiche : les catégories actives et le
 * contact pour les données personnelles.
 *
 * Lève une erreur si la base ne répond pas ou refuse : la page affiche alors
 * l'écran S3. Le message ne contient que le code renvoyé par la base.
 */
export async function lireFormulaireDepot(): Promise<DonneesFormulaireDepot> {
  const client = creerClientSecret();
  const [categories, parametres] = await Promise.all([
    client
      .from("categories")
      .select("id, nom")
      .eq("active", true)
      .order("ordre", { ascending: true })
      .abortSignal(AbortSignal.timeout(DELAI_LECTURE_MS)),
    client
      .from("parametres")
      .select("contact_donnees")
      .limit(1)
      .abortSignal(AbortSignal.timeout(DELAI_LECTURE_MS)),
  ]);

  if (categories.error) {
    throw new Error(
      `Lecture des catégories impossible (code ${categories.error.code || "inconnu"}).`,
    );
  }
  if (parametres.error) {
    throw new Error(
      `Lecture des paramètres impossible (code ${parametres.error.code || "inconnu"}).`,
    );
  }

  const contactDonnees = parametres.data?.[0]?.contact_donnees;
  if (typeof contactDonnees !== "string" || contactDonnees === "") {
    throw new Error("La table parametres ne contient pas le contact données.");
  }

  return {
    categories: (categories.data ?? []).map(({ id, nom }) => ({
      id: String(id),
      nom: String(nom),
    })),
    contactDonnees,
  };
}

/** Refus prévus de `deposer_demande` (codes SQL propres à l'application). */
const REFUS_PREVUS = new Map<string, ErreursChamps>([
  // Case d'information non cochée (RM-12).
  ["NV001", { personneInformee: MESSAGES_DEPOT.caseObligatoire }],
  // Catégorie inconnue, ou désactivée depuis l'affichage du formulaire.
  ["NV002", { categorieId: MESSAGES_DEPOT.categorieIndisponible }],
]);

/**
 * Codes des refus prévus : ceux que `deposer_demande` lève (`errcode`), en
 * majuscules comme dans la migration. Un test compare les deux listes.
 */
export const CODES_REFUS_PREVUS: readonly string[] = [...REFUS_PREVUS.keys()];

export type ResultatDepot =
  | { ok: true; reference: string }
  | { ok: false; champs: ErreursChamps };

/**
 * Enregistre une demande déjà vérifiée, par la fonction SQL
 * `deposer_demande` : c'est la base qui attribue la référence, le statut
 * « nouvelle », la priorité « normale », le canal « formulaire », et qui écrit
 * l'événement « Demande créée » (AD-2, AD-4).
 *
 * Un refus prévu de la base revient comme une erreur de saisie. Tout autre
 * refus, ou une base qui ne répond pas, lève une erreur : l'enveloppe des
 * actions la journalise et répond `ERREUR_INTERNE`. Son message ne contient
 * que le code renvoyé par la base, jamais ce que le demandeur a saisi.
 */
export async function deposerDemande(donnees: DonneesDepot): Promise<ResultatDepot> {
  const { data, error } = await creerClientSecret()
    .rpc("deposer_demande", {
      p_nom: donnees.nom,
      p_email: donnees.email,
      p_telephone: donnees.telephone,
      p_entreprise: donnees.entreprise,
      p_categorie_id: donnees.categorieId,
      p_objet: donnees.objet,
      p_description: donnees.description,
      p_personne_informee: donnees.personneInformee,
    })
    .abortSignal(AbortSignal.timeout(DELAI_ENVOI_MS));

  if (error) {
    const champs = REFUS_PREVUS.get(error.code);
    if (champs) return { ok: false, champs: { ...champs } };
    throw new Error(
      `La fonction deposer_demande a échoué (code ${error.code || "inconnu"}).`,
    );
  }

  if (typeof data !== "string" || !FORME_REFERENCE.test(data)) {
    throw new Error("La fonction deposer_demande n'a pas renvoyé de référence.");
  }
  return { ok: true, reference: data };
}

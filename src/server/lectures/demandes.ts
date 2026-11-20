import "server-only";

import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { exigerUtilisateur } from "@/server/garde";
import { journaliser } from "@/server/journal";
import { attendre, ATTENTE_ESSAI_LENT_MS, modeEssaiListe } from "@/server/lectures/essai";
import { nouveauCodeSupport } from "@/shared/code-support";
import { FORME_REFERENCE, STATUTS, TAILLE_PAGE, type Statut } from "@/shared/constantes";
import { FORME_IDENTIFIANT } from "@/shared/schemas/depot";

// Lectures de l'écran I3 « Demandes » (AD-1) : la liste paginée et le
// compteur « à traiter ». Appelées par des Server Components, jamais depuis
// le navigateur.
//
// - Chaque lecture commence par `exigerUtilisateur()` (AD-7) : sans session,
//   ou avec un compte inactif, renvoi vers la connexion.
// - Elle passe par une fonction SQL (`lister_demandes`, `compter_a_traiter`)
//   avec la session de la personne (rôle `authenticated`) : aucune table
//   n'est lisible directement (AD-9). La définition de « à traiter » est dans
//   la base (AD-5).
// - La réponse de la base est contrôlée (Zod) avant d'être affichée.
// - Une panne (base injoignable, refus, réponse inattendue) n'est pas levée :
//   elle est journalisée avec un code court, sans aucune donnée de demandeur
//   (AD-12, AD-13), et la lecture renvoie `{ ok: false }` ; l'écran affiche
//   alors son état d'erreur.
// - Une seule lecture de chaque par requête (`cache` de React) : la pastille
//   du menu et la carte compteur partagent la même.

/** Résultat d'une lecture : les données, ou une panne déjà journalisée. */
export type ResultatLecture<T> = { ok: true; donnees: T } | { ok: false };

/** Une ligne du tableau des demandes. */
export type LigneDemande = {
  id: string;
  reference: string;
  /** Date de dépôt, au format ISO (UTC). */
  dateDepot: string;
  /** Nom du demandeur. */
  nom: string;
  objet: string;
  /** Nom de la catégorie. */
  categorie: string;
  statut: Statut;
};

/** Une page de la liste. */
export type ListeDemandes = {
  /** Nombre total de demandes. */
  total: number;
  /** Page affichée, déjà ramenée entre 1 et la dernière par la base. */
  page: number;
  /** Nombre de pages (au moins 1). */
  pages: number;
  demandes: LigneDemande[];
};

/** Au-delà, on abandonne : la page ne reste pas bloquée. */
const DELAI_MS = 8000;

/**
 * Plus grand numéro de page transmis à la base : au-delà, la page demandée
 * est de toute façon la dernière (la base la ramène), et le nombre reste un
 * entier Postgres.
 */
export const PAGE_MAXIMALE = 1_000_000;

const nombrePages = (total: number) => Math.max(1, Math.ceil(total / TAILLE_PAGE));

const schemaLigne = z.object({
  id: z.string().regex(FORME_IDENTIFIANT),
  reference: z.string().regex(FORME_REFERENCE),
  date_depot: z.string().refine((texte) => !Number.isNaN(Date.parse(texte))),
  nom: z.string(),
  objet: z.string(),
  categorie: z.string(),
  statut: z.enum(STATUTS),
});

const schemaListe = z
  .object({
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    demandes: z.array(schemaLigne).max(TAILLE_PAGE),
  })
  .refine(({ total, page }) => page <= nombrePages(total))
  .refine(({ total, demandes }) => demandes.length <= total);

const schemaCompteur = z.number().int().nonnegative();

/** Erreur dont le message ne contient que des noms de champs, jamais de valeur lue. */
function reponseInattendue(fonction: string, erreur: z.ZodError): Error {
  const chemins = [...new Set(erreur.issues.map((probleme) => probleme.path.join(".") || "(racine)"))];
  return new Error(`Réponse inattendue de ${fonction} (${chemins.join(", ")}).`);
}

/**
 * Exécute une lecture ; toute panne est journalisée avec un code court et
 * donne `{ ok: false }`. Les erreurs internes de Next.js (renvoi, rendu
 * différé) sont relancées.
 */
async function lire<T>(lecture: string, fn: () => Promise<T>): Promise<ResultatLecture<T>> {
  try {
    return { ok: true, donnees: await fn() };
  } catch (erreur) {
    unstable_rethrow(erreur);

    const codeSupport = nouveauCodeSupport();
    // Erreur complète dans la console du serveur seulement ; le journal ne
    // reçoit que le nom de la lecture et le code (AD-13).
    console.error(`[lecture] erreur inattendue (code ${codeSupport}, lecture ${lecture}) :`, erreur);
    await journaliser("erreur", "erreur_inattendue", { type: "lecture", lecture }, codeSupport);
    return { ok: false };
  }
}

/** Applique le réglage de développement `ESSAI_LISTE_DEMANDES` (sans effet ailleurs). */
async function essai(): Promise<"vide" | null> {
  const mode = modeEssaiListe();
  if (mode === "lent") await attendre(ATTENTE_ESSAI_LENT_MS);
  if (mode === "erreur") throw new Error("Panne simulée (ESSAI_LISTE_DEMANDES=erreur).");
  return mode === "vide" ? "vide" : null;
}

/**
 * Numéro de page lu dans l'adresse (`?page=`) : un entier d'au moins 1,
 * sinon 1 (`0`, `abc`, `-3`, vide). Une page trop loin est ramenée à la
 * dernière par la base.
 */
export function lirePage(valeur: string | string[] | undefined): number {
  const texte = Array.isArray(valeur) ? valeur[0] : valeur;
  if (typeof texte !== "string" || !/^\d+$/.test(texte)) return 1;
  const page = Number(texte);
  if (page < 1) return 1;
  return Math.min(page, PAGE_MAXIMALE);
}

/**
 * Une page de la liste des demandes (FR-11, RM-6) : toutes les demandes,
 * des plus récentes aux plus anciennes, 25 par page.
 */
export const lireListeDemandes = cache(
  async (page: number): Promise<ResultatLecture<ListeDemandes>> => {
    await exigerUtilisateur();

    return lire("lister_demandes", async () => {
      if ((await essai()) === "vide") return { total: 0, page: 1, pages: 1, demandes: [] };

      const supabase = await createClient();
      const { data, error } = await supabase
        .rpc("lister_demandes", { p_page: page, p_taille: TAILLE_PAGE })
        .abortSignal(AbortSignal.timeout(DELAI_MS));
      if (error) {
        throw new Error(`La fonction lister_demandes a échoué (code ${error.code || "inconnu"}).`);
      }

      const resultat = schemaListe.safeParse(data);
      if (!resultat.success) throw reponseInattendue("lister_demandes", resultat.error);
      const { total, page: pageLue, demandes } = resultat.data;

      return {
        total,
        page: pageLue,
        pages: nombrePages(total),
        demandes: demandes.map((ligne) => ({
          id: ligne.id,
          reference: ligne.reference,
          dateDepot: new Date(ligne.date_depot).toISOString(),
          nom: ligne.nom,
          objet: ligne.objet,
          categorie: ligne.categorie,
          statut: ligne.statut,
        })),
      };
    });
  },
);

/**
 * Nombre de demandes à traiter (FR-14) : la carte compteur et la pastille du
 * menu. La définition est celle de la base (AD-5).
 */
export const compterATraiter = cache(async (): Promise<ResultatLecture<number>> => {
  await exigerUtilisateur();

  return lire("compter_a_traiter", async () => {
    if ((await essai()) === "vide") return 0;

    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("compter_a_traiter")
      .abortSignal(AbortSignal.timeout(DELAI_MS));
    if (error) {
      throw new Error(`La fonction compter_a_traiter a échoué (code ${error.code || "inconnu"}).`);
    }

    const resultat = schemaCompteur.safeParse(data);
    if (!resultat.success) throw reponseInattendue("compter_a_traiter", resultat.error);
    return resultat.data;
  });
});

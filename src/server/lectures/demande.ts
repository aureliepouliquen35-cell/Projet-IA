import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { exigerUtilisateur } from "@/server/garde";
import { DELAI_MS, essai, reponseInattendue } from "@/server/lectures/demandes";
import {
  AUTEURS_EVENEMENTS,
  CANAUX,
  FORME_REFERENCE,
  STATUTS,
  TYPES_EVENEMENTS,
  type AuteurEvenement,
  type Canal,
  type Statut,
  type TypeEvenement,
} from "@/shared/constantes";
import { FORME_IDENTIFIANT } from "@/shared/schemas/depot";

// Lecture de l'écran I4 « Détail d'une demande » (AD-1) : une demande et
// son historique. Appelée par un Server Component, jamais depuis le
// navigateur.
//
// - Elle commence par `exigerUtilisateur()` (AD-7) : sans session, ou avec
//   un compte inactif, renvoi vers la connexion.
// - La référence est mise en majuscules et sa forme vérifiée : une adresse
//   mal formée (`/demandes/abc`) ne fait aucun appel à la base.
// - Elle passe par la fonction SQL `lire_demande` avec la session de la
//   personne (rôle `authenticated`) : aucune table n'est lisible
//   directement (AD-9). La réponse est contrôlée (Zod) avant d'être affichée.
//   Depuis la story 4.2, elle dit aussi si la catégorie est encore active
//   (`categorie_active`, RM-11).
// - `null` : aucune demande ne porte cette référence (page « demande
//   introuvable »).
// - Une panne (base injoignable, refus, réponse inattendue) est **levée** :
//   la page affiche l'écran S3 et `onRequestError` la journalise avec son
//   code et le chemin de la page (la référence), jamais le message de
//   l'erreur. Les messages écrits ici ne contiennent que des codes et des
//   noms de champs, aucune donnée du demandeur (AD-12, AD-13).
// - Une seule lecture par requête (`cache` de React).

/**
 * Auteur d'un événement (FR-17) : un utilisateur interne, par son nom (même
 * si son compte a été désactivé depuis), ou un libellé (« Demandeur »,
 * « Système »).
 */
export type AuteurDemande = { interne: true; nom: string } | { interne: false; libelle: AuteurEvenement };

/** Une ligne de l'historique (FR-17). */
export type EvenementDemande =
  | {
      type: Exclude<TypeEvenement, "statut">;
      auteur: AuteurDemande;
      /** Date de l'événement, au format ISO (UTC). */
      date: string;
    }
  | {
      /** « Statut : ancien → nouveau » (FR-16). */
      type: "statut";
      auteur: AuteurDemande;
      ancienStatut: Statut;
      nouveauStatut: Statut;
      date: string;
    };

/** Une demande, telle que l'écran I4 l'affiche. */
export type DetailDemande = {
  id: string;
  reference: string;
  /** Nom du demandeur. */
  nom: string;
  email: string;
  /** `null` s'il n'a pas été donné. */
  telephone: string | null;
  /** `null` si elle n'a pas été donnée. */
  entreprise: string | null;
  objet: string;
  /** Texte tel que saisi, retours à la ligne compris (jamais du HTML). */
  description: string;
  /** Nom de la catégorie. */
  categorie: string;
  /** Faux : catégorie désactivée depuis (RM-11) ; I4 affiche « Autre (désactivée) ». */
  categorieActive: boolean;
  canal: Canal;
  statut: Statut;
  /** Date de dépôt, au format ISO (UTC). */
  dateDepot: string;
  /** Date du passage à *Traitée*, au format ISO (UTC) ; `null` si elle ne l'est pas. */
  dateCloture: string | null;
  /** Du plus ancien au plus récent. */
  evenements: EvenementDemande[];
};

const schemaDate = z.string().refine((texte) => !Number.isNaN(Date.parse(texte)));

const schemaDetail = z.object({
  id: z.string().regex(FORME_IDENTIFIANT),
  reference: z.string().regex(FORME_REFERENCE),
  nom: z.string(),
  email: z.string(),
  telephone: z.string().nullable(),
  entreprise: z.string().nullable(),
  objet: z.string(),
  description: z.string(),
  categorie: z.string(),
  categorie_active: z.boolean(),
  canal: z.enum(CANAUX),
  statut: z.enum(STATUTS),
  date_depot: schemaDate,
  date_cloture: schemaDate.nullable(),
  evenements: z.array(
    z
      .object({
        type: z.enum(TYPES_EVENEMENTS),
        auteur: z.enum(AUTEURS_EVENEMENTS).nullable(),
        auteur_nom: z.string().nullable(),
        ancien_statut: z.enum(STATUTS).nullable(),
        nouveau_statut: z.enum(STATUTS).nullable(),
        date: schemaDate,
      })
      // Un seul auteur : un utilisateur interne ou un libellé (contrainte
      // `evenements_un_seul_auteur_check`).
      .refine((e) => (e.auteur === null) !== (e.auteur_nom === null), { path: ["auteur"] })
      // Un changement de statut dit d'où et vers où il va ; les autres
      // événements, non (contrainte `evenements_statut_check`).
      .refine(
        (e) =>
          e.type === "statut"
            ? e.ancien_statut !== null && e.nouveau_statut !== null
            : e.ancien_statut === null && e.nouveau_statut === null,
        { path: ["nouveau_statut"] },
      ),
  ),
});

type EvenementLu = z.infer<typeof schemaDetail>["evenements"][number];

const enIso = (texte: string) => new Date(texte).toISOString();

function evenement(e: EvenementLu): EvenementDemande {
  // Les deux `refine` du schéma garantissent les valeurs non nulles.
  const auteur: AuteurDemande =
    e.auteur_nom !== null ? { interne: true, nom: e.auteur_nom } : { interne: false, libelle: e.auteur! };
  const date = enIso(e.date);
  if (e.type === "statut") {
    return { type: "statut", auteur, ancienStatut: e.ancien_statut!, nouveauStatut: e.nouveau_statut!, date };
  }
  return { type: e.type, auteur, date };
}

/**
 * Référence lue dans l'adresse (`/demandes/nova-2026-0042`) : en
 * majuscules, sans espaces de bord ; `null` si elle n'a pas la forme
 * `NOVA-AAAA-NNNN`.
 */
export function lireReference(valeur: string): string | null {
  const reference = valeur.trim().toUpperCase();
  return FORME_REFERENCE.test(reference) ? reference : null;
}

/**
 * Une demande et son historique (FR-15, FR-17, RM-6), ou `null` si elle
 * n'existe pas (référence inconnue ou mal formée).
 */
export const lireDemande = cache(async (valeur: string): Promise<DetailDemande | null> => {
  await exigerUtilisateur();
  const reference = lireReference(valeur);
  if (!reference) return null;

  // Réglage de développement `ESSAI_LISTE_DEMANDES` : « lent » et « erreur »
  // (sans effet hors de `npm run dev`).
  await essai();

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("lire_demande", { p_reference: reference })
    .abortSignal(AbortSignal.timeout(DELAI_MS));
  if (error) {
    throw new Error(`La fonction lire_demande a échoué (code ${error.code || "inconnu"}).`);
  }
  if (data === null) return null;

  const resultat = schemaDetail.safeParse(data);
  if (!resultat.success) throw reponseInattendue("lire_demande", resultat.error);
  const demande = resultat.data;
  if (demande.reference !== reference) {
    throw new Error("Réponse inattendue de lire_demande (reference).");
  }

  return {
    id: demande.id,
    reference: demande.reference,
    nom: demande.nom,
    email: demande.email,
    telephone: demande.telephone,
    entreprise: demande.entreprise,
    objet: demande.objet,
    description: demande.description,
    categorie: demande.categorie,
    categorieActive: demande.categorie_active,
    canal: demande.canal,
    statut: demande.statut,
    dateDepot: enIso(demande.date_depot),
    dateCloture: demande.date_cloture === null ? null : enIso(demande.date_cloture),
    evenements: demande.evenements.map(evenement),
  };
});

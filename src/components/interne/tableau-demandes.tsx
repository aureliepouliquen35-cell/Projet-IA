import Link from "next/link";

import { BadgeStatut } from "@/components/interne/badge-statut";
import type { LigneDemande } from "@/server/lectures/demandes";
import { adresseDetail } from "@/shared/adresse-liste";
import { formaterDateHeure } from "@/shared/dates";
import { MESSAGES_LISTE } from "@/shared/messages";

// Tableau des demandes (DESIGN.md, Tableau des demandes ; FR-11) : un vrai
// tableau, avec ses en-têtes de colonnes reconnus par les lecteurs d'écran.
// Lignes de 56 px, référence en chasse fixe, objet en semi-gras, statut
// écrit dans son badge. Ni l'email ni le téléphone du demandeur (RGPD).
//
// Toute la ligne ouvre le détail (I4), sans JavaScript : la référence est un
// vrai lien, dont une zone invisible (`after:absolute after:inset-0`) couvre
// la ligne (`relative` sur `<tr>`). Clavier, clic du milieu et nouvel onglet
// marchent comme sur tout lien. L'adresse du détail garde la recherche et la
// page de la liste (`adresseDetail`) : le fil d'Ariane y ramène.
//
// Pas encore de colonne « Attribuée à » ni de badges Urgente / Sans activité
// (Should).

const EN_TETE = "px-3 py-2.5 text-left text-caption font-semibold tracking-wide text-text-muted uppercase";
const CELLULE = "h-14 border-t px-3 align-middle";

export function TableauDemandes({
  demandes,
  q = "",
  page = 1,
}: {
  demandes: LigneDemande[];
  /** Texte cherché de la liste affichée, gardé par le lien vers le détail. */
  q?: string;
  /** Page de la liste affichée, gardée par le lien vers le détail. */
  page?: number;
}) {
  const { colonnes } = MESSAGES_LISTE;
  return (
    <div className="overflow-x-auto rounded-lg border bg-background shadow-soft">
      <table data-slot="tableau-demandes" className="w-full border-collapse text-body-sm text-text">
        <caption className="sr-only">{MESSAGES_LISTE.legendeTableau}</caption>
        <thead className="bg-surface-muted">
          <tr>
            <th scope="col" className={EN_TETE}>{colonnes.reference}</th>
            <th scope="col" className={EN_TETE}>{colonnes.deposeeLe}</th>
            <th scope="col" className={EN_TETE}>{colonnes.demandeur}</th>
            <th scope="col" className={EN_TETE}>{colonnes.objet}</th>
            <th scope="col" className={EN_TETE}>{colonnes.categorie}</th>
            <th scope="col" className={EN_TETE}>{colonnes.statut}</th>
          </tr>
        </thead>
        <tbody>
          {demandes.map((demande) => (
            <tr
              key={demande.id}
              data-slot="ligne-demande"
              className="relative cursor-pointer hover:bg-surface-muted"
            >
              <td className={CELLULE}>
                <Link
                  href={adresseDetail(demande.reference, { q, page })}
                  className="font-mono text-reference whitespace-nowrap text-primary underline-offset-2 after:absolute after:inset-0 hover:underline"
                >
                  {demande.reference}
                </Link>
              </td>
              <td className={`${CELLULE} text-caption whitespace-nowrap text-text-muted`}>
                <time dateTime={demande.dateDepot}>{formaterDateHeure(new Date(demande.dateDepot))}</time>
              </td>
              <td className={CELLULE}>{demande.nom}</td>
              <td className={`${CELLULE} font-semibold`}>{demande.objet}</td>
              <td className={`${CELLULE} text-caption text-text-muted`}>{demande.categorie}</td>
              <td className={CELLULE}>
                <BadgeStatut statut={demande.statut} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

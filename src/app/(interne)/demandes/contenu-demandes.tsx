import { connection } from "next/server";

import { CarteATraiter } from "@/components/interne/carte-a-traiter";
import { EtatListeErreur, EtatListeVide } from "@/components/interne/etat-liste";
import { Pagination } from "@/components/interne/pagination";
import { TableauDemandes } from "@/components/interne/tableau-demandes";
import { exigerUtilisateur } from "@/server/garde";
import { compterATraiter, lireListeDemandes, lirePage } from "@/server/lectures/demandes";

// Contenu de « Demandes » (I3). Comme toute lecture interne, il vérifie
// d'abord la personne connectée (AD-7) : sans session, ou avec un compte
// inactif, renvoi vers la connexion.
//
// Puis : la carte « à traiter » (« — » si le compteur n'a pas pu être lu),
// et à la place du tableau, selon le cas, le message vide (aucune demande
// en base), le message d'erreur avec « Réessayer », ou le tableau et sa
// pagination.

export type ParametresAdresse = Record<string, string | string[] | undefined>;

export async function ContenuDemandes({ searchParams }: { searchParams: Promise<ParametresAdresse> }) {
  // Lecture à chaque visite, jamais pendant la préparation de la page : la
  // lecture de la session par Supabase consulte l'heure (`Date.now()`), ce
  // que Cache Components interdit avant une vraie requête.
  await connection();
  await exigerUtilisateur();
  const page = lirePage((await searchParams).page);
  const [compteur, liste] = await Promise.all([compterATraiter(), lireListeDemandes(page)]);

  return (
    <div className="flex flex-col gap-5">
      <CarteATraiter nombre={compteur.ok ? compteur.donnees : null} />
      {!liste.ok ? (
        <EtatListeErreur />
      ) : liste.donnees.total === 0 ? (
        <EtatListeVide />
      ) : (
        <div>
          <TableauDemandes demandes={liste.donnees.demandes} />
          <Pagination total={liste.donnees.total} page={liste.donnees.page} pages={liste.donnees.pages} />
        </div>
      )}
    </div>
  );
}

import { connection } from "next/server";

import { CarteATraiter } from "@/components/interne/carte-a-traiter";
import { EtatListeErreur, EtatListeVide, EtatRechercheVide } from "@/components/interne/etat-liste";
import { Pagination } from "@/components/interne/pagination";
import { RechercheDemandes } from "@/components/interne/recherche-demandes";
import { TableauDemandes } from "@/components/interne/tableau-demandes";
import { exigerUtilisateur } from "@/server/garde";
import { compterATraiter, lireListeDemandes, lirePage } from "@/server/lectures/demandes";
import { lireRecherche } from "@/shared/adresse-liste";
import { MESSAGES_LISTE, nombreDemandes } from "@/shared/messages";

// Contenu de « Demandes » (I3). Comme toute lecture interne, il vérifie
// d'abord la personne connectée (AD-7) : sans session, ou avec un compte
// inactif, renvoi vers la connexion.
//
// Puis : la carte « à traiter » (« — » si le compteur n'a pas pu être lu),
// la barre de recherche (`?q=`, FR-12), et sous elle, selon le cas :
//   - la ligne « 42 demandes » (annoncée par la zone `role="status"` de la
//     barre, toujours présente), le tableau (dont chaque ligne ouvre le
//     détail en gardant `q` et `page`) et sa pagination (qui garde `q`) ;
//   - « Aucune demande trouvée » quand la recherche ne trouve rien ;
//   - le message vide quand il n'y a aucune demande en base ;
//   - le message d'erreur avec « Réessayer » (la barre reste utilisable).

export type ParametresAdresse = Record<string, string | string[] | undefined>;

export async function ContenuDemandes({ searchParams }: { searchParams: Promise<ParametresAdresse> }) {
  // Lecture à chaque visite, jamais pendant la préparation de la page : la
  // lecture de la session par Supabase consulte l'heure (`Date.now()`), ce
  // que Cache Components interdit avant une vraie requête.
  await connection();
  await exigerUtilisateur();
  const parametres = await searchParams;
  const page = lirePage(parametres.page);
  const q = lireRecherche(parametres.q);
  const [compteur, liste] = await Promise.all([compterATraiter(), lireListeDemandes(page, q)]);

  // Annoncé aux lecteurs d'écran à chaque nouvelle recherche.
  const annonce = !liste.ok
    ? ""
    : liste.donnees.total > 0
      ? nombreDemandes(liste.donnees.total)
      : liste.donnees.recherche
        ? MESSAGES_LISTE.rechercheVideTitre
        : "";

  return (
    <div className="flex flex-col gap-5">
      <CarteATraiter nombre={compteur.ok ? compteur.donnees : null} />
      <RechercheDemandes q={q} annonce={annonce}>
        {!liste.ok ? (
          <EtatListeErreur />
        ) : liste.donnees.total === 0 ? (
          liste.donnees.recherche ? <EtatRechercheVide /> : <EtatListeVide />
        ) : (
          <div>
            <p className="mb-2 text-body-sm text-text-muted">
              <strong className="font-semibold text-text">{nombreDemandes(liste.donnees.total)}</strong>
            </p>
            <TableauDemandes
              demandes={liste.donnees.demandes}
              q={liste.donnees.recherche}
              page={liste.donnees.page}
            />
            <Pagination
              total={liste.donnees.total}
              page={liste.donnees.page}
              pages={liste.donnees.pages}
              q={liste.donnees.recherche}
            />
          </div>
        )}
      </RechercheDemandes>
    </div>
  );
}

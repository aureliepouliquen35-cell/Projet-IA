import { connection } from "next/server";

import { CarteATraiter } from "@/components/interne/carte-a-traiter";
import { EtatListeErreur, EtatListeVide, EtatRechercheVide } from "@/components/interne/etat-liste";
import { Pagination } from "@/components/interne/pagination";
import { RechercheDemandes } from "@/components/interne/recherche-demandes";
import { TableauDemandes } from "@/components/interne/tableau-demandes";
import { exigerUtilisateur } from "@/server/garde";
import { compterATraiter, lireCategoriesFiltre, lireListeDemandes, lirePage } from "@/server/lectures/demandes";
import { filtreActif, lireFiltres, lireRecherche, type FiltresListe } from "@/shared/adresse-liste";
import { MESSAGES_LISTE, nombreDemandes } from "@/shared/messages";

// Contenu de « Demandes » (I3). Comme toute lecture interne, il vérifie
// d'abord la personne connectée (AD-7) : sans session, ou avec un compte
// inactif, renvoi vers la connexion.
//
// Puis : la carte « à traiter » (« — » si le compteur n'a pas pu être lu),
// la barre de recherche (`?q=`, FR-12) et ses filtres (`?statut=`,
// `?categorie=`, `?canal=`, FR-13 ; bouton Catégorie désactivé si les
// catégories n'ont pas pu être lues), et sous elle, selon le cas :
//   - la ligne « 42 demandes » (annoncée par la zone `role="status"` de la
//     barre, toujours présente), le tableau (dont chaque ligne ouvre le
//     détail en gardant `q`, les filtres et `page`) et sa pagination (qui
//     garde `q` et les filtres) ;
//   - « Aucune demande trouvée » quand la recherche ou les filtres ne
//     trouvent rien ;
//   - le message vide quand il n'y a aucune demande en base ;
//   - le message d'erreur avec « Réessayer » (la barre et les filtres
//     restent utilisables).

export type ParametresAdresse = Record<string, string | string[] | undefined>;

/**
 * Filtres réellement appliqués : une catégorie bien formée mais inconnue des
 * catégories lues est ignorée par la base, et donc retirée ici (bouton
 * « Toutes », liens sans elle). Si les catégories n'ont pas pu être lues, la
 * base reste seule juge.
 */
function filtresAppliques(filtres: FiltresListe, categories: { id: string }[] | null): FiltresListe {
  if (!filtres.categorie || !categories || categories.some(({ id }) => id === filtres.categorie)) return filtres;
  return lireFiltres({ ...filtres, categorie: undefined });
}

export async function ContenuDemandes({ searchParams }: { searchParams: Promise<ParametresAdresse> }) {
  // Lecture à chaque visite, jamais pendant la préparation de la page : la
  // lecture de la session par Supabase consulte l'heure (`Date.now()`), ce
  // que Cache Components interdit avant une vraie requête.
  await connection();
  await exigerUtilisateur();
  const parametres = await searchParams;
  const page = lirePage(parametres.page);
  const q = lireRecherche(parametres.q);
  const filtresAdresse = lireFiltres(parametres);
  const [compteur, liste, lectureCategories] = await Promise.all([
    compterATraiter(),
    lireListeDemandes(page, q, filtresAdresse),
    lireCategoriesFiltre(),
  ]);
  const categories = lectureCategories.ok ? lectureCategories.donnees : null;
  const filtres = filtresAppliques(filtresAdresse, categories);
  const sansResultatCherche = liste.ok && liste.donnees.total === 0 && (liste.donnees.recherche !== "" || filtreActif(filtres));

  // Annoncé aux lecteurs d'écran à chaque nouvelle recherche ou nouveau filtre.
  const annonce = !liste.ok
    ? ""
    : liste.donnees.total > 0
      ? nombreDemandes(liste.donnees.total)
      : sansResultatCherche
        ? MESSAGES_LISTE.rechercheVideTitre
        : "";

  return (
    <div className="flex flex-col gap-5">
      <CarteATraiter nombre={compteur.ok ? compteur.donnees : null} />
      <RechercheDemandes q={q} filtres={filtres} categories={categories} annonce={annonce}>
        {!liste.ok ? (
          <EtatListeErreur />
        ) : liste.donnees.total === 0 ? (
          sansResultatCherche ? <EtatRechercheVide /> : <EtatListeVide />
        ) : (
          <div>
            <p className="mb-2 text-body-sm text-text-muted">
              <strong className="font-semibold text-text">{nombreDemandes(liste.donnees.total)}</strong>
            </p>
            <TableauDemandes
              demandes={liste.donnees.demandes}
              liste={{ q: liste.donnees.recherche, ...filtres, page: liste.donnees.page }}
            />
            <Pagination
              total={liste.donnees.total}
              page={liste.donnees.page}
              pages={liste.donnees.pages}
              liste={{ q: liste.donnees.recherche, ...filtres }}
            />
          </div>
        )}
      </RechercheDemandes>
    </div>
  );
}

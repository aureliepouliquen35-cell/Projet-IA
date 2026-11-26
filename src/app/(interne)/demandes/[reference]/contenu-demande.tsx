import { Clock, Info, MessageSquare, Search, User } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { ActionsStatut } from "@/components/interne/actions-statut";
import { BadgeStatut } from "@/components/interne/badge-statut";
import { FilAriane } from "@/components/interne/fil-ariane";
import { HistoriqueDemande } from "@/components/interne/historique-demande";
import { SupprimerDemande } from "@/components/interne/supprimer-demande";
import { exigerUtilisateur } from "@/server/garde";
import { lireDemande, type DetailDemande } from "@/server/lectures/demande";
import { lirePage } from "@/server/lectures/demandes";
import { adresseListe, lireFiltres, lireRecherche } from "@/shared/adresse-liste";
import { lienTelephone } from "@/shared/contacts";
import { formaterDateHeure } from "@/shared/dates";
import { LIBELLES_CANAUX } from "@/shared/libelles";
import { MESSAGES_DETAIL, MESSAGES_LISTE, MESSAGES_STATUT } from "@/shared/messages";

import type { ParametresAdresse } from "../contenu-demandes";

// Contenu du détail d'une demande (I4 ; EXPERIENCE.md, DESIGN.md). Comme
// toute lecture interne, il vérifie d'abord la personne connectée (AD-7).
//
// En-tête : fil d'Ariane « ← Demandes » (retour à la même recherche, aux
// mêmes filtres et à la même page de la liste, lus dans l'adresse du détail), référence, objet
// en titre, badge de statut. Puis, à partir de 1 024 px, deux colonnes :
//   - à gauche, les blocs Demande (description en texte simple, retours à
//     la ligne gardés : React l'échappe, jamais de HTML, NFR-11), Demandeur
//     (email en `mailto:`, téléphone en `tel:`, lien « Voir ses autres
//     demandes », story 2.4), Informations et Historique ;
//   - à droite, le panneau « Statut » : le statut actuel et les boutons des
//     seuls passages permis (`ActionsStatut`, story 1.11) ; en bas, pour les
//     seuls administrateurs (rôle relu dans `profils` par
//     `exigerUtilisateur()`, AD-7), la zone administrateur séparée par un
//     trait, avec « Supprimer la demande… » (`SupprimerDemande`, story
//     4.4). Un collaborateur ne la reçoit pas, et la Server Function le
//     refuse de toute façon (RM-7).
// En dessous de 1 024 px, une colonne : le panneau vient sous l'en-tête.
// La date de clôture s'affiche dans « Informations » si la demande est
// *Traitée*.
//
// Ni priorité (FR-19), ni attribution, ni commentaires : stories à venir.

const CARTE = "rounded-lg border bg-background p-6 shadow-soft";
const LISTE_CHAMPS = "grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-body-sm";
const LIEN = "text-primary underline underline-offset-2 hover:no-underline";

function Bloc({ icone, titre, children }: { icone: ReactNode; titre: string; children: ReactNode }) {
  return (
    <section className={CARTE}>
      <h2 className="mb-3.5 flex items-center gap-2 text-section-title text-text">
        <span aria-hidden="true" className="text-accent-nova [&_svg]:size-[18px]">
          {icone}
        </span>
        {titre}
      </h2>
      {children}
    </section>
  );
}

function Champ({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-text-muted">{libelle}</dt>
      <dd className="min-w-0 break-words text-text">{children}</dd>
    </>
  );
}

const Absent = ({ texte }: { texte: string }) => <span className="text-text-muted">{texte}</span>;

/**
 * Adresse `mailto:` d'un email : tout est encodé sauf l'arobase, pour qu'un
 * email accepté par le formulaire (`a@b.fr?cc=x@y.fr`) n'ajoute ni copie, ni
 * objet, ni texte au message.
 */
const lienEmail = (email: string) => `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}`;

function Demandeur({ demande }: { demande: DetailDemande }) {
  // Sans aucun chiffre (« inconnu »), le téléphone reste un simple texte.
  const appel = demande.telephone && /\d/.test(demande.telephone) ? lienTelephone(demande.telephone) : null;
  return (
    <dl className={LISTE_CHAMPS}>
      <Champ libelle={MESSAGES_DETAIL.nom}>{demande.nom}</Champ>
      <Champ libelle={MESSAGES_DETAIL.email}>
        <a href={lienEmail(demande.email)} className={`${LIEN} break-all`}>
          {demande.email}
        </a>
      </Champ>
      <Champ libelle={MESSAGES_DETAIL.telephone}>
        {!demande.telephone ? (
          <Absent texte={MESSAGES_DETAIL.nonRenseigne} />
        ) : appel ? (
          <a href={appel} className={LIEN}>
            {demande.telephone}
          </a>
        ) : (
          demande.telephone
        )}
      </Champ>
      <Champ libelle={MESSAGES_DETAIL.entreprise}>
        {demande.entreprise ?? <Absent texte={MESSAGES_DETAIL.nonRenseignee} />}
      </Champ>
    </dl>
  );
}

/**
 * Lien « Voir ses autres demandes » (story 2.4, FR-12) : la liste avec la
 * seule recherche sur l'email du demandeur, sans filtre ni page (un filtre
 * de la liste d'où l'on vient cacherait une partie de ses demandes), donc
 * toutes ses demandes quel que soit leur statut, celle-ci comprise.
 */
function AutresDemandes({ email }: { email: string }) {
  return (
    <Link
      href={adresseListe({ q: email })}
      data-slot="autres-demandes"
      className={`${LIEN} mt-2 inline-flex min-h-11 items-center gap-1.5 text-body-sm font-medium`}
    >
      <Search aria-hidden="true" className="size-4 shrink-0" />
      {MESSAGES_DETAIL.autresDemandes}
    </Link>
  );
}

export async function ContenuDemande({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<ParametresAdresse>;
}) {
  // Lecture à chaque visite, jamais pendant la préparation de la page (voir
  // `ContenuDemandes`).
  await connection();
  const utilisateur = await exigerUtilisateur();
  const [{ reference }, parametres] = await Promise.all([params, searchParams]);
  const retour = adresseListe({
    q: lireRecherche(parametres.q),
    ...lireFiltres(parametres),
    page: lirePage(parametres.page),
  });

  const demande = await lireDemande(reference);
  if (!demande) notFound();

  return (
    <div data-slot="detail-demande">
      <FilAriane retour={retour} reference={demande.reference} />
      <p className="font-mono text-reference text-text-muted">{demande.reference}</p>
      <div className="mt-1 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-page-title break-words text-text">{demande.objet}</h1>
        <BadgeStatut statut={demande.statut} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <aside
          aria-labelledby="titre-panneau-statut"
          data-slot="panneau-statut"
          className={`${CARTE} p-5 lg:sticky lg:top-5 lg:col-start-2 lg:row-start-1`}
        >
          <h2
            id="titre-panneau-statut"
            className="mb-2.5 text-caption font-semibold tracking-wide text-text-muted uppercase"
          >
            {MESSAGES_DETAIL.panneauStatut}
          </h2>
          <p className="flex items-center gap-2 text-body-sm text-text">
            {MESSAGES_DETAIL.statutActuel} <BadgeStatut statut={demande.statut} />
          </p>
          {/* Même clé après `refresh()` : l'encadré « modifiée par … » reste
              affiché ; une autre demande repart de zéro. */}
          <ActionsStatut key={demande.reference} reference={demande.reference} statut={demande.statut} />
          {utilisateur.role === "administrateur" ? (
            <SupprimerDemande key={`suppression-${demande.reference}`} reference={demande.reference} retour={retour} />
          ) : null}
        </aside>

        <div className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1">
          <Bloc icone={<MessageSquare />} titre={MESSAGES_DETAIL.blocDemande}>
            <p data-slot="description" className="text-body break-words whitespace-pre-wrap text-text">
              {demande.description}
            </p>
          </Bloc>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Bloc icone={<User />} titre={MESSAGES_DETAIL.blocDemandeur}>
              <Demandeur demande={demande} />
              <AutresDemandes email={demande.email} />
            </Bloc>
            <Bloc icone={<Info />} titre={MESSAGES_DETAIL.blocInformations}>
              <dl className={LISTE_CHAMPS}>
                <Champ libelle={MESSAGES_DETAIL.categorie}>
                  {/* Catégorie désactivée depuis : la demande la garde, avec la mention (RM-11). */}
                  {demande.categorieActive ? demande.categorie : `${demande.categorie} ${MESSAGES_LISTE.desactivee}`}
                </Champ>
                <Champ libelle={MESSAGES_DETAIL.canal}>{LIBELLES_CANAUX[demande.canal]}</Champ>
                <Champ libelle={MESSAGES_DETAIL.deposeeLe}>
                  <time dateTime={demande.dateDepot}>{formaterDateHeure(new Date(demande.dateDepot))}</time>
                </Champ>
                {demande.dateCloture ? (
                  <Champ libelle={MESSAGES_STATUT.clotureeLe}>
                    <time dateTime={demande.dateCloture}>{formaterDateHeure(new Date(demande.dateCloture))}</time>
                  </Champ>
                ) : null}
              </dl>
            </Bloc>
          </div>

          <Bloc icone={<Clock />} titre={MESSAGES_DETAIL.blocHistorique}>
            <HistoriqueDemande evenements={demande.evenements} canal={demande.canal} />
          </Bloc>
        </div>
      </div>
    </div>
  );
}

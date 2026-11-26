import { Tags, Users } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";

import { LienMenu, VueLienMenu } from "@/components/interne/lien-menu";
import { SuiviRole } from "@/components/interne/suivi-role";
import { exigerUtilisateur } from "@/server/garde";
import { ADRESSE_CATEGORIES, ADRESSE_COMPTES } from "@/shared/acces";
import { MESSAGES_INTERNE } from "@/shared/messages";

// Section « Administration » du menu latéral (EXPERIENCE.md, Information
// Architecture ; FR-24, RM-7) : son titre, puis « Comptes » (écran A1) et
// « Catégories » (écran A2, story 4.1).
// Rendue seulement pour un administrateur : pour un collaborateur, rien,
// ni titre, ni lien. Le rôle est relu dans `profils` à chaque rendu du menu
// (`exigerUtilisateur`, AD-7).
//
// Le menu est dans le layout, qui n'est pas rendu de nouveau à chaque
// navigation : `SuiviRole` (composant client, rendu pour les deux rôles,
// qui n'affiche rien) compare à chaque changement d'adresse le rôle de ce
// rendu au cookie `nova_role` posé par le proxy, et recharge le menu s'ils
// diffèrent (story 3.3). Une Server Function d'administration refusée
// (`ACCES_REFUSE`) recalcule aussi la page (`refresh()`). Un administrateur
// rétrogradé perd donc la section à sa prochaine action ; la page A1, elle,
// refuse elle-même (S1).
//
// Cacher la section n'est pas une protection : les pages A1 et A2, leurs
// lectures et les fonctions SQL vérifient elles-mêmes le rôle.
//
// Lit les cookies : à placer sous `<Suspense fallback={null}>` (Cache
// Components). « Informations générales » (story 4.3) et « Données
// personnelles » (epic 6) viendront s'ajouter ici.

const ID_TITRE = "titre-section-administration";

export async function SectionAdministration() {
  // Comme la pastille du menu : lecture à chaque visite seulement, car la
  // lecture de la session consulte l'heure (Cache Components).
  await connection();
  const { role } = await exigerUtilisateur();
  const suivi = <SuiviRole role={role} />;
  if (role !== "administrateur") return suivi;

  return (
    <>
      {suivi}
      <div data-slot="section-administration" className="flex items-center gap-1 lg:mt-6 lg:block">
        <p
          id={ID_TITRE}
          className="sr-only lg:not-sr-only lg:mb-1.5 lg:block lg:px-3 lg:text-caption lg:font-semibold lg:tracking-wide lg:text-text-subtle lg:uppercase"
        >
          {MESSAGES_INTERNE.administration}
        </p>
        <ul aria-labelledby={ID_TITRE} className="flex gap-1 lg:flex-col">
          <li>
            <Suspense
              fallback={
                <VueLienMenu href={ADRESSE_COMPTES} icone={<Users aria-hidden="true" />} actif={false}>
                  {MESSAGES_INTERNE.comptes}
                </VueLienMenu>
              }
            >
              <LienMenu href={ADRESSE_COMPTES} icone={<Users aria-hidden="true" />}>
                {MESSAGES_INTERNE.comptes}
              </LienMenu>
            </Suspense>
          </li>
          <li>
            <Suspense
              fallback={
                <VueLienMenu href={ADRESSE_CATEGORIES} icone={<Tags aria-hidden="true" />} actif={false}>
                  {MESSAGES_INTERNE.categories}
                </VueLienMenu>
              }
            >
              <LienMenu href={ADRESSE_CATEGORIES} icone={<Tags aria-hidden="true" />}>
                {MESSAGES_INTERNE.categories}
              </LienMenu>
            </Suspense>
          </li>
        </ul>
      </div>
    </>
  );
}

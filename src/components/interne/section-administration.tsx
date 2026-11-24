import { Users } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";

import { LienMenu, VueLienMenu } from "@/components/interne/lien-menu";
import { exigerAdministrateur } from "@/server/garde";
import { ADRESSE_COMPTES } from "@/shared/acces";
import { MESSAGES_INTERNE } from "@/shared/messages";

// Section « Administration » du menu latéral (EXPERIENCE.md, Information
// Architecture ; FR-24, RM-7) : son titre, puis « Comptes » (écran A1).
// Rendue seulement pour un administrateur : pour un collaborateur, rien,
// ni titre, ni lien. Le rôle est relu dans `profils` à chaque rendu du menu
// (`exigerAdministrateur`, AD-7). Le menu est dans le layout, qui n'est pas
// rendu de nouveau à chaque navigation : la section suit le rôle à chaque
// chargement complet ou rafraîchissement de la page. La page A1, elle,
// refuse dès la navigation suivante (S1).
//
// Cacher la section n'est pas une protection : la page A1, sa lecture et la
// fonction SQL vérifient elles-mêmes le rôle.
//
// Lit les cookies : à placer sous `<Suspense fallback={null}>` (Cache
// Components). « Catégories » et « Informations générales » (epic 4),
// « Données personnelles » (epic 6) viendront s'ajouter ici.

const ID_TITRE = "titre-section-administration";

export async function SectionAdministration() {
  // Comme la pastille du menu : lecture à chaque visite seulement, car la
  // lecture de la session consulte l'heure (Cache Components).
  await connection();
  if (!(await exigerAdministrateur())) return null;

  return (
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
      </ul>
    </div>
  );
}

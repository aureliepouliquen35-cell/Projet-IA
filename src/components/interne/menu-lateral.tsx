import { Inbox } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";

import { LienMenu, VueLienMenu } from "@/components/interne/lien-menu";
import { SqueletteUtilisateur, UtilisateurConnecte } from "@/components/interne/utilisateur-connecte";
import { Logo } from "@/components/logo";
import { compterATraiter } from "@/server/lectures/demandes";
import { ADRESSE_ACCUEIL_INTERNE } from "@/shared/acces";
import { formaterNombre } from "@/shared/constantes";
import { MESSAGES_INTERNE } from "@/shared/messages";

import paquet from "../../../package.json";

// Menu latéral de l'espace interne (EXPERIENCE.md, Information
// Architecture ; DESIGN.md, Menu latéral) : logo, « Demandes » avec la
// pastille du nombre à traiter, puis, en bas, la personne connectée (nom,
// rôle, « Se déconnecter ») et le numéro de version (NFR-4, AD-17).
//
// À partir de 1 024 px : fixe à gauche, 240 px. En dessous : bandeau en haut
// de la page (le menu replié derrière « Menu » arrive avec la story 6.7).
//
// « Nouvelle demande » (story 2.3) et la section Administration (stories 3.x)
// viendront s'ajouter ici.
//
// La pastille et la personne connectée lisent les cookies : elles sont sous
// `<Suspense>` (Cache Components) ; le reste du menu s'affiche tout de suite.
// Le menu n'est pas relu quand on passe d'une page de la liste à l'autre :
// la pastille est juste au plus tard au rafraîchissement (FR-14).
//
// L'élément actif dépend de l'adresse, inconnue d'avance sous le détail
// d'une demande (`/demandes/[reference]`) : il est sous `<Suspense>`, avec le
// même lien, inactif et sans pastille, en attendant.

/** Numéro de version affiché, celui de `package.json` (AD-17). */
export const VERSION = paquet.version;

/** Pastille de « Demandes » : rien si le compteur n'a pas pu être lu. */
export async function PastilleATraiter() {
  // Lecture à chaque visite, jamais pendant la préparation de la page : la
  // lecture de la session par Supabase consulte l'heure (`Date.now()`), ce
  // que Cache Components interdit avant une vraie requête.
  await connection();
  const compteur = await compterATraiter();
  if (!compteur.ok) return null;
  return (
    <span
      data-slot="pastille-a-traiter"
      className="rounded-full bg-primary px-2 py-px text-caption font-semibold text-primary-foreground"
    >
      {formaterNombre(compteur.donnees)}
      <span className="sr-only"> {MESSAGES_INTERNE.pastilleATraiter}</span>
    </span>
  );
}

export function MenuLateral() {
  return (
    <aside
      data-slot="menu-lateral"
      className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b bg-background px-gutter-mobile py-3 lg:sticky lg:top-0 lg:h-dvh lg:w-sidebar lg:flex-none lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-0 lg:self-start lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-3 lg:py-5"
    >
      <div className="lg:px-2 lg:pb-5">
        <Logo />
      </div>

      <nav aria-label={MESSAGES_INTERNE.menu} className="lg:flex-1">
        <ul className="flex gap-1 lg:flex-col">
          <li>
            <Suspense
              fallback={
                <VueLienMenu href={ADRESSE_ACCUEIL_INTERNE} icone={<Inbox aria-hidden="true" />} actif={false}>
                  {MESSAGES_INTERNE.demandes}
                </VueLienMenu>
              }
            >
              <LienMenu
                href={ADRESSE_ACCUEIL_INTERNE}
                icone={<Inbox aria-hidden="true" />}
                fin={
                  <Suspense fallback={null}>
                    <PastilleATraiter />
                  </Suspense>
                }
              >
                {MESSAGES_INTERNE.demandes}
              </LienMenu>
            </Suspense>
          </li>
        </ul>
      </nav>

      <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2 lg:ml-0 lg:flex-col lg:items-stretch lg:gap-3 lg:border-t lg:px-2 lg:pt-4">
        <Suspense fallback={<SqueletteUtilisateur />}>
          <UtilisateurConnecte />
        </Suspense>
        <p data-slot="version" className="text-caption text-text-subtle">
          {MESSAGES_INTERNE.version(VERSION)}
        </p>
      </div>
    </aside>
  );
}

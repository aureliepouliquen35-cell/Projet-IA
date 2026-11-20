import type { Metadata } from "next";
import { Suspense } from "react";

import { BoutonDeconnexion, RechargementSiRestauree } from "@/components/interne/bouton-deconnexion";
import { Logo } from "@/components/logo";
import { exigerChangementMotDePasse } from "@/server/garde";
import { MESSAGES_MOT_DE_PASSE } from "@/shared/messages";

import { FormulaireMotDePasse } from "./formulaire-mot-de-passe";

// I2 — Choisir un nouveau mot de passe (EXPERIENCE.md, FR-21), à l'adresse
// `/connexion/nouveau-mot-de-passe`. Imposé tant que le mot de passe
// temporaire n'est pas remplacé : le proxy y renvoie toute page interne, et
// `exigerUtilisateur` aussi en dernier recours (AD-7).
//
// Pas de menu latéral ni de nom : seulement le logo et « Se déconnecter »
// (FR-9), pour la personne qui s'est trompée de compte.
//
// Le formulaire n'est affiché qu'après la garde (`exigerChangementMotDePasse` :
// sans session → connexion ; mot de passe déjà choisi → « Demandes »), qui
// lit les cookies : il est donc sous `<Suspense>`, jamais dans la coque
// statique.

export const metadata: Metadata = {
  title: "Nouveau mot de passe — Nova Services",
};

export default function PageNouveauMotDePasse() {
  return (
    <div className="flex flex-1 flex-col bg-surface-muted">
      <RechargementSiRestauree />
      <header className="flex min-h-16 items-center justify-between gap-4 border-b bg-background px-gutter-mobile py-3 sm:px-gutter-desktop">
        <Logo />
        <BoutonDeconnexion />
      </header>
      <main className="flex flex-1 flex-col items-center px-gutter-mobile py-12">
        <div className="w-full max-w-[400px] rounded-lg border bg-background p-6 shadow-soft">
          <h1 className="mb-2 text-page-title text-text">{MESSAGES_MOT_DE_PASSE.titre}</h1>
          <p className="mb-6 text-body-sm text-text-muted">{MESSAGES_MOT_DE_PASSE.texte}</p>
          <Suspense fallback={<SqueletteFormulaire />}>
            <ContenuNouveauMotDePasse />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

/** Le formulaire, après la garde. */
async function ContenuNouveauMotDePasse() {
  await exigerChangementMotDePasse();
  return <FormulaireMotDePasse />;
}

/** Squelette (DESIGN.md) : blocs gris, visibles seulement après 300 ms. */
function SqueletteFormulaire() {
  return (
    <div data-slot="squelette" role="status" className="animate-apres-300ms flex flex-col gap-4">
      <span className="sr-only">Chargement…</span>
      <div className="h-[72px] rounded-sm bg-border" />
      <div className="h-[72px] rounded-sm bg-border" />
      <div className="h-11 rounded-md bg-border" />
    </div>
  );
}

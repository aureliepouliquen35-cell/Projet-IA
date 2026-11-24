import type { Metadata } from "next";
import { Suspense } from "react";

import { MESSAGES_SAISIE } from "@/shared/messages";

import { ContenuSaisie, SqueletteSaisie } from "./contenu-saisie";

// I5 — Nouvelle demande (FR-30) : `/demandes/nouvelle`, ouvert depuis le
// menu « Nouvelle demande », le bouton de la liste (I3) et son état vide.
// Une colonne de 560 px : le formulaire public (P1), avec en plus le canal
// et la case « La personne a été informée de l'usage de ses données ».
//
// Le titre est dans la coque statique. Les catégories et le contact données
// changent sans mise en production (FR-26, FR-31) et la lecture passe par
// la session : `ContenuSaisie` les lit à chaque visite, sous `<Suspense>`.
// Pendant la lecture, le squelette apparaît après 300 ms.
//
// Comme toute page interne, le contenu vérifie lui-même la personne
// connectée (`exigerUtilisateur`, AD-7) avant toute lecture. Si le
// formulaire ne peut pas être lu, l'erreur remonte : écran S3.

export const metadata: Metadata = {
  title: `${MESSAGES_SAISIE.titre} — Nova Services`,
};

export default function PageNouvelleDemande() {
  return (
    <main className="mx-auto w-full max-w-content flex-1 px-gutter-mobile py-8 sm:px-gutter-desktop">
      <div className="w-full max-w-form">
        <h1 className="text-page-title text-text">{MESSAGES_SAISIE.titre}</h1>
        <p className="mt-1.5 mb-5 text-body text-text-muted">{MESSAGES_SAISIE.sousTitre}</p>
        <div className="rounded-lg border bg-background p-5 shadow-soft sm:p-6">
          <Suspense fallback={<SqueletteSaisie />}>
            <ContenuSaisie />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

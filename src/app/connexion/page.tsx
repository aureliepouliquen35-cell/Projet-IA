import type { Metadata } from "next";

import { Logo } from "@/components/logo";
import { MESSAGES_CONNEXION } from "@/shared/messages";

import { FormulaireConnexion } from "./formulaire-connexion";

// I1 — Connexion (EXPERIENCE.md), à l'adresse `/connexion` : toute page
// interne ouverte sans session y renvoie (FR-10). Page publique, sans
// lecture de cookies : elle fait partie de la coque statique.
//
// Le lien « Mot de passe oublié ? » est un bonus (Could) : tant qu'il
// n'existe pas, un simple texte le remplace.

export const metadata: Metadata = {
  title: "Connexion — Nova Services",
};

export default function PageConnexion() {
  return (
    <main className="flex flex-1 flex-col items-center bg-surface-muted px-gutter-mobile py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-lg border bg-background p-6 shadow-soft">
          <h1 className="mb-6 text-page-title text-text">{MESSAGES_CONNEXION.titre}</h1>
          <FormulaireConnexion />
          <p className="mt-5 text-body-sm text-text-muted">{MESSAGES_CONNEXION.motDePasseOublie}</p>
        </div>
      </div>
    </main>
  );
}

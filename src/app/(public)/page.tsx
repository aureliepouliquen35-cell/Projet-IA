import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { Logo } from "@/components/logo";
import { lireContactsNova, lireFormulaireDepot } from "@/server/depot";

import { FormulaireDepot } from "./formulaire-depot";

// P1 — Formulaire de dépôt (EXPERIENCE.md), à l'adresse `/` : page publique,
// sans connexion, pensée pour le téléphone (une colonne, marges de 16 px,
// 560 px au plus sur grand écran).
//
// L'en-tête et le titre forment la coque statique de la page. Les catégories
// et les contacts (« données personnelles », téléphone et email de Nova)
// changent sans mise en production
// (FR-26, FR-31) : ils sont lus à chaque visite, sous `<Suspense>`, jamais
// dans la coque.

export const metadata: Metadata = {
  title: "Déposer une demande — Nova Services",
};

export default function PageDepot() {
  return (
    <main className="mx-auto w-full max-w-form flex-1 px-gutter-mobile pb-12">
      <header className="-mx-gutter-mobile mb-5 border-b px-gutter-mobile py-4">
        <Logo />
      </header>

      <h1 className="text-page-title text-text">Déposer une demande</h1>
      <p className="mt-1.5 mb-4 text-body text-text-muted">
        Nous vous répondons par email ou par téléphone.
      </p>

      <Suspense fallback={<SqueletteFormulaire />}>
        <FormulaireCharge />
      </Suspense>
    </main>
  );
}

/**
 * Lit les catégories actives, le contact données et les contacts de Nova
 * (téléphone et email, montrés si l'envoi tombe en panne), puis affiche le
 * formulaire. Si la base est injoignable, l'erreur remonte : la page affiche
 * l'écran S3 (`error.tsx`).
 */
async function FormulaireCharge() {
  // Lecture à chaque visite, jamais pendant la compilation.
  await connection();
  const [{ categories, contactDonnees }, contacts] = await Promise.all([
    lireFormulaireDepot(),
    lireContactsNova(),
  ]);

  return (
    <FormulaireDepot
      categories={categories}
      contactDonnees={contactDonnees}
      contacts={contacts}
    />
  );
}

/**
 * Squelette de chargement (DESIGN.md) : des blocs gris à la forme du
 * formulaire, sans animation. Il n'apparaît qu'après 300 ms, pour ne pas
 * clignoter quand le formulaire arrive vite (EXPERIENCE.md, State Patterns).
 */
function SqueletteFormulaire() {
  return (
    <div
      data-slot="squelette"
      role="status"
      className="animate-apres-300ms flex flex-col gap-4"
    >
      {/* Texte lu par les lecteurs d'écran, invisible à l'écran. */}
      <span className="sr-only">Chargement du formulaire…</span>
      <div className="h-4 w-56 rounded-sm bg-border" />
      {[0, 1, 2, 3, 4, 5].map((ligne) => (
        <div key={ligne} className="flex flex-col gap-1.5">
          <div className="h-4 w-28 rounded-sm bg-border" />
          <div className="h-control rounded-sm bg-border" />
        </div>
      ))}
      <div className="h-28 rounded-sm bg-border" />
      <div className="h-control rounded-sm bg-border" />
    </div>
  );
}

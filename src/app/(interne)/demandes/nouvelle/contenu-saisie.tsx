import { connection } from "next/server";

import { exigerUtilisateur } from "@/server/garde";
import { lireFormulaireSaisie } from "@/server/lectures/saisie";
import { MESSAGES_SAISIE } from "@/shared/messages";

import { FormulaireSaisie } from "./formulaire-saisie";

// Contenu de « Nouvelle demande » (I5). Comme toute lecture interne, il
// vérifie d'abord la personne connectée (AD-7) : sans session, ou avec un
// compte inactif, renvoi vers la connexion. Puis il lit les catégories
// actives et le contact données (`lire_formulaire_saisie`) et affiche le
// formulaire. Si la lecture échoue, l'erreur remonte : écran S3.

export async function ContenuSaisie() {
  // Lecture à chaque visite, jamais pendant la préparation de la page : la
  // lecture de la session par Supabase consulte l'heure (`Date.now()`), ce
  // que Cache Components interdit avant une vraie requête.
  await connection();
  await exigerUtilisateur();
  const { categories, contactDonnees } = await lireFormulaireSaisie();
  return <FormulaireSaisie categories={categories} contactDonnees={contactDonnees} />;
}

/**
 * Squelette de chargement (DESIGN.md) : des blocs gris à la forme du
 * formulaire (le canal, puis les champs), sans animation, visibles
 * seulement après 300 ms.
 */
export function SqueletteSaisie() {
  return (
    <div data-slot="squelette" role="status" className="animate-apres-300ms flex flex-col gap-4">
      <span className="sr-only">{MESSAGES_SAISIE.chargement}</span>
      <div className="h-4 w-56 rounded-sm bg-border" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-control rounded-sm bg-border" />
        <div className="h-control rounded-sm bg-border" />
      </div>
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

import { renderToStaticMarkup } from "react-dom/server";

import {
  ETAT_DEPOT_INITIAL,
  VueFormulaireDepot,
  type EtatDepot,
} from "@/app/(public)/formulaire-depot";
import type { ValeursDepot } from "@/shared/schemas/depot";

// Aides des tests du formulaire de dépôt (P1) : les données d'essai et le
// rendu de l'écran sans état. Les fichiers qui s'en servent simulent
// eux-mêmes la Server Function (`vi.mock`).

/** Les cinq catégories de départ (FR-26), comme la base les renvoie. */
export const CATEGORIES = [
  { id: "11111111-1111-4111-8111-111111111111", nom: "Demande d'information" },
  { id: "22222222-2222-4222-8222-222222222222", nom: "Problème technique" },
  { id: "33333333-3333-4333-8333-333333333333", nom: "Demande de rendez-vous" },
  { id: "44444444-4444-4444-8444-444444444444", nom: "Question administrative" },
  { id: "55555555-5555-4555-8555-555555555555", nom: "Autre" },
];

export const CONTACT_DONNEES = "donnees@nova-services.example";

/** La saisie de Claire (EXPERIENCE.md, Flux 1), complète et correcte. */
export const SAISIE_DE_CLAIRE: ValeursDepot = {
  nom: "Claire Martin",
  email: "claire.martin@cabinet-martin.fr",
  telephone: "",
  entreprise: "Cabinet Martin Expertise",
  categorieId: CATEGORIES[1].id,
  objet: "Accès impossible à l'outil de facturation",
  description:
    "Depuis ce matin, l'outil de facturation affiche « session refusée ».\nJ'ai redémarré le poste, sans effet.",
  personneInformee: true,
};

export function etatAvec(modifications: Partial<EtatDepot> = {}): EtatDepot {
  return { ...ETAT_DEPOT_INITIAL, ...modifications };
}

export function rendreVue(
  etat: EtatDepot = ETAT_DEPOT_INITIAL,
  options: { envoiEnCours?: boolean } = {},
): string {
  return renderToStaticMarkup(
    <VueFormulaireDepot
      categories={CATEGORIES}
      contactDonnees={CONTACT_DONNEES}
      etat={etat}
      envoiEnCours={options.envoiEnCours}
    />,
  );
}

/** Le texte visible d'un morceau de HTML, sans ses balises. */
export function texteDe(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

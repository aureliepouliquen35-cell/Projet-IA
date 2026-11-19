import { renderToStaticMarkup } from "react-dom/server";

import {
  ETAT_DEPOT_INITIAL,
  VueFormulaireDepot,
  type EtatDepot,
} from "@/app/(public)/formulaire-depot";
import type { ContactsNova } from "@/shared/contacts";
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

/** Contacts de Nova (FR-31), valeurs fictives de la migration 1.3. */
export const CONTACTS_NOVA: ContactsNova = {
  telephone: "01 99 00 00 00",
  emailContact: "contact@nova-services.example",
};

/** Un numéro d'envoi (UUID), comme le formulaire en tire un (AD-20). */
export const NUMERO_ENVOI = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

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

/** La ligne que `deposer_demande` renvoie pour la demande de Claire. */
export const LIGNE_DEPOSEE = {
  reference: "NOVA-2026-0001",
  objet: SAISIE_DE_CLAIRE.objet,
  email: SAISIE_DE_CLAIRE.email,
};

export function etatAvec(modifications: Partial<EtatDepot> = {}): EtatDepot {
  return { ...ETAT_DEPOT_INITIAL, ...modifications };
}

export function rendreVue(
  etat: EtatDepot = ETAT_DEPOT_INITIAL,
  options: { envoiEnCours?: boolean; contacts?: ContactsNova } = {},
): string {
  return renderToStaticMarkup(
    <VueFormulaireDepot
      categories={CATEGORIES}
      contactDonnees={CONTACT_DONNEES}
      contacts={options.contacts ?? CONTACTS_NOVA}
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

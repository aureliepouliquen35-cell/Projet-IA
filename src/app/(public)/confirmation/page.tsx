import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { lireContactsNova } from "@/server/depot";
import { lireConfirmation } from "@/server/passage";

import { VueConfirmation } from "./vue-confirmation";

// P2 — Confirmation (EXPERIENCE.md), à l'adresse `/confirmation`. L'adresse
// ne contient rien de la demande (AD-20) : la référence, l'objet et l'email
// viennent du cookie de passage chiffré posé par l'envoi du formulaire,
// valable 30 minutes. Actualiser la page réaffiche donc la même référence,
// sans rien créer (FR-4).
//
// Sans cookie valable (adresse ouverte directement, cookie expiré, modifié ou
// d'un autre type) : retour au formulaire P1, sans rien afficher.
//
// La page attend le cookie avant d'afficher quoi que ce soit
// (`instant = false`, sans `<Suspense>`) : aucune coque, même le logo, n'est
// montrée avant de savoir s'il y a une demande à afficher. Avec Cache
// Components, la réponse est tout de même diffusée en continu : le renvoi
// vers `/` est fait par le navigateur (réponse 200 vide, puis remplacement de
// l'adresse), pas par un code HTTP 307.

export const instant = false;

export const metadata: Metadata = {
  title: "Demande enregistrée — Nova Services",
};

export default async function PageConfirmation() {
  const confirmation = await lireConfirmation();
  if (!confirmation) redirect("/");

  // Contacts relus à chaque affichage (FR-31). Base injoignable : l'erreur
  // remonte, la page affiche l'écran S3.
  const contacts = await lireContactsNova();

  return <VueConfirmation confirmation={confirmation} contacts={contacts} />;
}

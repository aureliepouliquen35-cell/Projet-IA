import type { Instrumentation } from "next";

import { codeDepuisErreur } from "@/shared/code-support";

// Erreurs serveur captées par Next.js pendant l'affichage d'une page (AD-12).
// Elles sont écrites dans `journal_technique` avec le code court calculé
// depuis l'empreinte (`digest`) de Next.js : le même que celui affiché par
// l'écran S3.
//
// Jamais le message de l'erreur ni les paramètres de l'adresse : ils peuvent
// contenir des données d'un demandeur (AD-13).
export const onRequestError: Instrumentation.onRequestError = async (
  erreur,
  requete,
  contexte,
) => {
  // Chargé seulement quand une erreur survient.
  const { journaliser } = await import("@/server/journal");

  await journaliser(
    "erreur",
    "erreur_inattendue",
    {
      page: cheminSansParametres(requete.path),
      route: contexte.routePath,
      type: contexte.routeType,
    },
    codeDepuisErreur(erreur),
  );
};

function cheminSansParametres(chemin: string): string {
  return chemin.split(/[?#]/, 1)[0] || "/";
}

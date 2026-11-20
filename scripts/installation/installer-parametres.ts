import { parseArgs } from "node:util";

import { installerParametres, preparerInstallation } from "@/server/admin";
import { resumeErreurs } from "@/shared/messages";
import { validerParametres } from "@/shared/schemas/parametres";

import { afficherEchec, confirmer, entreesSortiesConsole, type EntreesSorties } from "./commun";

// Coordonnées de Nova affichées aux demandeurs (FR-31), saisies depuis le
// poste lors de l'installation (docs/deploiement.md). Elles remplacent les
// valeurs d'exemple de la migration ; ensuite, l'écran A3 (story 4.3) les
// modifie.
//
//   npm run parametres:installer -- --telephone "01 23 45 67 89" --email-contact contact@… --contact-donnees donnees@…

export const USAGE_INSTALLER_PARAMETRES =
  'Utilisation : npm run parametres:installer -- [--telephone "01 23 45 67 89"] --email-contact contact@exemple.fr --contact-donnees "donnees@exemple.fr"';

/** Option de la commande qui correspond à chaque champ. */
const OPTIONS: Record<string, string> = {
  telephone: "--telephone",
  emailContact: "--email-contact",
  contactDonnees: "--contact-donnees",
};

export default async function commandeInstallerParametres(
  args: string[],
  es: EntreesSorties = entreesSortiesConsole(),
): Promise<number> {
  let valeurs: { telephone?: string; "email-contact"?: string; "contact-donnees"?: string };
  try {
    ({ values: valeurs } = parseArgs({
      args,
      options: {
        telephone: { type: "string" },
        "email-contact": { type: "string" },
        "contact-donnees": { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    es.erreur(USAGE_INSTALLER_PARAMETRES);
    return 1;
  }

  const preparation = preparerInstallation();
  if (!preparation.ok) {
    es.erreur(preparation.message);
    return 1;
  }

  const saisie = {
    telephone: valeurs.telephone,
    emailContact: valeurs["email-contact"],
    contactDonnees: valeurs["contact-donnees"],
  };

  // Saisie vérifiée avant de demander la confirmation.
  const validation = validerParametres(saisie);
  if (!validation.ok) {
    afficherEchec(
      es,
      { message: resumeErreurs(Object.keys(validation.champs).length), champs: validation.champs },
      OPTIONS,
    );
    es.erreur(USAGE_INSTALLER_PARAMETRES);
    return 1;
  }
  const { telephone, emailContact, contactDonnees } = validation.donnees;

  const confirme = await confirmer(es, preparation.donnees.adresseProjet, [
    "Informations affichées aux demandeurs, qui remplacent les actuelles :",
    `  Téléphone de contact                 : ${telephone ?? "(aucun)"}`,
    `  Email de contact                     : ${emailContact}`,
    `  Contact pour les données personnelles : ${contactDonnees}`,
  ]);
  if (!confirme) return 1;

  const resultat = await installerParametres(saisie);
  if (!resultat.ok) {
    afficherEchec(es, resultat, OPTIONS);
    return 1;
  }

  es.ecrire("");
  es.ecrire("Informations mises à jour. Elles sont visibles immédiatement.");
  return 0;
}

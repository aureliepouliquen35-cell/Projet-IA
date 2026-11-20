import { parseArgs } from "node:util";

import { creerCompte, genererMotDePasseTemporaire, preparerInstallation } from "@/server/admin";
import { resumeErreurs } from "@/shared/messages";
import { validerCompte } from "@/shared/schemas/compte";

import { afficherEchec, confirmer, entreesSortiesConsole, type EntreesSorties } from "./commun";

// Création d'un compte interne depuis le poste (procédure d'installation,
// docs/deploiement.md) : le premier administrateur, et le collaborateur de
// test sur dev. Les comptes suivants se créent depuis l'écran A1.
//
//   npm run compte:creer -- --nom "Sophie Martin" --email sophie@exemple.fr --role administrateur
//
// Le mot de passe temporaire est tiré au hasard et affiché une seule fois.

export const USAGE_CREER_COMPTE =
  'Utilisation : npm run compte:creer -- --nom "Prénom Nom" --email nom@exemple.fr --role administrateur|collaborateur';

/** Option de la commande qui correspond à chaque champ. */
const OPTIONS: Record<string, string> = {
  nom: "--nom",
  email: "--email",
  role: "--role",
  motDePasseTemporaire: "mot de passe temporaire",
};

const LIBELLES_ROLE: Record<string, string> = {
  collaborateur: "Collaborateur",
  administrateur: "Administrateur",
};

export default async function commandeCreerCompte(
  args: string[],
  es: EntreesSorties = entreesSortiesConsole(),
): Promise<number> {
  let valeurs: { nom?: string; email?: string; role?: string };
  try {
    ({ values: valeurs } = parseArgs({
      args,
      options: {
        nom: { type: "string" },
        email: { type: "string" },
        role: { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    es.erreur(USAGE_CREER_COMPTE);
    return 1;
  }

  const preparation = preparerInstallation();
  if (!preparation.ok) {
    es.erreur(preparation.message);
    return 1;
  }

  const motDePasseTemporaire = genererMotDePasseTemporaire();
  // « Administrateur » ou « administrateur » : le rôle s'écrit en minuscules.
  const saisie = { ...valeurs, role: valeurs.role?.toLowerCase(), motDePasseTemporaire };

  // Saisie vérifiée avant de demander la confirmation.
  const validation = validerCompte(saisie);
  if (!validation.ok) {
    afficherEchec(
      es,
      { message: resumeErreurs(Object.keys(validation.champs).length), champs: validation.champs },
      OPTIONS,
    );
    es.erreur(USAGE_CREER_COMPTE);
    return 1;
  }
  const { nom, email, role } = validation.donnees;

  const confirme = await confirmer(es, preparation.donnees.adresseProjet, [
    "Compte à créer :",
    `  Nom   : ${nom}`,
    `  Email : ${email}`,
    `  Rôle  : ${LIBELLES_ROLE[role]}`,
  ]);
  if (!confirme) return 1;

  const resultat = await creerCompte(saisie);
  if (!resultat.ok) {
    afficherEchec(es, resultat, OPTIONS);
    return 1;
  }

  es.ecrire("");
  es.ecrire(`Compte créé : ${nom} (${email}), rôle ${LIBELLES_ROLE[role]}.`);
  es.ecrire(`Mot de passe temporaire : ${motDePasseTemporaire}`);
  es.ecrire(
    "Il ne sera plus jamais affiché. Transmettez ce mot de passe vous-même à la personne. Elle devra le changer à sa première connexion.",
  );
  return 0;
}

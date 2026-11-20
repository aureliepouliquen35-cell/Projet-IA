import { preparerInstallation } from "@/server/admin";
import { deposerDemande, lireFormulaireDepot, type CategorieProposee } from "@/server/depot";
import { validerDepot, type DonneesDepot } from "@/shared/schemas/depot";

import { confirmer, entreesSortiesConsole, type EntreesSorties } from "../installation/commun";

// Données d'essai de la liste des demandes (story 1.8), sur le projet dev
// seulement :
//
//   npm run demandes:essai
//
// Dépose 30 demandes clairement fictives (emails en `@exemple.fr`) par le
// même chemin que le formulaire public (`src/server/depot`, fonction SQL
// `deposer_demande`) : chacune reçoit sa référence, le statut « Nouvelle »
// et son événement « Demande créée ». Avec plus de 25 demandes, la liste a
// deux pages.
//
// Chaque demande d'essai a un numéro d'envoi fixe (`numeroEnvoiEssai`) :
// relancer la commande renvoie les demandes déjà déposées au lieu d'en créer
// 30 autres (AD-20).
//
// N'accepte que les clés de `.env.local` (projet dev) : jamais la
// production. Le projet visé est affiché et « oui » est demandé avant d'agir.

export const USAGE_DEMANDES_ESSAI = "Utilisation : npm run demandes:essai (sans option)";

/** Seul fichier de clés accepté : celui du projet dev. */
export const FICHIER_CLES_DEV = ".env.local";

export const NOMBRE_DEMANDES_ESSAI = 30;

export const MESSAGE_FICHIER_REFUSE = `Cette commande ne s'exécute qu'avec les clés du projet dev (${FICHIER_CLES_DEV}), jamais en production. Lancez-la avec « npm run demandes:essai ».`;

const OBJETS = [
  "Accès impossible à l'outil de facturation",
  "Contrat de maintenance annuelle : tarifs",
  "Serveur de fichiers inaccessible",
  "Rendez-vous pour présenter votre offre",
  "Question sur la facture d'octobre",
  "Imprimante réseau hors ligne",
] as const;

const deuxChiffres = (n: number) => String(n).padStart(2, "0");

/**
 * Numéro d'envoi fixe de la demande d'essai n° `numero` (1 à 30) :
 * `00000000-0000-4000-8000-0000000000NN`, le même à chaque lancement.
 */
export function numeroEnvoiEssai(numero: number): string {
  return `00000000-0000-4000-8000-${String(numero).padStart(12, "0")}`;
}

/**
 * Les demandes fictives, réparties sur les catégories actives. Le numéro
 * figure dans le nom, l'email et l'objet : chaque ligne se repère dans la
 * liste.
 */
export function demandesEssai(categories: CategorieProposee[]): DonneesDepot[] {
  if (categories.length === 0) throw new Error("Aucune catégorie active.");
  return Array.from({ length: NOMBRE_DEMANDES_ESSAI }, (_, index) => {
    const numero = deuxChiffres(index + 1);
    const validation = validerDepot({
      nom: `Personne d'essai ${numero}`,
      email: `essai-${numero}@exemple.fr`,
      telephone: "",
      entreprise: index % 3 === 0 ? "Entreprise d'essai" : "",
      categorieId: categories[index % categories.length].id,
      objet: `Essai ${numero} — ${OBJETS[index % OBJETS.length]}`,
      description: `Demande fictive n° ${numero}, créée par « npm run demandes:essai » pour vérifier la liste des demandes.`,
      personneInformee: true,
    });
    if (!validation.ok) throw new Error(`Demande d'essai ${numero} invalide.`);
    return validation.donnees;
  });
}

export default async function commandeCreerDemandesEssai(
  args: string[],
  es: EntreesSorties = entreesSortiesConsole(),
): Promise<number> {
  if (args.length > 0) {
    es.erreur(USAGE_DEMANDES_ESSAI);
    return 1;
  }

  if (process.env.NOVA_FICHIER_CLES !== FICHIER_CLES_DEV) {
    es.erreur(MESSAGE_FICHIER_REFUSE);
    return 1;
  }

  const preparation = preparerInstallation();
  if (!preparation.ok) {
    es.erreur(preparation.message);
    return 1;
  }

  const confirme = await confirmer(es, preparation.donnees.adresseProjet, [
    `${NOMBRE_DEMANDES_ESSAI} demandes fictives (emails en @exemple.fr) vont être déposées,`,
    "comme sur le formulaire public : statut « Nouvelle », une référence chacune.",
  ]);
  if (!confirme) return 1;

  let deposees = 0;
  try {
    const { categories } = await lireFormulaireDepot();
    for (const [index, donnees] of demandesEssai(categories).entries()) {
      const resultat = await deposerDemande(donnees, numeroEnvoiEssai(index + 1));
      if (!resultat.ok) {
        es.erreur(`Demande refusée : ${Object.values(resultat.champs).join(" ; ")}`);
        break;
      }
      deposees += 1;
      es.ecrire(`  ${resultat.reference} — ${resultat.objet}`);
    }
  } catch (erreur) {
    es.erreur(erreur instanceof Error ? erreur.message : "Erreur inattendue.");
  }

  es.ecrire("");
  if (deposees < NOMBRE_DEMANDES_ESSAI) {
    es.erreur(`Arrêt : ${deposees} demande(s) déposée(s) sur ${NOMBRE_DEMANDES_ESSAI}.`);
    return 1;
  }
  es.ecrire(`${deposees} demandes d'essai en place (celles déjà déposées ne sont pas recréées).`);
  return 0;
}

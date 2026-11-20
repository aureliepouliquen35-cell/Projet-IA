import { createInterface } from "node:readline/promises";

import type { Echec } from "@/shared/reponse";

// Outils communs aux commandes d'installation (story 1.5).

/** Ce qu'une commande lit et écrit : la console, ou une simulation en test. */
export type EntreesSorties = {
  ecrire: (texte: string) => void;
  erreur: (texte: string) => void;
  /** Pose une question et renvoie la réponse (vide si rien n'est tapé). */
  demander: (question: string) => Promise<string>;
};

export function entreesSortiesConsole(): EntreesSorties {
  return {
    ecrire: (texte) => process.stdout.write(`${texte}\n`),
    erreur: (texte) => process.stderr.write(`${texte}\n`),
    demander: async (question) => {
      const lecture = createInterface({ input: process.stdin, output: process.stdout });
      try {
        // Entrée fermée sans réponse : réponse vide, donc refus.
        return await new Promise<string>((resoudre) => {
          lecture.once("close", () => resoudre(""));
          lecture.question(question).then(resoudre, () => resoudre(""));
        });
      } finally {
        lecture.close();
      }
    },
  };
}

/**
 * Montre le projet visé et ce qui va être fait, puis demande « oui ».
 * Toute autre réponse annule : rien n'est fait.
 */
export async function confirmer(
  es: EntreesSorties,
  adresseProjet: string,
  resume: string[],
): Promise<boolean> {
  es.ecrire("");
  es.ecrire(`Projet Supabase visé : ${adresseProjet}`);
  for (const ligne of resume) es.ecrire(ligne);
  es.ecrire("");
  const reponse = await es.demander("Tapez « oui » pour continuer : ");
  if (reponse.trim().toLowerCase() === "oui") return true;
  es.erreur("Annulé : rien n'a été fait.");
  return false;
}

/** Message d'échec, avec l'erreur de chaque option concernée. */
export function afficherEchec(
  es: EntreesSorties,
  reponse: Pick<Echec, "message" | "champs" | "codeSupport">,
  options: Record<string, string>,
): void {
  es.erreur(reponse.message);
  for (const [champ, message] of Object.entries(reponse.champs ?? {})) {
    es.erreur(`  ${options[champ] ?? champ} : ${message}`);
  }
  if (reponse.codeSupport) es.erreur(`Code pour le support : ${reponse.codeSupport}`);
}

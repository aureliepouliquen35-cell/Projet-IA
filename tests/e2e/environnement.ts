import { existsSync } from "node:fs";
import { join } from "node:path";

// Réglages du test de bout en bout SM-1 (story 1.12), partagés par
// `playwright.config.ts`, `parcours-sm1.spec.ts` et le test Vitest
// `tests/socle/mise-en-ligne.test.ts`.
//
// - Le test ne tourne que sur dev (AD-17) : l'adresse visée doit être locale
//   (`localhost` ou `127.0.0.1`), jamais la production.
// - Les identifiants du compte de test sont lus dans `.env.local` (ignoré par
//   git, AD-15) : `E2E_EMAIL` et `E2E_MOT_DE_PASSE`. Ils ne sont jamais
//   écrits dans le dépôt ni affichés.

export const FICHIER_ENV = ".env.local";

export const ADRESSE_PAR_DEFAUT = "http://localhost:3000";

const HOTES_LOCAUX: readonly string[] = ["localhost", "127.0.0.1"];

/**
 * Charge `.env.local` dans `process.env`, s'il existe. Une variable déjà
 * présente dans l'environnement garde sa valeur (`E2E_ADRESSE=… npm run
 * test:e2e` l'emporte sur le fichier).
 */
export function chargerEnvLocal(racine: string = process.cwd()): void {
  const chemin = join(racine, FICHIER_ENV);
  if (existsSync(chemin)) process.loadEnvFile(chemin);
}

/**
 * Adresse de l'application à tester : `E2E_ADRESSE`, ou
 * `http://localhost:3000`. Seule une adresse locale en `http:`, avec son
 * port, est acceptée : c'est ce que sert `next dev`.
 */
export function adresseDev(valeur: string | undefined): URL {
  const texte = valeur?.trim() || ADRESSE_PAR_DEFAUT;
  const refus = new Error(
    `E2E_ADRESSE vaut « ${texte} » : le test ne tourne que sur dev, à une adresse locale ` +
      "(http://localhost:<port> ou http://127.0.0.1:<port>). Il ne vise jamais la production.",
  );
  let adresse: URL;
  try {
    adresse = new URL(texte);
  } catch {
    throw refus;
  }
  if (adresse.protocol !== "http:" || adresse.port === "" || !HOTES_LOCAUX.includes(adresse.hostname)) {
    throw refus;
  }
  return adresse;
}

export type IdentifiantsE2e = { email: string; motDePasse: string };

/**
 * Identifiants du compte de test (collaborateur du projet dev). Si l'un
 * manque, le message dit quoi ajouter dans `.env.local`, sans rien afficher
 * de ce qui y est déjà.
 */
export function identifiantsE2e(env: Record<string, string | undefined>): IdentifiantsE2e {
  const email = env.E2E_EMAIL?.trim() ?? "";
  // Le mot de passe est rendu tel quel, mais un mot de passe fait seulement
  // d'espaces compte comme absent.
  const motDePasse = env.E2E_MOT_DE_PASSE ?? "";
  const manquantes = [
    email === "" ? "E2E_EMAIL=<email du compte de test>" : null,
    motDePasse.trim() === "" ? "E2E_MOT_DE_PASSE=<son mot de passe>" : null,
  ].filter((ligne): ligne is string => ligne !== null);
  if (manquantes.length > 0) {
    throw new Error(
      `Identifiants du compte de test manquants. Ajoutez dans ${FICHIER_ENV} ` +
        `(jamais dans le dépôt) : ${manquantes.join(" et ")}. ` +
        "Il s'agit d'un compte collaborateur du projet dev, qui a déjà choisi son mot de passe " +
        "(docs/deploiement.md, partie « Mise en ligne », étape 1 « Tout vérifier sur dev »).",
    );
  }
  return { email, motDePasse };
}

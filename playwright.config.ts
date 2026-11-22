import { defineConfig, devices } from "@playwright/test";

import { adresseDev, chargerEnvLocal, identifiantsE2e } from "./tests/e2e/environnement";

// Test de bout en bout du parcours SM-1 (story 1.12) : `npm run test:e2e`.
//
// Il tourne sur dev seulement (AD-17) : l'application locale, reliée au
// projet Supabase dev par `.env.local`. Toute adresse non locale est refusée,
// et les identifiants manquants arrêtent tout avant d'ouvrir le navigateur.
// Le serveur `npm run dev` est lancé s'il ne tourne pas déjà.

chargerEnvLocal();

const adresse = adresseDev(process.env.E2E_ADRESSE);
identifiantsE2e(process.env);


export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  // Premier affichage des pages en développement : la compilation prend du temps.
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: adresse.origin,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${adresse.port}`,
    url: adresse.origin,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});

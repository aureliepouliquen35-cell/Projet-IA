import { expect, test, type Page } from "@playwright/test";

import { identifiantsE2e } from "./environnement";

// Filtres de la liste (story 2.1, FR-13), sur dev uniquement
// (playwright.config.ts) : la vraie fonction SQL `lister_demandes` et le
// composant client. Un texte cherché puis « Statut : Nouvelle » donnent une
// adresse `?q=…&statut=nouvelle` (sans page) et une ligne de résultat à
// jour ; « Réinitialiser » ramène à `/demandes`, champ vide et « Tous ».
//
// Demande la migration `20261122140000_filtres_demandes.sql` sur dev.

/** Texte cherché : une lettre présente dans presque toutes les demandes d'essai. */
const TEXTE = "e";

/** Ligne de résultat annoncée : « 1 demande », « 42 demandes » ou « Aucune demande trouvée ». */
const MOTIF_RESULTAT = /^(\d[\d   ]* demandes?|Aucune demande trouvée)$/;

/** Connexion du compte de test (même déroulé que `parcours-sm1.spec.ts`). */
async function seConnecter(page: Page): Promise<void> {
  const { email, motDePasse } = identifiantsE2e(process.env);
  await page.goto("/connexion");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(motDePasse);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.locator("[data-slot=nom-utilisateur]").filter({ visible: true })).toBeVisible();
  await expect(page).toHaveURL(/\/demandes/);
}

test("filtres : recherche + Statut Nouvelle, puis Réinitialiser", async ({ page }) => {
  await seConnecter(page);

  const recherche = page.getByRole("searchbox", { name: /Rechercher par référence/ });
  const statut = page.getByLabel("Statut :");
  const annonce = page.locator("[data-slot=annonce-resultats]");
  const resultats = page.locator("[data-slot=resultats]");

  // 1. Texte cherché (Entrée : tout de suite).
  await recherche.fill(TEXTE);
  await recherche.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/demandes\\?q=${TEXTE}$`));
  await expect(resultats).not.toHaveAttribute("aria-busy", "true");

  // 2. « Statut : Nouvelle » : appliqué tout de suite, avec le texte, à la page 1.
  await statut.selectOption("nouvelle");
  await expect(page).toHaveURL(new RegExp(`/demandes\\?q=${TEXTE}&statut=nouvelle$`));
  await expect(resultats).not.toHaveAttribute("aria-busy", "true");
  await expect(annonce).toHaveText(MOTIF_RESULTAT);
  const lignes = page.locator("[data-slot=ligne-demande]");
  for (const ligne of await lignes.all()) await expect(ligne).toContainText("Nouvelle");
  if ((await lignes.count()) > 0) {
    await expect(resultats.locator("strong").first()).toHaveText(await annonce.innerText());
  }

  // 3. « Réinitialiser » de la rangée de filtres : toute la liste.
  await page.locator("[data-slot=filtres]").getByRole("link", { name: "Réinitialiser" }).click();
  await expect(page).toHaveURL(/\/demandes$/);
  await expect(recherche).toHaveValue("");
  await expect(statut).toHaveValue("");
  await expect(statut.locator("option:checked")).toHaveText("Tous");
  await expect(page.locator("[data-slot=filtres]").getByRole("link", { name: "Réinitialiser" })).toHaveCount(0);
});

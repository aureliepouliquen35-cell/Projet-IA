import { expect, test, type Locator, type Page } from "@playwright/test";

import { identifiantsE2e } from "./environnement";

// Demandes à traiter (story 2.2, FR-14), sur dev uniquement
// (playwright.config.ts) : la vraie fonction SQL `lister_demandes` avec
// `p_a_traiter`, le vrai compteur et la pastille du menu.
//
// Une demande est d'abord déposée sur le formulaire public (elle est
// *Nouvelle*, donc à traiter). Le collaborateur de test clique sur la carte
// « N à traiter » alors qu'une recherche tapée attend encore : l'adresse
// devient `/demandes?a_traiter=oui`, le champ est vide, le filtre « À
// traiter » est actif, la liste ne montre aucune demande *Traitée* et
// montre la sienne. Il ajoute un canal, éteint et rallume « À traiter »,
// passe la demande *En cours* et revient à la liste par le fil d'Ariane :
// la carte et la pastille ont baissé de 1, et la liste filtrée ne la montre
// plus.
//
// La demande créée reste sur dev, avec l'objet « Essai automatique à
// traiter … ». Demande la migration `20261124140000_filtre_a_traiter.sql`
// sur dev. Un autre essai lancé en même temps sur dev fausserait les
// nombres.

const MOTIF_REFERENCE = /^NOVA-\d{4}-\d{4,}$/;

/** Horodatage de l'objet (UTC) : un objet différent à chaque essai. */
function horodatage(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/** Dépôt d'une demande sur le formulaire public (même déroulé que `parcours-sm1.spec.ts`). */
async function deposerDemande(page: Page, objet: string): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Nom et prénom").fill("Essai Automatique");
  await page.getByLabel("Email").fill("essai.automatique@exemple.fr");
  await page.getByLabel("Catégorie").selectOption({ index: 1 });
  await page.getByLabel("Objet").fill(objet);
  await page.getByLabel("Description").fill("Demande créée par le test automatique des demandes à traiter (story 2.2).");
  await page.getByRole("checkbox", { name: /J'ai pris connaissance/ }).check();
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  const reference = page.locator("[data-slot=reference]");
  await expect(reference).toHaveText(MOTIF_REFERENCE);
  return (await reference.innerText()).trim();
}

/** Connexion du compte de test (même déroulé que `filtres-demandes.spec.ts`). */
async function seConnecter(page: Page): Promise<void> {
  const { email, motDePasse } = identifiantsE2e(process.env);
  await page.goto("/connexion");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(motDePasse);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.locator("[data-slot=nom-utilisateur]").filter({ visible: true })).toBeVisible();
  await expect(page).toHaveURL(/\/demandes/);
}

/** Nombre affiché (« 1 234 » → 1234) ; échoue sur « — ». */
async function nombre(element: Locator): Promise<number> {
  const texte = (await element.innerText()).replace(/\D/g, "");
  expect(texte, "compteur lisible").not.toBe("");
  return Number(texte);
}

test("à traiter : clic sur la carte, puis passage En cours → compteur et pastille −1", async ({ page }) => {
  const objet = `Essai automatique à traiter ${horodatage()}`;
  const reference = await deposerDemande(page, objet);
  await seConnecter(page);

  const carte = page.locator("[data-slot=carte-a-traiter]");
  const chiffre = carte.locator("[data-slot=nombre-a-traiter]");
  const pastille = page.locator("[data-slot=pastille-a-traiter]").filter({ visible: true });
  const filtre = page.locator("[data-slot=filtre-a-traiter]");
  const annonce = page.locator("[data-slot=annonce-resultats]");
  const lignes = page.locator("[data-slot=ligne-demande]");

  await expect(chiffre).toHaveText(/^\d/);
  const avant = await nombre(chiffre);
  expect(avant).toBeGreaterThanOrEqual(1);
  expect(await nombre(pastille)).toBe(avant);
  await expect(filtre).toHaveAttribute("aria-pressed", "false");

  const recherche = page.getByRole("searchbox", { name: /Rechercher par référence/ });
  const canal = page.getByLabel("Canal :");
  const resultats = page.locator("[data-slot=resultats]");

  // 1. Une recherche tapée (encore en attente de ses 300 ms), puis clic sur
  // la carte : la liste des demandes à traiter, repartie de zéro.
  await recherche.fill("zzz");
  await carte.click();
  await expect(page).toHaveURL(/\/demandes\?a_traiter=oui$/);
  await expect(recherche).toHaveValue("");
  await expect(filtre).toHaveAttribute("aria-pressed", "true");
  await expect(annonce).toHaveText(avant > 1 ? new RegExp(`^${avant.toLocaleString("fr-FR").replace(/\s/g, "\\s")} demandes$`) : /^1 demande$/);
  // AD-5 : à traiter = Nouvelle, ou Urgente non Traitée. Aucune Traitée.
  for (const ligne of await lignes.all()) await expect(ligne).not.toContainText("Traitée");
  await expect(page.locator("[data-slot=filtres]").getByRole("link", { name: "Réinitialiser" })).toBeVisible();
  await expect(lignes.filter({ hasText: reference })).toHaveCount(1);
  // La frappe abandonnée ne repart pas après coup.
  await page.waitForTimeout(600);
  await expect(page).toHaveURL(/\/demandes\?a_traiter=oui$/);

  // 2. Même chose quand l'adresse est déjà `?a_traiter=oui`.
  await recherche.fill("zzz");
  await carte.click();
  await expect(recherche).toHaveValue("");
  await page.waitForTimeout(600);
  await expect(page).toHaveURL(/\/demandes\?a_traiter=oui$/);
  await expect(resultats).not.toHaveAttribute("aria-busy", "true");
  await expect(lignes.filter({ hasText: reference })).toHaveCount(1);

  // 3. Un canal choisi garde « À traiter » ; le bouton s'éteint et se rallume.
  await canal.selectOption("formulaire");
  await expect(page).toHaveURL(/\/demandes\?canal=formulaire&a_traiter=oui$/);
  await expect(filtre).toHaveAttribute("aria-pressed", "true");
  await filtre.click();
  await expect(page).toHaveURL(/\/demandes\?canal=formulaire$/);
  await expect(filtre).toHaveAttribute("aria-pressed", "false");
  await expect(canal).toHaveValue("formulaire");
  await filtre.click();
  await expect(page).toHaveURL(/\/demandes\?canal=formulaire&a_traiter=oui$/);
  await expect(filtre).toHaveAttribute("aria-pressed", "true");
  await expect(resultats).not.toHaveAttribute("aria-busy", "true");
  const ligne = lignes.filter({ hasText: reference });
  await expect(ligne).toHaveCount(1);

  // 4. Détail (l'adresse garde les filtres), puis Nouvelle → En cours.
  await ligne.getByRole("link", { name: reference }).click();
  await expect(page).toHaveURL(new RegExp(`/demandes/${reference}\\?canal=formulaire&a_traiter=oui$`));
  await page.getByRole("button", { name: "Passer En cours" }).click();
  await expect(page.locator("ol[data-slot=historique] > li[data-slot=evenement]")).toHaveCount(2);

  // 5. Retour à la liste par le fil d'Ariane : toujours filtrée, un de moins.
  await page.getByRole("navigation", { name: "Fil d'Ariane" }).getByRole("link", { name: "Demandes" }).click();
  await expect(page).toHaveURL(/\/demandes\?canal=formulaire&a_traiter=oui$/);
  await expect(filtre).toHaveAttribute("aria-pressed", "true");
  await expect(chiffre).toHaveText(new RegExp(`^${(avant - 1).toLocaleString("fr-FR").replace(/\s/g, "\\s")}$`));
  expect(await nombre(pastille)).toBe(avant - 1);
  await expect(lignes.filter({ hasText: reference })).toHaveCount(0);

  // 6. Le bouton « À traiter » éteint le filtre : la demande revient (En cours).
  await filtre.click();
  await expect(page).toHaveURL(/\/demandes\?canal=formulaire$/);
  await expect(filtre).toHaveAttribute("aria-pressed", "false");
  await expect(lignes.filter({ hasText: reference })).toContainText("En cours");
});

import { expect, test, type Page } from "@playwright/test";

import { identifiantsE2e } from "./environnement";

// Retrouver les autres demandes d'un même demandeur (story 2.4, FR-12), sur
// dev uniquement (playwright.config.ts) : la vraie fonction SQL
// `lister_demandes` et le lien « Voir ses autres demandes » du détail.
//
// Une même personne (email unique à chaque essai) a deux demandes : l'une
// déposée sur le formulaire public, l'autre saisie par le collaborateur de
// test (canal Téléphone), puis passée *En cours*. Depuis le détail de la
// première, ouvert depuis une liste filtrée sur *Nouvelle*, « Voir ses
// autres demandes » ouvre `/demandes?q=<email>` : le filtre est retiré, le
// champ montre l'email, « 2 demandes », l'une *Nouvelle*, l'autre *En
// cours*. Taper l'email dans la recherche donne le même résultat.
//
// Les deux demandes restent sur dev, avec l'objet « Essai automatique
// doublon … ».

const MOTIF_REFERENCE = /^NOVA-\d{4}-\d{4,}$/;

/** Horodatage de l'objet (UTC) : un objet différent à chaque essai. */
function horodatage(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/** Dépôt d'une demande sur le formulaire public (même déroulé que `a-traiter.spec.ts`). */
async function deposerDemande(page: Page, email: string, objet: string): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Nom et prénom").fill("Essai Doublon");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Catégorie").selectOption({ index: 1 });
  await page.getByLabel("Objet").fill(objet);
  await page.getByLabel("Description").fill("Demande créée par le test automatique des doublons (story 2.4).");
  await page.getByRole("checkbox", { name: /J'ai pris connaissance/ }).check();
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  const reference = page.locator("[data-slot=reference]");
  await expect(reference).toHaveText(MOTIF_REFERENCE);
  return (await reference.innerText()).trim();
}

/** Connexion du compte de test (même déroulé que `a-traiter.spec.ts`). */
async function seConnecter(page: Page): Promise<void> {
  const { email, motDePasse } = identifiantsE2e(process.env);
  await page.goto("/connexion");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(motDePasse);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.locator("[data-slot=nom-utilisateur]").filter({ visible: true })).toBeVisible();
  await expect(page).toHaveURL(/\/demandes/);
}

/** Saisie interne d'une demande reçue par téléphone (même déroulé que `saisie-demande.spec.ts`). */
async function saisirDemande(page: Page, email: string, objet: string): Promise<string> {
  await page.goto("/demandes/nouvelle");
  const formulaire = page.locator("[data-slot=formulaire-saisie]");
  await formulaire.getByRole("radio", { name: "Téléphone" }).check();
  await formulaire.getByLabel("Nom et prénom").fill("Essai Doublon");
  await formulaire.getByRole("textbox", { name: "Email" }).fill(email);
  await formulaire.getByLabel("Catégorie").selectOption({ index: 1 });
  await formulaire.getByLabel("Objet").fill(objet);
  await formulaire.getByLabel("Description").fill("Demande saisie par le test automatique des doublons (story 2.4).");
  await formulaire.getByRole("checkbox", { name: /La personne a été informée/ }).check();
  await formulaire.getByRole("button", { name: "Enregistrer la demande" }).click();
  await expect(page).toHaveURL(/\/demandes\/NOVA-\d{4}-\d{4,}$/);
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

test("doublons : « Voir ses autres demandes » montre toutes ses demandes, quel que soit le statut", async ({ page }) => {
  const instant = horodatage();
  const email = `essai.doublon.${Date.now()}@exemple.fr`;
  const premiere = await deposerDemande(page, email, `Essai automatique doublon ${instant} (formulaire)`);
  await seConnecter(page);

  // 1. Seconde demande de la même personne, saisie puis passée En cours.
  const seconde = await saisirDemande(page, email, `Essai automatique doublon ${instant} (téléphone)`);
  await page.getByRole("button", { name: "Passer En cours" }).click();
  await expect(page.locator("ol[data-slot=historique] > li[data-slot=evenement]")).toHaveCount(2);

  // 2. Détail de la première, ouvert depuis une liste filtrée sur Nouvelle.
  await page.goto(`/demandes/${premiere}?statut=nouvelle&page=2`);
  const lien = page.getByRole("link", { name: "Voir ses autres demandes" });
  await expect(lien).toBeVisible();

  // 3. Le lien ouvre la liste cherchée sur l'email, sans le filtre.
  await lien.click();
  await expect(page).toHaveURL((adresse) => adresse.pathname === "/demandes" && adresse.search === `?q=${encodeURIComponent(email)}`);
  const recherche = page.getByRole("searchbox", { name: /Rechercher par référence/ });
  await expect(recherche).toHaveValue(email);
  await expect(page.locator("[data-slot=annonce-resultats]")).toHaveText("2 demandes");
  const lignes = page.locator("[data-slot=ligne-demande]");
  await expect(lignes).toHaveCount(2);
  await expect(lignes.filter({ hasText: premiere })).toContainText("Nouvelle");
  await expect(lignes.filter({ hasText: seconde })).toContainText("En cours");

  // 4. Taper l'email dans la recherche donne les mêmes demandes.
  await page.goto("/demandes");
  await recherche.fill(email.toUpperCase());
  await recherche.press("Enter");
  await expect(page.locator("[data-slot=annonce-resultats]")).toHaveText("2 demandes");
  await expect(lignes.filter({ hasText: premiere })).toHaveCount(1);
  await expect(lignes.filter({ hasText: seconde })).toHaveCount(1);
});

import { expect, test, type Page } from "@playwright/test";

import { identifiantsE2e } from "./environnement";

// Saisie d'une demande reçue par téléphone (story 2.3, FR-30, RM-12), sur
// dev uniquement (playwright.config.ts) : la vraie fonction SQL
// `saisir_demande`, le composant client et le toast.
//
// Le collaborateur de test ouvre « Nouvelle demande » depuis le menu,
// choisit Téléphone, remplit le formulaire, déplie « Texte à lui lire » et
// oublie la case : l'enregistrement est refusé, rien n'est perdu. Il coche
// la case et enregistre : le détail s'ouvre avec le toast « Demande NOVA-…
// créée », le canal Téléphone et l'historique à son nom. La liste filtrée
// sur le canal Téléphone la montre.
//
// La demande créée reste sur dev, avec l'objet « Essai automatique saisie … ».
// Demande la migration `20261124100000_saisie_demande.sql` sur dev.

const MOTIF_REFERENCE = /NOVA-\d{4}-\d{4,}/;

/** Horodatage de l'objet (UTC) : un objet différent à chaque essai. */
function horodatage(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/** Connexion du compte de test ; renvoie son nom, tel qu'affiché dans le menu. */
async function seConnecter(page: Page): Promise<string> {
  const { email, motDePasse } = identifiantsE2e(process.env);
  await page.goto("/connexion");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(motDePasse);
  await page.getByRole("button", { name: "Se connecter" }).click();
  const nom = page.locator("[data-slot=nom-utilisateur]").filter({ visible: true });
  await expect(nom).toBeVisible();
  await expect(page).toHaveURL(/\/demandes/);
  return (await nom.innerText()).trim();
}

test("saisie : case oubliée refusée, puis demande créée, détail et filtre Téléphone", async ({ page }) => {
  const nomConnecte = await seConnecter(page);
  const objet = `Essai automatique saisie ${horodatage()}`;

  // 1. Le menu ouvre I5 : le canal, les champs de P1 et la case.
  await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Nouvelle demande" }).click();
  await expect(page).toHaveURL(/\/demandes\/nouvelle$/);
  await expect(page.getByRole("heading", { name: "Nouvelle demande", level: 1 })).toBeVisible();
  const formulaire = page.locator("[data-slot=formulaire-saisie]");
  await expect(formulaire.getByRole("radio", { name: "Téléphone" })).not.toBeChecked();
  await expect(formulaire.getByRole("radio", { name: "Email" })).not.toBeChecked();

  // 2. Saisie complète, sauf la case ; « Texte à lui lire » déplie la mention.
  await formulaire.getByRole("radio", { name: "Téléphone" }).check();
  await formulaire.getByLabel("Nom et prénom").fill("Essai Saisie");
  // « Email » est aussi le nom d'un bouton radio du canal : le champ texte.
  await formulaire.getByRole("textbox", { name: "Email" }).fill("essai.saisie@exemple.fr");
  await formulaire.getByLabel("Catégorie").selectOption({ index: 1 });
  await formulaire.getByLabel("Objet").fill(objet);
  await formulaire.getByLabel("Description").fill("Demande saisie par le test automatique de la story 2.3.");
  await formulaire.getByRole("button", { name: "Texte à lui lire" }).click();
  await expect(formulaire.locator("#texte-a-lire")).toBeVisible();
  await expect(formulaire.locator("#texte-a-lire")).toContainText("conservées 3 ans");

  // 3. Case oubliée : refusé, message sous la case, rien n'est perdu.
  await formulaire.getByRole("button", { name: "Enregistrer la demande" }).click();
  await expect(formulaire.locator("[data-slot=resume-erreurs]")).toContainText("1 champ est à corriger");
  await expect(formulaire.locator("#personneInformee-erreur")).toHaveText(
    "Confirmez que la personne a été informée de l'usage de ses données",
  );
  await expect(page).toHaveURL(/\/demandes\/nouvelle$/);
  await expect(formulaire.getByLabel("Objet")).toHaveValue(objet);
  await expect(formulaire.getByRole("radio", { name: "Téléphone" })).toBeChecked();

  // 4. Case cochée : le détail s'ouvre, avec le toast.
  await formulaire.getByRole("checkbox", { name: /La personne a été informée/ }).check();
  await formulaire.getByRole("button", { name: "Enregistrer la demande" }).click();
  await expect(page).toHaveURL(/\/demandes\/NOVA-\d{4}-\d{4,}$/);
  const reference = new URL(page.url()).pathname.split("/").at(-1)!;
  expect(reference).toMatch(MOTIF_REFERENCE);
  await expect(page.getByText(`Demande ${reference} créée`)).toBeVisible();

  const detail = page.locator("[data-slot=detail-demande]");
  await expect(detail.getByRole("heading", { level: 1 })).toHaveText(objet);
  await expect(detail).toContainText("Téléphone");
  const creation = detail.locator("[data-slot=evenement]").first();
  await expect(creation).toContainText("Demande créée (canal : Téléphone)");
  await expect(creation).toContainText(nomConnecte);

  // 5. La liste filtrée sur le canal Téléphone la montre.
  await page.goto(`/demandes?canal=telephone&q=${encodeURIComponent(reference)}`);
  await expect(page.locator("[data-slot=ligne-demande]").filter({ hasText: reference })).toHaveCount(1);
});

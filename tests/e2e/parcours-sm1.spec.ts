import { expect, test, type Page } from "@playwright/test";

import { identifiantsE2e } from "./environnement";

// Parcours principal SM-1 (story 1.12) : un demandeur dépose une demande et
// reçoit sa référence ; un collaborateur connecté la retrouve par la
// recherche, la passe *En cours* puis *Traitée* ; l'historique montre les
// trois étapes, dans l'ordre.
//
// Sur dev uniquement (playwright.config.ts). La demande créée reste sur dev,
// avec l'objet « Essai automatique SM-1 … » : elle sert aussi à vérifier
// qu'elle n'apparaît pas en production.

const MOTIF_REFERENCE = /^NOVA-\d{4}-\d{4,}$/;

function echapper(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Horodatage de l'objet (« 2026-11-22 08:12:05 », UTC) : un objet différent à chaque essai. */
function horodatage(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

async function deposerDemande(page: Page, objet: string): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Nom et prénom").fill("Essai Automatique");
  await page.getByLabel("Email").fill("essai.automatique@exemple.fr");
  // Première vraie catégorie (l'option 0 est « Choisissez une catégorie »).
  await page.getByLabel("Catégorie").selectOption({ index: 1 });
  await page.getByLabel("Objet").fill(objet);
  await page
    .getByLabel("Description")
    .fill("Demande créée par le test automatique du parcours principal (SM-1).");
  await page.getByRole("checkbox", { name: /J'ai pris connaissance/ }).check();
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();

  await expect(
    page.getByRole("heading", { name: "Votre demande a bien été enregistrée" }),
  ).toBeVisible();
  const reference = page.locator("[data-slot=reference]");
  await expect(reference).toHaveText(MOTIF_REFERENCE);
  return (await reference.innerText()).trim();
}

/** Connexion du compte de test ; renvoie son nom, tel qu'affiché dans le menu. */
async function seConnecter(page: Page): Promise<string> {
  const { email, motDePasse } = identifiantsE2e(process.env);
  await page.goto("/connexion");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(motDePasse);
  await page.getByRole("button", { name: "Se connecter" }).click();

  // Seulement ce qui est visible : Next.js garde, cachée, la page quittée
  // (ici le formulaire de connexion, avec son encadré), toujours dans la page.
  const echec = page.locator("[data-slot=echec-connexion]").filter({ visible: true });
  const nom = page.locator("[data-slot=nom-utilisateur]").filter({ visible: true });
  const choixMotDePasse = page
    .getByRole("heading", { name: "Choisir un nouveau mot de passe" })
    .filter({ visible: true });
  await expect(echec.or(nom).or(choixMotDePasse)).toBeVisible();

  if (await echec.isVisible()) {
    throw new Error(
      `Connexion refusée (« ${(await echec.innerText()).trim()} ») : vérifiez E2E_EMAIL et ` +
        "E2E_MOT_DE_PASSE dans .env.local (compte du projet dev).",
    );
  }
  if (new URL(page.url()).pathname.startsWith("/connexion/nouveau-mot-de-passe")) {
    throw new Error(
      "Le compte de test a encore un mot de passe temporaire : connectez-vous une fois à la main " +
        "sur dev, choisissez son mot de passe, puis reportez-le dans E2E_MOT_DE_PASSE (.env.local).",
    );
  }
  return (await nom.innerText()).trim();
}

test("parcours SM-1 : dépôt, recherche, En cours, Traitée et historique", async ({ page }) => {
  const objet = `Essai automatique SM-1 ${horodatage()}`;

  // 1. Dépôt, sans compte, et référence.
  const reference = await deposerDemande(page, objet);

  // 2. Connexion du collaborateur.
  const nom = await seConnecter(page);
  await expect(page).toHaveURL(/\/demandes/);

  // 3. Recherche de la référence : une seule ligne.
  const recherche = page.getByRole("searchbox", { name: /Rechercher par référence/ });
  await recherche.fill(reference);
  await recherche.press("Enter");
  await expect(page).toHaveURL(new RegExp(`[?&]q=${echapper(reference)}`));
  const lignes = page.locator("[data-slot=ligne-demande]");
  await expect(lignes).toHaveCount(1);
  await expect(lignes.first()).toContainText(reference);
  await expect(lignes.first()).toContainText(objet);

  // 4. Détail de la demande.
  await lignes.first().getByRole("link", { name: reference }).click();
  await expect(page).toHaveURL(new RegExp(`/demandes/${echapper(reference)}`));
  const evenements = page.locator("ol[data-slot=historique] > li[data-slot=evenement]");
  await expect(evenements).toHaveCount(1);

  // 5. Nouvelle → En cours. L'historique doit avoir sa deuxième ligne avant
  // le passage suivant (« Marquer Traitée » est aussi proposé depuis Nouvelle).
  await page.getByRole("button", { name: "Passer En cours" }).click();
  await expect(evenements).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Passer En cours" })).toHaveCount(0);

  // 6. En cours → Traitée.
  await page.getByRole("button", { name: "Marquer Traitée" }).click();
  await expect(evenements).toHaveCount(3);

  // 7. Trois lignes d'historique, dans l'ordre : quoi, puis « qui · date ».
  const attendus = [
    { quoi: "Demande créée", qui: "Demandeur" },
    { quoi: "Statut : Nouvelle → En cours", qui: nom },
    { quoi: "Statut : En cours → Traitée", qui: nom },
  ];
  for (const [index, { quoi, qui }] of attendus.entries()) {
    const lignesEvenement = evenements.nth(index).locator("p");
    await expect(lignesEvenement.nth(0)).toHaveText(quoi);
    await expect(lignesEvenement.nth(1)).toHaveText(new RegExp(`^${echapper(qui)} · \\S`));
  }

  // 8. Date de clôture affichée.
  await expect(page.getByText("Clôturée le", { exact: true })).toBeVisible();
});

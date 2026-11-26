import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { identifiantsE2e } from "./environnement";

// Administration réservée aux administrateurs (story 3.1 ; FR-24, RM-7), sur
// dev uniquement (playwright.config.ts) : la vraie garde, la vraie fonction
// SQL `exiger_administrateur`.
//
// Le compte de test est un collaborateur : son menu n'a ni section
// « Administration », ni lien vers « Comptes ». S'il tape l'adresse
// `/admin/comptes`, il voit l'écran S1 dans l'espace interne (menu gardé),
// sans aucun tableau de comptes, et « Retour aux demandes » le ramène à la
// liste. `/admin` seul n'est pas une page : S2.
//
// Appel direct : le même compte, connecté par supabase-js avec la clé
// publique (`.env.local`), appelle `lister_comptes` ; la vraie base refuse
// (NV202) et ne renvoie rien. Les identifiants ne sont jamais affichés.
//
// Le côté administrateur (section visible, tableau des comptes) se vérifie
// à la main avec le compte administrateur de dev : aucun identifiant
// administrateur n'est gardé pour les tests automatiques.
//
// Story 4.4 : sur le détail d'une demande, le collaborateur n'a ni zone
// administrateur, ni « Supprimer la demande… », et la vraie fonction
// `supprimer_demande` refuse son appel direct (NV202), sur une référence
// qui n'existe pas : aucune vraie demande n'est jamais supprimée.
//
// Story 4.1 : le menu n'a pas non plus « Catégories » ; à l'adresse
// `/admin/categories`, le collaborateur voit S1, sans aucune catégorie ni
// champ d'ajout, et les vraies fonctions SQL `lister_categories_administration`,
// `ajouter_categorie` et `modifier_categorie` refusent son appel direct
// (NV202) : aucune catégorie n'est jamais créée ni renommée. Story 4.2 :
// `modifier_categorie` refuse aussi la désactivation et la suppression
// (demande la migration `20261127090000_desactiver_supprimer_categorie.sql`).
//
// Story 4.3 : le menu n'a pas non plus « Informations générales » ; à
// l'adresse `/admin/informations`, le collaborateur voit S1, sans aucune
// information de contact ni formulaire, et les vraies fonctions SQL
// `lire_parametres_administration` et `modifier_parametres` refusent son
// appel direct (NV202) : les informations de dev ne sont jamais modifiées
// (demande la migration `20261127120000_informations_generales.sql`).
//
// Demande la migration `20261124160000_comptes_administration.sql` sur dev ;
// les tests des catégories demandent aussi
// `20261126150000_categories_administration.sql`.

const S1 = "Accès refusé. Cette page est réservée aux administrateurs.";

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

test("collaborateur : aucune administration dans le menu, S1 à l'adresse forcée", async ({ page }) => {
  await seConnecter(page);

  // Le menu est entièrement affiché (personne connectée lue) : aucune section.
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  await expect(menu.getByRole("link", { name: /Demandes/ }).first()).toBeVisible();
  await expect(page.locator("[data-slot=role-utilisateur]").filter({ visible: true })).toHaveText("Collaborateur");
  await expect(page.locator("[data-slot=section-administration]")).toHaveCount(0);
  await expect(menu.getByText("Administration")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Comptes" })).toHaveCount(0);
  await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);

  // Adresse tapée : S1, dans l'espace interne, sans aucune donnée de compte.
  const reponse = await page.goto("/admin/comptes");
  expect(reponse?.ok()).toBe(true);

  // Story 3.3 : à cette page protégée, le proxy a posé le rôle relu dans
  // `profils` (signal d'affichage du menu, lisible par la page, jamais une
  // protection). Pas juste après la connexion : la page « Demandes » y est
  // rendue dans la réponse de la Server Function, sans passer par le proxy.
  const role = (await page.context().cookies()).find((cookie) => cookie.name === "nova_role");
  expect(role?.value).toBe("collaborateur");
  expect(role?.httpOnly).toBe(false);
  await expect(page.getByRole("heading", { level: 1, name: S1 })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/comptes$/);
  await expect(page.locator("[data-slot=menu-lateral]")).toBeVisible();
  await expect(page.locator("[data-slot=nom-utilisateur]").filter({ visible: true })).toBeVisible();
  await expect(page.locator("[data-slot=tableau-comptes]")).toHaveCount(0);
  await expect(page.locator("[data-slot=section-administration]")).toHaveCount(0);
  const html = (await reponse?.text()) ?? "";
  expect(html).not.toContain("tableau-comptes");
  expect(html).not.toContain("ligne-compte");

  // « Retour aux demandes » ramène à la liste.
  await page.getByRole("link", { name: "Retour aux demandes" }).click();
  await expect(page).toHaveURL(/\/demandes$/);
  await expect(page.getByRole("heading", { level: 1, name: "Demandes" })).toBeVisible();

  // `/admin` seul n'est pas une page : S2.
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Cette page n'existe pas ou a été supprimée." })).toBeVisible();
});

test("collaborateur : la vraie fonction SQL lister_comptes refuse un appel direct (NV202)", async () => {
  const { email, motDePasse } = identifiantsE2e(process.env);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  expect(url, "NEXT_PUBLIC_SUPABASE_URL dans .env.local").not.toBe("");
  expect(cle, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans .env.local").not.toBe("");

  const supabase = createClient(url, cle, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: erreurConnexion } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
  // Seul le code est montré en cas d'échec, jamais les identifiants.
  expect(erreurConnexion?.code ?? null, "connexion du compte de test").toBeNull();
  try {
    const { data, error } = await supabase.rpc("lister_comptes");
    expect(error?.code ?? null).toBe("NV202");
    expect(data).toBeNull();
  } finally {
    await supabase.auth.signOut({ scope: "local" });
  }
});

test("collaborateur : les vraies fonctions SQL modifier_compte (état, nom, rôle) et retablir_compte refusent un appel direct", async () => {
  // Story 3.4 : exécutables par `service_role` seul. Appelées sur le compte
  // du collaborateur lui-même, avec `p_actif` vrai : même un droit donné par
  // erreur ne désactiverait personne. Demande la migration
  // `20261125090000_desactiver_compte.sql` sur dev.
  const { email, motDePasse } = identifiantsE2e(process.env);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  expect(url, "NEXT_PUBLIC_SUPABASE_URL dans .env.local").not.toBe("");
  expect(cle, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans .env.local").not.toBe("");

  const supabase = createClient(url, cle, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: connexion, error: erreurConnexion } = await supabase.auth.signInWithPassword({
    email,
    password: motDePasse,
  });
  expect(erreurConnexion?.code ?? null, "connexion du compte de test").toBeNull();
  const id = connexion.user!.id;
  try {
    const modifier = await supabase.rpc("modifier_compte", { p_auteur: id, p_compte: id, p_actif: true });
    // 42501 : droit d'exécution refusé (le rôle `authenticated` n'en a pas).
    expect(modifier.error?.code ?? null).toBe("42501");
    expect(modifier.data).toBeNull();

    const retablir = await supabase.rpc("retablir_compte", { p_compte: id, p_actif: true });
    expect(retablir.error?.code ?? null).toBe("42501");
    expect(retablir.data).toBeNull();

    // Story 3.3 : la nouvelle `modifier_compte` (nom et rôle) refuse aussi.
    // Le collaborateur essaie de se passer administrateur ; même un droit
    // donné par erreur serait refusé par la fonction (auteur NV202). Demande
    // la migration `20261126090000_modifier_compte.sql` sur dev.
    const promouvoir = await supabase.rpc("modifier_compte", { p_auteur: id, p_compte: id, p_role: "administrateur" });
    expect(promouvoir.error?.code ?? null).toBe("42501");
    expect(promouvoir.data).toBeNull();

    // Rien n'a changé : le profil (sa propre ligne) est toujours actif et collaborateur.
    const { data: profil, error } = await supabase.from("profils").select("actif, role").eq("id", id).maybeSingle();
    expect(error).toBeNull();
    expect(profil).toEqual({ actif: true, role: "collaborateur" });
  } finally {
    await supabase.auth.signOut({ scope: "local" });
  }
});

test("collaborateur : la vraie fonction SQL reinitialiser_mdp refuse un appel direct", async () => {
  // Story 3.5 : exécutable par `service_role` seul. Appelée sur le compte du
  // collaborateur lui-même : même un droit donné par erreur ne toucherait
  // que lui, et le refus arrive avant toute écriture. Aucun vrai compte
  // n'est réinitialisé. Demande la migration
  // `20261125120000_reinitialiser_mot_de_passe.sql` sur dev.
  const { email, motDePasse } = identifiantsE2e(process.env);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  expect(url, "NEXT_PUBLIC_SUPABASE_URL dans .env.local").not.toBe("");
  expect(cle, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans .env.local").not.toBe("");

  const supabase = createClient(url, cle, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: connexion, error: erreurConnexion } = await supabase.auth.signInWithPassword({
    email,
    password: motDePasse,
  });
  expect(erreurConnexion?.code ?? null, "connexion du compte de test").toBeNull();
  const id = connexion.user!.id;
  try {
    const reinitialiser = await supabase.rpc("reinitialiser_mdp", {
      p_auteur: id,
      p_compte: id,
      p_mdp_temporaire: "Essai-refuse-e2e-2026",
    });
    // 42501 : droit d'exécution refusé (le rôle `authenticated` n'en a pas).
    expect(reinitialiser.error?.code ?? null).toBe("42501");
    expect(reinitialiser.data).toBeNull();

    // Rien n'a changé : le mot de passe reste choisi (sa propre ligne).
    const { data: profil, error } = await supabase
      .from("profils")
      .select("actif, doit_changer_mdp")
      .eq("id", id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(profil).toEqual({ actif: true, doit_changer_mdp: false });
  } finally {
    await supabase.auth.signOut({ scope: "local" });
  }
});

test("collaborateur : aucune zone administrateur sur le détail d'une demande", async ({ page }) => {
  // Story 4.4 : ni zone administrateur, ni « Supprimer la demande… ». La
  // première demande de la liste est seulement ouverte, jamais modifiée
  // (dev en contient toujours : les autres tests en créent).
  await seConnecter(page);
  const premiere = page.locator("[data-slot=tableau-demandes] tbody a").first();
  await expect(premiere).toBeVisible();
  await premiere.click();
  await expect(page).toHaveURL(/\/demandes\/NOVA-\d{4}-\d{4,}/);
  await expect(page.locator("[data-slot=panneau-statut]")).toBeVisible();
  await expect(page.locator("[data-slot=actions-statut]")).toBeVisible();
  await expect(page.locator("[data-slot=zone-administrateur]")).toHaveCount(0);
  await expect(page.locator("[data-slot=supprimer-demande]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Supprimer/ })).toHaveCount(0);
});

test("collaborateur : la vraie fonction SQL supprimer_demande refuse un appel direct (NV202)", async () => {
  // Story 4.4 : exécutable par `authenticated`, mais la fonction commence
  // par `exiger_administrateur`. Appelée sur une référence qui n'existe pas
  // (numéro 9999 de l'an 1999) : même un refus manquant n'effacerait
  // aucune vraie demande. Demande la migration
  // `20261126120000_supprimer_demande.sql` sur dev.
  const { email, motDePasse } = identifiantsE2e(process.env);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  expect(url, "NEXT_PUBLIC_SUPABASE_URL dans .env.local").not.toBe("");
  expect(cle, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans .env.local").not.toBe("");

  const supabase = createClient(url, cle, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: erreurConnexion } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
  expect(erreurConnexion?.code ?? null, "connexion du compte de test").toBeNull();
  try {
    const { data, error } = await supabase.rpc("supprimer_demande", { p_reference: "NOVA-1999-9999" });
    expect(error?.code ?? null).toBe("NV202");
    expect(data).toBeNull();
  } finally {
    await supabase.auth.signOut({ scope: "local" });
  }
});

test("collaborateur : ni « Catégories » dans le menu, ni écran A2 à l'adresse forcée (S1)", async ({ page }) => {
  // Story 4.1. Demande la migration `20261126150000_categories_administration.sql` sur dev.
  await seConnecter(page);
  await expect(page.getByRole("link", { name: "Catégories" })).toHaveCount(0);

  const reponse = await page.goto("/admin/categories");
  expect(reponse?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: S1 })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/categories$/);
  await expect(page.locator("[data-slot=menu-lateral]")).toBeVisible();
  await expect(page.locator("[data-slot=tableau-categories]")).toHaveCount(0);
  await expect(page.locator("[data-slot=ajouter-categorie]")).toHaveCount(0);
  await expect(page.getByLabel("Nouvelle catégorie")).toHaveCount(0);
  const html = (await reponse?.text()) ?? "";
  expect(html).not.toContain("tableau-categories");
  expect(html).not.toContain("ligne-categorie");
  expect(html).not.toContain("ajouter-categorie");
});

test("collaborateur : les vraies fonctions SQL des catégories refusent un appel direct (NV202)", async () => {
  // Story 4.1 : exécutables par `authenticated`, mais chacune commence par
  // `exiger_administrateur`. Le renommage vise un identifiant qui n'existe
  // pas, et le nom ajouté est un nom d'essai : même un refus manquant ne
  // toucherait aucune vraie catégorie. Demande la migration
  // `20261126150000_categories_administration.sql` sur dev.
  const { email, motDePasse } = identifiantsE2e(process.env);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  expect(url, "NEXT_PUBLIC_SUPABASE_URL dans .env.local").not.toBe("");
  expect(cle, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans .env.local").not.toBe("");

  const supabase = createClient(url, cle, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: erreurConnexion } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
  expect(erreurConnexion?.code ?? null, "connexion du compte de test").toBeNull();
  try {
    const lister = await supabase.rpc("lister_categories_administration");
    expect(lister.error?.code ?? null).toBe("NV202");
    expect(lister.data).toBeNull();

    const ajouter = await supabase.rpc("ajouter_categorie", { p_nom: "Essai e2e refusé" });
    expect(ajouter.error?.code ?? null).toBe("NV202");
    expect(ajouter.data).toBeNull();

    const modifier = await supabase.rpc("modifier_categorie", {
      p_categorie: "00000000-0000-4000-8000-000000000000",
      p_nom: "Essai e2e refusé",
    });
    expect(modifier.error?.code ?? null).toBe("NV202");
    expect(modifier.data).toBeNull();

    // Story 4.2 : désactiver et supprimer, par la nouvelle signature (un
    // PGRST202 voudrait dire que la migration 20261127090000 manque sur dev).
    const desactiver = await supabase.rpc("modifier_categorie", {
      p_categorie: "00000000-0000-4000-8000-000000000000",
      p_active: false,
    });
    expect(desactiver.error?.code ?? null).toBe("NV202");
    expect(desactiver.data).toBeNull();

    const supprimer = await supabase.rpc("modifier_categorie", {
      p_categorie: "00000000-0000-4000-8000-000000000000",
      p_supprimer: true,
    });
    expect(supprimer.error?.code ?? null).toBe("NV202");
    expect(supprimer.data).toBeNull();
  } finally {
    await supabase.auth.signOut({ scope: "local" });
  }
});

test("collaborateur : ni « Informations générales » dans le menu, ni écran A3 à l'adresse forcée (S1)", async ({ page }) => {
  // Story 4.3. Demande la migration `20261127120000_informations_generales.sql` sur dev.
  await seConnecter(page);
  await expect(page.getByRole("link", { name: "Informations générales" })).toHaveCount(0);

  const reponse = await page.goto("/admin/informations");
  expect(reponse?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: S1 })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/informations$/);
  await expect(page.locator("[data-slot=menu-lateral]")).toBeVisible();
  await expect(page.locator("[data-slot=informations-generales]")).toHaveCount(0);
  await expect(page.getByLabel("Email de contact")).toHaveCount(0);
  const html = (await reponse?.text()) ?? "";
  expect(html).not.toContain('data-slot="informations-generales"');
  expect(html).not.toContain("Téléphone de contact");
  expect(html).not.toContain("Contact pour les données personnelles");
});

test("collaborateur : les vraies fonctions SQL des informations générales refusent un appel direct (NV202)", async () => {
  // Story 4.3 : exécutables par `authenticated`, mais chacune vérifie
  // d'abord l'administrateur (`exiger_administrateur`). L'enregistrement
  // essayé porte un email de contact mal formé : même un refus manquant
  // s'arrêterait sur NV103, avant toute écriture ; les informations de dev
  // ne sont jamais modifiées. Demande la migration
  // `20261127120000_informations_generales.sql` sur dev.
  const { email, motDePasse } = identifiantsE2e(process.env);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  expect(url, "NEXT_PUBLIC_SUPABASE_URL dans .env.local").not.toBe("");
  expect(cle, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans .env.local").not.toBe("");

  const supabase = createClient(url, cle, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: erreurConnexion } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
  expect(erreurConnexion?.code ?? null, "connexion du compte de test").toBeNull();
  try {
    // Un PGRST202 voudrait dire que la migration 20261127120000 manque sur dev.
    const lire = await supabase.rpc("lire_parametres_administration");
    expect(lire.error?.code ?? null).toBe("NV202");
    expect(lire.data).toBeNull();

    // Avant la migration 20261127120000, ce refus serait 42501 (droit
    // réservé à `service_role`) : NV202 montre la nouvelle version.
    const modifier = await supabase.rpc("modifier_parametres", {
      p_telephone: null,
      p_email_contact: "essai-e2e-refuse",
      p_contact_donnees: "Essai e2e refusé",
    });
    expect(modifier.error?.code ?? null).toBe("NV202");
    expect(modifier.data).toBeNull();
  } finally {
    await supabase.auth.signOut({ scope: "local" });
  }
});

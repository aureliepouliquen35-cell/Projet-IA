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
// Demande la migration `20261124160000_comptes_administration.sql` sur dev.

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

test("collaborateur : les vraies fonctions SQL modifier_compte et retablir_compte refusent un appel direct", async () => {
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

    // Rien n'a changé : le profil (sa propre ligne) est toujours actif.
    const { data: profil, error } = await supabase.from("profils").select("actif").eq("id", id).maybeSingle();
    expect(error).toBeNull();
    expect(profil).toEqual({ actif: true });
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

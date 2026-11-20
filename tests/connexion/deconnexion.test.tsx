import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Déconnexion (FR-9) et espace interne minimal (story 1.6) : la Server
// Function ferme la session de ce navigateur, le bouton recharge entièrement
// la page de connexion, la page `/demandes` vérifie elle-même la personne
// connectée. Supabase est simulé.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));

import {
  BoutonDeconnexion,
  installerRechargement,
  seDeconnecter,
} from "@/components/interne/bouton-deconnexion";
import { SqueletteUtilisateur, UtilisateurConnecte } from "@/components/interne/utilisateur-connecte";
import { actionSeDeconnecter } from "@/server/actions/se-deconnecter";

import { texteDe } from "../aides/formulaire-depot";
import { ID_KARIM } from "../aides/supabase-connexion";

beforeEach(() => {
  simulation.reinitialiser();
  simulation.session.id = ID_KARIM;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("actionSeDeconnecter", () => {
  it("ferme la session de ce navigateur seulement", async () => {
    await expect(actionSeDeconnecter()).resolves.toEqual({ ok: true, donnees: null });
    expect(simulation.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(simulation.session.id).toBeNull();
  });

  it("Auth injoignable : réussite quand même (les cookies sont effacés par Supabase)", async () => {
    simulation.signOut.mockResolvedValueOnce({ error: { message: "fetch failed", status: 0 } });
    await expect(actionSeDeconnecter()).resolves.toEqual({ ok: true, donnees: null });
  });

  it("n'écrit rien au journal", async () => {
    await actionSeDeconnecter();
    expect(simulation.journal()).toEqual([]);
  });
});

describe("bouton « Se déconnecter »", () => {
  it("affiche « Se déconnecter »", () => {
    const html = renderToStaticMarkup(<BoutonDeconnexion />);
    expect(texteDe(html)).toBe("Se déconnecter");
    expect(html).toMatch(/<button[^>]*type="button"/);
    expect(html).not.toContain("aria-busy");
  });

  it("ferme la session, puis remplace la page par /connexion (rechargement complet)", async () => {
    const ordre: string[] = [];
    await seDeconnecter({
      seDeconnecter: async () => {
        ordre.push("action");
      },
      remplacer: (adresse) => ordre.push(`remplacer ${adresse}`),
    });
    expect(ordre).toEqual(["action", "remplacer /connexion"]);
  });

  it("serveur injoignable : la page de connexion s'ouvre quand même", async () => {
    const remplacer = vi.fn();
    await seDeconnecter({
      seDeconnecter: async () => {
        throw new Error("réseau coupé");
      },
      remplacer,
    });
    expect(remplacer).toHaveBeenCalledWith("/connexion");
  });
});

describe("rechargement d'une page ressortie du cache du navigateur", () => {
  /** `pageshow` tel que le navigateur l'envoie, avec ou sans `persisted`. */
  const pageshow = (persisted: boolean) => Object.assign(new Event("pageshow"), { persisted });

  it("recharge quand la page revient du cache (persisted)", () => {
    const cible = new EventTarget();
    const recharger = vi.fn();
    installerRechargement(cible, recharger);
    cible.dispatchEvent(pageshow(true));
    expect(recharger).toHaveBeenCalledTimes(1);
  });

  it("ne recharge pas à un affichage ordinaire", () => {
    const cible = new EventTarget();
    const recharger = vi.fn();
    installerRechargement(cible, recharger);
    cible.dispatchEvent(pageshow(false));
    cible.dispatchEvent(new Event("pageshow"));
    expect(recharger).not.toHaveBeenCalled();
  });

  it("ne recharge plus une fois l'écoute retirée", () => {
    const cible = new EventTarget();
    const recharger = vi.fn();
    const retirer = installerRechargement(cible, recharger);
    retirer();
    cible.dispatchEvent(pageshow(true));
    expect(recharger).not.toHaveBeenCalled();
  });
});

describe("en-tête : personne connectée", () => {
  it.each([
    ["collaborateur", "Collaborateur"],
    ["administrateur", "Administrateur"],
  ])("%s : nom et rôle lus dans profils, « Se déconnecter »", async (role, libelle) => {
    simulation.profils.get(ID_KARIM)!.role = role;
    const html = renderToStaticMarkup(await UtilisateurConnecte());
    expect(html).toMatch(/data-slot="nom-utilisateur"[^>]*>Karim Benali<\/p>/);
    expect(html).toMatch(new RegExp(`data-slot="role-utilisateur"[^>]*>${libelle}</p>`));
    expect(texteDe(html)).toContain("Se déconnecter");
  });

  it("sans session : renvoi vers /connexion", async () => {
    simulation.session.id = null;
    await expect(UtilisateurConnecte()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
  });

  it("le squelette est annoncé aux lecteurs d'écran", () => {
    const html = renderToStaticMarkup(<SqueletteUtilisateur />);
    expect(html).toContain('role="status"');
    expect(html).toMatch(/<span class="sr-only">Chargement…<\/span>/);
  });
});

import { AuthInvalidJwtError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Garde de l'espace interne (AD-7) : la session vient des cookies, le nom,
// le rôle et l'état du compte sont relus dans `profils`. Supabase est simulé.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));

import { exigerUtilisateur, lireUtilisateur } from "@/server/garde";

import { ID_KARIM } from "../aides/supabase-connexion";

beforeEach(() => {
  simulation.reinitialiser();
});

async function renvoi(): Promise<unknown> {
  try {
    await exigerUtilisateur();
  } catch (erreur) {
    return erreur;
  }
  return null;
}

describe("lireUtilisateur", () => {
  it("personne connectée et active : identifiant, nom et rôle lus dans profils", async () => {
    simulation.session.id = ID_KARIM;
    await expect(lireUtilisateur()).resolves.toEqual({
      id: ID_KARIM,
      nom: "Karim Benali",
      role: "collaborateur",
    });
    expect(simulation.from).toHaveBeenCalledWith("profils");
    expect(simulation.lectureProfils).toHaveBeenCalledWith("id, nom, role, actif", ID_KARIM);
  });

  it("le rôle vient de profils, jamais de la session", async () => {
    simulation.session.id = ID_KARIM;
    simulation.profils.get(ID_KARIM)!.role = "administrateur";
    simulation.getClaims.mockResolvedValueOnce({
      data: { claims: { sub: ID_KARIM, role: "authenticated", user_metadata: { role: "collaborateur" } } },
      error: null,
    } as never);
    await expect(lireUtilisateur()).resolves.toMatchObject({ role: "administrateur" });
  });

  it("sans session : null, profils n'est pas lu", async () => {
    await expect(lireUtilisateur()).resolves.toBeNull();
    expect(simulation.from).not.toHaveBeenCalled();
  });

  it("session invalide : null", async () => {
    simulation.getClaims.mockResolvedValueOnce({
      data: null,
      error: new AuthInvalidJwtError("jeton invalide"),
    } as never);
    await expect(lireUtilisateur()).resolves.toBeNull();
  });

  it("compte inactif : null", async () => {
    simulation.session.id = ID_KARIM;
    simulation.profils.get(ID_KARIM)!.actif = false;
    await expect(lireUtilisateur()).resolves.toBeNull();
  });

  it("compte sans profil : null", async () => {
    simulation.session.id = ID_KARIM;
    simulation.profils.clear();
    await expect(lireUtilisateur()).resolves.toBeNull();
  });

  it("Auth injoignable : erreur (écran S3), pas de renvoi vers la connexion", async () => {
    simulation.getClaims.mockResolvedValueOnce({
      data: null,
      error: new AuthRetryableFetchError("fetch failed", 0),
    } as never);
    await expect(lireUtilisateur()).rejects.toThrow(/session impossible/);
  });

  it("profil illisible : erreur", async () => {
    simulation.session.id = ID_KARIM;
    simulation.pannesRpc.profils = { data: null, error: { code: "PGRST000", message: "panne" } };
    await expect(lireUtilisateur()).rejects.toThrow(/code PGRST000/);
  });

  it("rôle inconnu : erreur", async () => {
    simulation.session.id = ID_KARIM;
    simulation.profils.get(ID_KARIM)!.role = "superviseur";
    await expect(lireUtilisateur()).rejects.toThrow(/rôle/);
  });
});

describe("exigerUtilisateur", () => {
  it("personne connectée et active : la renvoie", async () => {
    simulation.session.id = ID_KARIM;
    await expect(exigerUtilisateur()).resolves.toMatchObject({ id: ID_KARIM });
  });

  it.each([
    ["sans session", () => {}],
    ["compte inactif", () => {
      simulation.session.id = ID_KARIM;
      simulation.profils.get(ID_KARIM)!.actif = false;
    }],
  ])("%s : renvoi vers /connexion", async (_, preparer) => {
    preparer();
    expect(await renvoi()).toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
  });
});

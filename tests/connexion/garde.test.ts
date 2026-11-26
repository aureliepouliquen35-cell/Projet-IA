import { AuthInvalidJwtError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Garde de l'espace interne (AD-7) : la session vient des cookies, le nom,
// le rôle et l'état du compte sont relus dans `profils`. Supabase est simulé.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));

import { exigerAdministrateur, exigerChangementMotDePasse, exigerUtilisateur, lireUtilisateur } from "@/server/garde";
import { COOKIE_MESSAGE_CONNEXION, dechiffrerPassage } from "@/server/passage";

import { EMAIL_KARIM, ID_KARIM } from "../aides/supabase-connexion";

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
  it("personne connectée et active : identifiant, nom, email (story 4.3) et rôle lus dans profils", async () => {
    simulation.session.id = ID_KARIM;
    await expect(lireUtilisateur()).resolves.toEqual({
      id: ID_KARIM,
      nom: "Karim Benali",
      email: EMAIL_KARIM,
      role: "collaborateur",
      doitChangerMdp: false,
    });
    expect(simulation.from).toHaveBeenCalledWith("profils");
    expect(simulation.lectureProfils).toHaveBeenCalledWith("id, nom, email, role, actif, doit_changer_mdp", ID_KARIM);
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

  it("email qui n'est pas un texte (story 4.3) : erreur", async () => {
    simulation.session.id = ID_KARIM;
    (simulation.profils.get(ID_KARIM) as unknown as { email: unknown }).email = 42;
    await expect(lireUtilisateur()).rejects.toThrow(/email/);
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

describe("compte désactivé pendant la session (FR-22, story 3.4)", () => {
  beforeEach(() => {
    simulation.session.id = ID_KARIM;
    simulation.profils.get(ID_KARIM)!.actif = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const message = () => {
    const cookie = simulation.cookiesPoses.get(COOKIE_MESSAGE_CONNEXION);
    return cookie ? dechiffrerPassage(COOKIE_MESSAGE_CONNEXION, cookie.valeur) : null;
  };

  it("lireUtilisateur garde son contrat : null, sans fermer la session", async () => {
    await expect(lireUtilisateur()).resolves.toBeNull();
    expect(simulation.signOut).not.toHaveBeenCalled();
    expect(simulation.cookiesPoses.size).toBe(0);
  });

  it.each([
    ["exigerUtilisateur", () => exigerUtilisateur()],
    ["exigerAdministrateur", () => exigerAdministrateur()],
    ["exigerChangementMotDePasse", () => exigerChangementMotDePasse()],
  ])("%s : session fermée, message « session terminée », renvoi vers /connexion", async (_, garde) => {
    await expect(garde()).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/) });
    expect(simulation.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(simulation.session.id).toBeNull();
    expect(message()).toEqual({ type: "message_connexion", message: "session_terminee" });
    expect(simulation.cookiesPoses.get(COOKIE_MESSAGE_CONNEXION)?.options).toMatchObject({
      httpOnly: true,
      path: "/connexion",
    });
  });

  it("pendant le rendu d'une page (cookie impossible à écrire) : renvoi quand même vers /connexion", async () => {
    simulation.cookies.mockImplementationOnce(async () => ({
      get: () => undefined,
      set: () => {
        throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
      },
    }));
    await expect(exigerUtilisateur()).rejects.toMatchObject({ digest: expect.stringMatching(/\/connexion;/) });
  });

  it("Auth injoignable à la fermeture : renvoi quand même, message posé", async () => {
    simulation.signOut.mockRejectedValueOnce(new Error("fetch failed"));
    await expect(exigerUtilisateur()).rejects.toMatchObject({ digest: expect.stringMatching(/\/connexion;/) });
    expect(message()).toMatchObject({ message: "session_terminee" });
  });

  it("sans profil : renvoi sans message ni fermeture", async () => {
    simulation.profils.clear();
    await expect(exigerUtilisateur()).rejects.toMatchObject({ digest: expect.stringMatching(/\/connexion;/) });
    expect(simulation.signOut).not.toHaveBeenCalled();
    expect(message()).toBeNull();
  });
});

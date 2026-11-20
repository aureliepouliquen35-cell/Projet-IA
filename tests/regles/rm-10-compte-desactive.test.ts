import { beforeEach, describe, expect, it, vi } from "vitest";

// RM-10 : un compte n'est jamais supprimé, seulement désactivé ; un compte
// désactivé ne peut pas se connecter (FR-8, FR-22, AD-6, AD-7).
// - avec ses bons identifiants, il reçoit « Identifiants incorrects », comme
//   un email inconnu, et sa session est refermée aussitôt ;
// - une session encore ouverte ne donne accès à rien : la garde relit
//   `actif` dans `profils` à chaque requête.
// Supabase est simulé.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));

import { ContenuDemandes } from "@/app/(interne)/demandes/contenu-demandes";
import { actionSeConnecter } from "@/server/actions/se-connecter";
import { exigerUtilisateur, lireUtilisateur } from "@/server/garde";

import { EMAIL_KARIM, ID_KARIM, MOT_DE_PASSE_KARIM } from "../aides/supabase-connexion";

beforeEach(() => {
  simulation.reinitialiser();
  simulation.profils.get(ID_KARIM)!.actif = false;
});

describe("RM-10 : un compte désactivé ne peut pas se connecter", () => {
  it("bons identifiants : « Identifiants incorrects », même réponse qu'un email inconnu", async () => {
    const desactive = await actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM });
    const inconnu = await actionSeConnecter({ email: "personne@exemple.fr", motDePasse: "x" });
    expect(desactive).toEqual({ ok: false, code: "VALIDATION", message: "Identifiants incorrects" });
    expect(desactive).toEqual(inconnu);
  });

  it("aucune session ne reste ouverte", async () => {
    await actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM });
    expect(simulation.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(simulation.session.id).toBeNull();
  });

  it("une session encore ouverte ne donne accès à aucune page interne", async () => {
    simulation.session.id = ID_KARIM;
    await expect(lireUtilisateur()).resolves.toBeNull();
    await expect(exigerUtilisateur()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
  });

  it.each([
    ["compte inactif, session encore ouverte", () => {
      simulation.session.id = ID_KARIM;
    }],
    ["sans session", () => {}],
  ])("/demandes (%s) : rien n'est affiché, renvoi vers /connexion", async (_, preparer) => {
    preparer();
    await expect(ContenuDemandes()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
  });

  it("/demandes avec un compte actif : le contenu s'affiche", async () => {
    simulation.profils.get(ID_KARIM)!.actif = true;
    simulation.session.id = ID_KARIM;
    await expect(ContenuDemandes()).resolves.toBeTruthy();
  });

  it("réactivé, le même compte se connecte de nouveau", async () => {
    simulation.profils.get(ID_KARIM)!.actif = true;
    await expect(
      actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM }),
    ).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/demandes;/) });
  });
});

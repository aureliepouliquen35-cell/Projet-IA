import { beforeEach, describe, expect, it, vi } from "vitest";

// Garde d'administration et lecture de l'écran A1 (story 3.1 ; FR-24,
// AD-7, AD-9, AD-12, AD-13) : `exigerAdministrateur()` relit le rôle dans
// `profils` ; `lireComptes()` vérifie le rôle, appelle `lister_comptes`
// avec la session, contrôle la réponse et journalise une panne avec un code
// court, sans nom ni email. Supabase est simulé.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));

import { exigerAdministrateur } from "@/server/garde";
import { lireComptes } from "@/server/lectures/comptes";

import { EMAIL_KARIM, EMAIL_SOPHIE, ID_KARIM, ID_SOPHIE, PROFIL_SOPHIE } from "../aides/supabase-connexion";

const ID_EMILIE = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";

beforeEach(() => {
  simulation.reinitialiser();
  simulation.profils.set(ID_SOPHIE, { ...PROFIL_SOPHIE });
  simulation.session.id = ID_SOPHIE;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("exigerAdministrateur", () => {
  it("administrateur actif : la personne connectée", async () => {
    await expect(exigerAdministrateur()).resolves.toEqual({
      id: ID_SOPHIE,
      nom: "Sophie Martin",
      role: "administrateur",
      doitChangerMdp: false,
    });
  });

  it("collaborateur : null (pas de renvoi, la page affiche S1)", async () => {
    simulation.session.id = ID_KARIM;
    await expect(exigerAdministrateur()).resolves.toBeNull();
  });

  it("le rôle vient de profils, jamais de la session", async () => {
    simulation.session.id = ID_KARIM;
    simulation.getClaims.mockResolvedValueOnce({
      data: { claims: { sub: ID_KARIM, role: "authenticated", user_metadata: { role: "administrateur" } } },
      error: null,
    } as never);
    await expect(exigerAdministrateur()).resolves.toBeNull();
  });

  it("administrateur rétrogradé : null dès la requête suivante", async () => {
    await expect(exigerAdministrateur()).resolves.not.toBeNull();
    simulation.profils.get(ID_SOPHIE)!.role = "collaborateur";
    await expect(exigerAdministrateur()).resolves.toBeNull();
  });

  it.each([
    ["sans session", () => {
      simulation.session.id = null;
    }],
    ["administrateur désactivé", () => {
      simulation.profils.get(ID_SOPHIE)!.actif = false;
    }],
  ])("%s : renvoi vers /connexion", async (_, preparer) => {
    preparer();
    await expect(exigerAdministrateur()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
  });

  it("mot de passe temporaire pas encore remplacé : renvoi vers I2", async () => {
    simulation.profils.get(ID_SOPHIE)!.doit_changer_mdp = true;
    await expect(exigerAdministrateur()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion\/nouveau-mot-de-passe;/),
    });
  });
});

describe("lireComptes", () => {
  it("administrateur : tous les comptes, désactivés compris, triés par nom puis email", async () => {
    simulation.profils.set(ID_EMILIE, {
      id: ID_EMILIE,
      nom: "Émilie Durand",
      role: "collaborateur",
      actif: false,
      doit_changer_mdp: false,
      email: "emilie.durand@nova-services.example",
    });
    simulation.comptes.set(EMAIL_KARIM, { motDePasse: "x", id: ID_KARIM });

    await expect(lireComptes()).resolves.toEqual({
      ok: true,
      donnees: [
        { id: ID_EMILIE, nom: "Émilie Durand", email: "emilie.durand@nova-services.example", role: "collaborateur", actif: false },
        { id: ID_KARIM, nom: "Karim Benali", email: EMAIL_KARIM, role: "collaborateur", actif: true },
        { id: ID_SOPHIE, nom: "Sophie Martin", email: EMAIL_SOPHIE, role: "administrateur", actif: true },
      ],
    });
    expect(simulation.rpcSession).toHaveBeenCalledWith("lister_comptes");
    expect(simulation.creerClientSecret).not.toHaveBeenCalled();
  });

  it("collaborateur : accès refusé, sans aucun appel à la base ni au journal", async () => {
    simulation.session.id = ID_KARIM;
    await expect(lireComptes()).resolves.toEqual({ ok: false, accesRefuse: true });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
    expect(simulation.journal()).toEqual([]);
  });

  it("refus de la base (NV202, rôle retiré entre-temps) : accès refusé, rien au journal", async () => {
    simulation.pannesRpc.lister_comptes = { data: null, error: { code: "NV202", message: "Accès refusé" } };
    await expect(lireComptes()).resolves.toEqual({ ok: false, accesRefuse: true });
    expect(simulation.journal()).toEqual([]);
  });

  it("sans session : renvoi vers /connexion, rien n'est lu", async () => {
    simulation.session.id = null;
    await expect(lireComptes()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("base injoignable : { ok: false }, journalisée avec un code court, sans nom ni email", async () => {
    simulation.pannesRpc.lister_comptes = { data: null, error: { code: "57P01", message: "panne" } };
    await expect(lireComptes()).resolves.toEqual({ ok: false });
    const journal = simulation.journal();
    expect(journal).toHaveLength(1);
    expect(journal[0].evenement).toBe("erreur_inattendue");
    expect(journal[0].details).toEqual({ type: "lecture", lecture: "lister_comptes" });
    const ecrit = JSON.stringify(simulation.appels("ecrire_journal"));
    expect(ecrit).not.toMatch(/Sophie|sophie|Karim|nova-services/);
    expect(ecrit).toMatch(/"p_code_erreur":"[0-9A-Z]{1,7}"/);
  });

  it.each([
    ["pas un tableau", { comptes: [] }],
    ["rôle inconnu", [{ id: ID_SOPHIE, nom: "Sophie Martin", email: EMAIL_SOPHIE, role: "superviseur", actif: true }]],
    ["état absent", [{ id: ID_SOPHIE, nom: "Sophie Martin", email: EMAIL_SOPHIE, role: "administrateur" }]],
    ["identifiant mal formé", [{ id: "abc", nom: "Sophie Martin", email: EMAIL_SOPHIE, role: "administrateur", actif: true }]],
  ])("réponse inattendue (%s) : { ok: false }, message sans valeur lue", async (_, data) => {
    simulation.pannesRpc.lister_comptes = { data, error: null };
    await expect(lireComptes()).resolves.toEqual({ ok: false });
    const messages = vi.mocked(console.error).mock.calls.map((appel) => String(appel[1] ?? "")).join("\n");
    expect(messages).toMatch(/Réponse inattendue de lister_comptes/);
    expect(messages).not.toMatch(/Sophie|sophie\.martin/);
  });

  it("ne garde que id, nom, email, rôle et état (un champ en trop n'est jamais renvoyé)", async () => {
    simulation.pannesRpc.lister_comptes = {
      data: [{ id: ID_SOPHIE, nom: "Sophie Martin", email: EMAIL_SOPHIE, role: "administrateur", actif: true, empreinte: "$2a$x" }],
      error: null,
    };
    const lecture = await lireComptes();
    expect(lecture).toEqual({
      ok: true,
      donnees: [{ id: ID_SOPHIE, nom: "Sophie Martin", email: EMAIL_SOPHIE, role: "administrateur", actif: true }],
    });
  });
});

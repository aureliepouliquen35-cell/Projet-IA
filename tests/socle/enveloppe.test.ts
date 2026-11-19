import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AD-12 : l'enveloppe commune laisse passer les réponses, relance les erreurs
// internes de Next.js, et transforme une erreur imprévue en `ERREUR_INTERNE`
// journalisée avec un code court, sans le message de l'erreur.

const simulation = vi.hoisted(() => ({
  rpc: vi.fn(),
  creerClientSecret: vi.fn(),
}));

vi.mock("@/server/supabase-secret", () => ({
  creerClientSecret: simulation.creerClientSecret,
}));

import { executerAction } from "@/server/actions/enveloppe";
import { essaiErreurImprevue, essaiErreurPrevue } from "@/server/actions/essais";
import { echec, succes } from "@/shared/reponse";

function journalJoignable() {
  const abortSignal = vi.fn().mockResolvedValue({ data: null, error: null });
  simulation.rpc.mockReturnValue({ abortSignal });
  simulation.creerClientSecret.mockReturnValue({ rpc: simulation.rpc });
}

describe("executerAction", () => {
  beforeEach(() => {
    journalJoignable();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("renvoie la réussite telle quelle, sans rien journaliser", async () => {
    await expect(executerAction(async () => succes(42))).resolves.toEqual({ ok: true, donnees: 42 });
    expect(simulation.rpc).not.toHaveBeenCalled();
  });

  it("renvoie une erreur prévue telle quelle, sans rien journaliser", async () => {
    const reponse = echec("CONFLIT", "Cette demande a été modifiée.");
    await expect(executerAction(async () => reponse)).resolves.toBe(reponse);
    expect(simulation.rpc).not.toHaveBeenCalled();
  });

  it("transforme une erreur imprévue en ERREUR_INTERNE, journalisée avec le même code", async () => {
    const reponse = await executerAction(async () => {
      throw new Error("secret : dupont@exemple.fr");
    }, "essai");

    expect(reponse).toMatchObject({
      ok: false,
      code: "ERREUR_INTERNE",
      message: "Une erreur inattendue s'est produite.",
    });
    const codeSupport = reponse.ok ? undefined : reponse.codeSupport;
    expect(codeSupport).toMatch(/^[0-9A-Z]{1,7}$/);

    expect(simulation.rpc).toHaveBeenCalledTimes(1);
    expect(simulation.rpc).toHaveBeenCalledWith("ecrire_journal", {
      p_niveau: "erreur",
      p_evenement: "erreur_inattendue",
      p_details: { type: "action", action: "essai" },
      p_code_erreur: codeSupport,
    });
    // Jamais le message de l'erreur dans le journal.
    expect(JSON.stringify(simulation.rpc.mock.calls)).not.toContain("dupont");
  });

  it("écrit l'erreur d'origine dans la console du serveur, avec le code et l'action", async () => {
    const origine = new Error("détail technique");
    const reponse = await executerAction(async () => {
      throw origine;
    }, "essai");
    const codeSupport = reponse.ok ? "" : reponse.codeSupport!;

    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`code ${codeSupport}.*action essai`)),
      origine,
    );
  });

  it("donne la même réponse quand le journal est injoignable", async () => {
    simulation.creerClientSecret.mockImplementation(() => {
      throw new Error("SUPABASE_SECRET_KEY manquante");
    });
    const reponse = await executerAction(async () => {
      throw new Error("boum");
    });
    expect(reponse).toMatchObject({ ok: false, code: "ERREUR_INTERNE" });
    expect(reponse.ok ? undefined : reponse.codeSupport).toMatch(/^[0-9A-Z]{1,7}$/);
  });

  it("relance les erreurs internes de Next.js (redirect) sans les journaliser", async () => {
    await expect(
      executerAction(async () => {
        redirect("/connexion");
      }),
    ).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
    expect(simulation.rpc).not.toHaveBeenCalled();
  });
});

describe("actions d'essai", () => {
  beforeEach(() => {
    journalJoignable();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("erreur prévue : format commun, code de la liste fermée, message en français, rien au journal", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(essaiErreurPrevue()).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "1 champ est à corriger",
      champs: { email: "L'email est obligatoire" },
    });
    expect(simulation.rpc).not.toHaveBeenCalled();
  });

  it("erreur imprévue : ERREUR_INTERNE avec un code support, et une ligne au journal", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const reponse = await essaiErreurImprevue();
    expect(reponse).toMatchObject({ ok: false, code: "ERREUR_INTERNE" });
    expect(simulation.rpc).toHaveBeenCalledTimes(1);
  });

  it("hors développement : INTROUVABLE, rien au journal", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const action of [essaiErreurPrevue, essaiErreurImprevue]) {
      await expect(action()).resolves.toEqual({
        ok: false,
        code: "INTROUVABLE",
        message: "Cette page n'existe pas ou a été supprimée.",
      });
    }
    expect(simulation.rpc).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AD-13 : `journaliser` écrit par la fonction SQL `ecrire_journal`, avec la
// clé secrète, et ne lève jamais (un journal injoignable ne casse pas la page).

const simulation = vi.hoisted(() => {
  const abortSignal = vi.fn();
  const rpc = vi.fn(() => ({ abortSignal }));
  const creerClientSecret = vi.fn(() => ({ rpc }));
  return { abortSignal, rpc, creerClientSecret };
});

vi.mock("@/server/supabase-secret", () => ({
  creerClientSecret: simulation.creerClientSecret,
}));

import { EVENEMENTS_JOURNAL, journaliser } from "@/server/journal";

describe("journaliser", () => {
  beforeEach(() => {
    simulation.abortSignal.mockResolvedValue({ data: null, error: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("appelle ecrire_journal avec le niveau, l'événement, les détails et le code", async () => {
    await journaliser("erreur", "erreur_inattendue", { page: "/essais/erreur" }, "7F3A");

    expect(simulation.rpc).toHaveBeenCalledWith("ecrire_journal", {
      p_niveau: "erreur",
      p_evenement: "erreur_inattendue",
      p_details: { page: "/essais/erreur" },
      p_code_erreur: "7F3A",
    });
    // Délai maximum : la page n'attend pas indéfiniment le journal.
    expect(simulation.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("envoie des détails vides et aucun code par défaut", async () => {
    await journaliser("info", "sauvegarde_reussie");
    expect(simulation.rpc).toHaveBeenCalledWith("ecrire_journal", {
      p_niveau: "info",
      p_evenement: "sauvegarde_reussie",
      p_details: {},
      p_code_erreur: null,
    });
  });

  it("ne lève pas si la base refuse l'écriture", async () => {
    simulation.abortSignal.mockResolvedValue({ data: null, error: { code: "42501", message: "refus" } });
    await expect(journaliser("erreur", "erreur_inattendue")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("ne lève pas si la base est injoignable", async () => {
    simulation.abortSignal.mockRejectedValue(new TypeError("fetch failed"));
    await expect(journaliser("erreur", "erreur_inattendue")).resolves.toBeUndefined();
  });

  it("ne lève pas si la clé secrète manque", async () => {
    simulation.creerClientSecret.mockImplementationOnce(() => {
      throw new Error("SUPABASE_SECRET_KEY manquante");
    });
    await expect(journaliser("erreur", "erreur_inattendue")).resolves.toBeUndefined();
  });

  it("connaît exactement les 14 événements d'AD-13", () => {
    expect(EVENEMENTS_JOURNAL).toHaveLength(14);
    expect(new Set(EVENEMENTS_JOURNAL).size).toBe(14);
  });
});

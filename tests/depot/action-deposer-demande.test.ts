import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Server Function du dépôt (AD-1, AD-11, AD-12) et module `src/server/depot`
// (AD-2, AD-9), avec un client Supabase simulé : aucune demande n'est créée.
// Matrice de la story 1.3 : envoi correct, champ manquant, contournement,
// panne.

type Retour = { data: unknown; error: { code: string; message: string; details?: string } | null };

const simulation = vi.hoisted(() => {
  const retours: Record<string, () => Promise<Retour>> = {};
  const abortSignal = vi.fn();
  const rpc = vi.fn((nom: string) => ({
    abortSignal: (signal: AbortSignal) => {
      abortSignal(nom, signal);
      return retours[nom]();
    },
  }));
  return { retours, abortSignal, rpc, creerClientSecret: vi.fn(() => ({ rpc })) };
});

vi.mock("@/server/supabase-secret", () => ({
  creerClientSecret: simulation.creerClientSecret,
}));

import { actionDeposerDemande } from "@/server/actions/deposer-demande";
import { MESSAGES_DEPOT } from "@/shared/messages";

import { CATEGORIES, SAISIE_DE_CLAIRE } from "../aides/formulaire-depot";

const appels = (nom: string) => simulation.rpc.mock.calls.filter(([fonction]) => fonction === nom);

function baseRepond(retour: Retour) {
  simulation.retours.deposer_demande = () => Promise.resolve(retour);
}

beforeEach(() => {
  simulation.creerClientSecret.mockImplementation(() => ({ rpc: simulation.rpc }));
  simulation.retours.ecrire_journal = () => Promise.resolve({ data: null, error: null });
  baseRepond({ data: "NOVA-2026-0001", error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("envoi correct", () => {
  it("répond avec la référence attribuée par la base", async () => {
    await expect(actionDeposerDemande(SAISIE_DE_CLAIRE)).resolves.toEqual({
      ok: true,
      donnees: { reference: "NOVA-2026-0001" },
    });
  });

  it("appelle une seule fois deposer_demande, avec la saisie nettoyée et rien d'autre", async () => {
    await actionDeposerDemande({
      ...SAISIE_DE_CLAIRE,
      nom: "  Claire Martin  ",
      telephone: " 02 99 00 00 00 ",
      entreprise: "   ",
    });

    expect(simulation.rpc).toHaveBeenCalledTimes(1);
    expect(simulation.rpc).toHaveBeenCalledWith("deposer_demande", {
      p_nom: "Claire Martin",
      p_email: "claire.martin@cabinet-martin.fr",
      p_telephone: "02 99 00 00 00",
      p_entreprise: null,
      p_categorie_id: CATEGORIES[1].id,
      p_objet: SAISIE_DE_CLAIRE.objet,
      p_description: SAISIE_DE_CLAIRE.description,
      p_personne_informee: true,
    });
  });

  it("n'écrit rien au journal technique : il ne reçoit jamais de donnée de demandeur", async () => {
    await actionDeposerDemande(SAISIE_DE_CLAIRE);
    expect(appels("ecrire_journal")).toHaveLength(0);
  });

  it("n'attend pas indéfiniment la base (délai maximum)", async () => {
    await actionDeposerDemande(SAISIE_DE_CLAIRE);
    expect(simulation.abortSignal).toHaveBeenCalledWith("deposer_demande", expect.any(AbortSignal));
  });
});

describe("champ manquant", () => {
  it("email oublié : VALIDATION, « 1 champ est à corriger », rien en base", async () => {
    await expect(actionDeposerDemande({ ...SAISIE_DE_CLAIRE, email: "" })).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "1 champ est à corriger",
      champs: { email: "L'email est obligatoire" },
    });
    expect(simulation.creerClientSecret).not.toHaveBeenCalled();
    expect(simulation.rpc).not.toHaveBeenCalled();
  });

  it("plusieurs champs : le message les compte", async () => {
    const reponse = await actionDeposerDemande({
      ...SAISIE_DE_CLAIRE,
      email: "claire@",
      objet: "o".repeat(151),
      description: "123456789",
    });
    expect(reponse).toEqual({
      ok: false,
      code: "VALIDATION",
      message: "3 champs sont à corriger",
      champs: {
        email: "L'email doit avoir la forme nom@exemple.fr",
        objet: "L'objet ne doit pas dépasser 150 caractères",
        description: "La description doit faire au moins 10 caractères",
      },
    });
    expect(simulation.rpc).not.toHaveBeenCalled();
  });
});

describe("contournement (appel direct de l'action)", () => {
  it("sans la case : VALIDATION, rien en base", async () => {
    const sansCase: Record<string, unknown> = { ...SAISIE_DE_CLAIRE };
    delete sansCase.personneInformee;

    for (const saisie of [sansCase, { ...SAISIE_DE_CLAIRE, personneInformee: false }, { ...SAISIE_DE_CLAIRE, personneInformee: "true" }]) {
      await expect(actionDeposerDemande(saisie)).resolves.toEqual({
        ok: false,
        code: "VALIDATION",
        message: "1 champ est à corriger",
        champs: { personneInformee: MESSAGES_DEPOT.caseObligatoire },
      });
    }
    expect(simulation.rpc).not.toHaveBeenCalled();
  });

  it("catégorie inactive : refusée par la base (NV002), rendue comme une erreur de saisie", async () => {
    baseRepond({ data: null, error: { code: "NV002", message: "Demande refusée : catégorie inconnue ou désactivée." } });

    await expect(actionDeposerDemande(SAISIE_DE_CLAIRE)).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "1 champ est à corriger",
      champs: { categorieId: MESSAGES_DEPOT.categorieIndisponible },
    });
    // Erreur prévue : jamais levée, rien au journal.
    expect(appels("ecrire_journal")).toHaveLength(0);
  });

  it("case refusée par la base elle-même (NV001) : même erreur de saisie", async () => {
    baseRepond({ data: null, error: { code: "NV001", message: "Demande refusée : la case n'est pas cochée." } });

    await expect(actionDeposerDemande(SAISIE_DE_CLAIRE)).resolves.toMatchObject({
      ok: false,
      code: "VALIDATION",
      champs: { personneInformee: MESSAGES_DEPOT.caseObligatoire },
    });
  });

  it("n'importe quoi à la place de la saisie : VALIDATION, jamais d'exception", async () => {
    for (const saisie of [undefined, null, "texte", 42, [], new Map()]) {
      const reponse = await actionDeposerDemande(saisie);
      expect(reponse).toMatchObject({ ok: false, code: "VALIDATION", message: "6 champs sont à corriger" });
    }
    expect(simulation.rpc).not.toHaveBeenCalled();
  });

  it("ne transmet à la base ni statut, ni priorité, ni canal, ni référence glissés dans la saisie", async () => {
    await actionDeposerDemande({
      ...SAISIE_DE_CLAIRE,
      statut: "traitee",
      priorite: "urgente",
      canal: "telephone",
      reference: "NOVA-2026-9999",
      p_statut: "traitee",
    });
    const [, charge] = appels("deposer_demande")[0] as unknown as [string, Record<string, unknown>];
    expect(Object.keys(charge)).toEqual([
      "p_nom",
      "p_email",
      "p_telephone",
      "p_entreprise",
      "p_categorie_id",
      "p_objet",
      "p_description",
      "p_personne_informee",
    ]);
    expect(JSON.stringify(charge)).not.toMatch(/traitee|urgente|9999|statut|priorite|canal|reference/);
  });
});

describe("panne", () => {
  const attendue = {
    ok: false,
    code: "ERREUR_INTERNE",
    message: "Une erreur inattendue s'est produite.",
  };

  it("la base refuse (refus imprévu) : ERREUR_INTERNE avec un code, journalisée par l'enveloppe", async () => {
    baseRepond({
      data: null,
      error: {
        code: "23514",
        message: 'new row for relation "demandes" violates check constraint "demandes_objet_check"',
        details: "Failing row contains (Claire Martin, claire.martin@cabinet-martin.fr, …).",
      },
    });

    const reponse = await actionDeposerDemande(SAISIE_DE_CLAIRE);

    expect(reponse).toMatchObject(attendue);
    const codeSupport = reponse.ok ? undefined : reponse.codeSupport;
    expect(codeSupport).toMatch(/^[0-9A-Z]{1,7}$/);
    expect(appels("ecrire_journal")).toEqual([
      [
        "ecrire_journal",
        {
          p_niveau: "erreur",
          p_evenement: "erreur_inattendue",
          p_details: { type: "action", action: "deposer_demande" },
          p_code_erreur: codeSupport,
        },
      ],
    ]);
  });

  it("ne laisse aucune donnée du demandeur dans le journal ni dans la console du serveur", async () => {
    baseRepond({
      data: null,
      error: {
        code: "23514",
        message: "refus",
        details: "Failing row contains (Claire Martin, claire.martin@cabinet-martin.fr, …).",
      },
    });

    await actionDeposerDemande(SAISIE_DE_CLAIRE);

    const traces = JSON.stringify([
      appels("ecrire_journal"),
      vi.mocked(console.error).mock.calls.map((arguments_) =>
        arguments_.map((valeur) => (valeur instanceof Error ? `${valeur.message} ${String(valeur.cause ?? "")}` : valeur)),
      ),
    ]);
    expect(traces).toContain("23514");
    expect(traces).not.toMatch(/Claire|cabinet-martin|facturation/);
  });

  it("la base ne répond pas : ERREUR_INTERNE", async () => {
    baseRepond({ data: null, error: { code: "", message: "TimeoutError: The operation was aborted due to timeout" } });
    await expect(actionDeposerDemande(SAISIE_DE_CLAIRE)).resolves.toMatchObject(attendue);

    simulation.retours.deposer_demande = () => Promise.reject(new TypeError("fetch failed"));
    await expect(actionDeposerDemande(SAISIE_DE_CLAIRE)).resolves.toMatchObject(attendue);
  });

  it("clé secrète absente : ERREUR_INTERNE, même si le journal est injoignable lui aussi", async () => {
    simulation.creerClientSecret.mockImplementation(() => {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY manquante (voir .env.example).");
    });
    await expect(actionDeposerDemande(SAISIE_DE_CLAIRE)).resolves.toMatchObject(attendue);
  });

  it("la base répond sans référence : ERREUR_INTERNE, aucune fausse réussite", async () => {
    for (const data of [null, "", "NOVA-26-1", { reference: "NOVA-2026-0001" }]) {
      baseRepond({ data, error: null });
      await expect(actionDeposerDemande(SAISIE_DE_CLAIRE)).resolves.toMatchObject(attendue);
    }
  });
});

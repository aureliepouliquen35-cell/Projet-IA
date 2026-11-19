import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Server Function du dépôt (AD-1, AD-11, AD-12, AD-20) et module
// `src/server/depot` (AD-2, AD-9), avec un client Supabase et des cookies
// simulés : aucune demande n'est créée.
// Matrices des stories 1.3 (envoi correct, champ manquant, contournement,
// panne) et 1.4 (cookie de confirmation, double envoi, numéro d'envoi).

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
  /** Cookies posés par la réponse : nom → [valeur, options]. */
  const cookiesPoses = new Map<string, [string, Record<string, unknown>]>();
  const cookies = vi.fn(async () => ({
    set: (nom: string, valeur: string, options: Record<string, unknown>) => {
      cookiesPoses.set(nom, [valeur, options]);
    },
    get: () => undefined,
  }));
  return { retours, abortSignal, rpc, creerClientSecret: vi.fn(() => ({ rpc })), cookiesPoses, cookies };
});

vi.mock("@/server/supabase-secret", () => ({
  creerClientSecret: simulation.creerClientSecret,
}));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));

import { actionDeposerDemande } from "@/server/actions/deposer-demande";
import { COOKIE_CONFIRMATION, dechiffrerPassage } from "@/server/passage";
import { MESSAGES_DEPOT } from "@/shared/messages";

import { CATEGORIES, LIGNE_DEPOSEE, NUMERO_ENVOI, SAISIE_DE_CLAIRE } from "../aides/formulaire-depot";

const SECRET_ESSAI = "secret-d-essai-des-cookies-de-passage-0123456789";

const appels = (nom: string) => simulation.rpc.mock.calls.filter(([fonction]) => fonction === nom);

function baseRepond(retour: Retour) {
  simulation.retours.deposer_demande = () => Promise.resolve(retour);
}

beforeEach(() => {
  simulation.creerClientSecret.mockImplementation(() => ({ rpc: simulation.rpc }));
  simulation.retours.ecrire_journal = () => Promise.resolve({ data: null, error: null });
  baseRepond({ data: [LIGNE_DEPOSEE], error: null });
  simulation.cookiesPoses.clear();
  vi.stubEnv("SECRET_COOKIES", SECRET_ESSAI);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Contenu du cookie de confirmation posé par la réponse, déchiffré. */
function confirmationPosee(): unknown {
  const [valeur] = simulation.cookiesPoses.get(COOKIE_CONFIRMATION) ?? [];
  return dechiffrerPassage(COOKIE_CONFIRMATION, valeur);
}

describe("envoi correct", () => {
  it("répond avec la référence attribuée par la base", async () => {
    await expect(actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI)).resolves.toEqual({
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
    }, NUMERO_ENVOI);

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
      p_numero_envoi: NUMERO_ENVOI,
    });
  });

  it("n'écrit rien au journal technique : il ne reçoit jamais de donnée de demandeur", async () => {
    await actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI);
    expect(appels("ecrire_journal")).toHaveLength(0);
  });

  it("n'attend pas indéfiniment la base (délai maximum)", async () => {
    await actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI);
    expect(simulation.abortSignal).toHaveBeenCalledWith("deposer_demande", expect.any(AbortSignal));
  });
});

describe("champ manquant", () => {
  it("email oublié : VALIDATION, « 1 champ est à corriger », rien en base", async () => {
    await expect(actionDeposerDemande({ ...SAISIE_DE_CLAIRE, email: "" }, NUMERO_ENVOI)).resolves.toEqual({
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
    }, NUMERO_ENVOI);
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
      await expect(actionDeposerDemande(saisie, NUMERO_ENVOI)).resolves.toEqual({
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

    await expect(actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI)).resolves.toEqual({
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

    await expect(actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI)).resolves.toMatchObject({
      ok: false,
      code: "VALIDATION",
      champs: { personneInformee: MESSAGES_DEPOT.caseObligatoire },
    });
  });

  it("n'importe quoi à la place de la saisie : VALIDATION, jamais d'exception", async () => {
    for (const saisie of [undefined, null, "texte", 42, [], new Map()]) {
      const reponse = await actionDeposerDemande(saisie, NUMERO_ENVOI);
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
    }, NUMERO_ENVOI);
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
      "p_numero_envoi",
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

    const reponse = await actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI);

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

    await actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI);

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
    await expect(actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI)).resolves.toMatchObject(attendue);

    simulation.retours.deposer_demande = () => Promise.reject(new TypeError("fetch failed"));
    await expect(actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI)).resolves.toMatchObject(attendue);
  });

  it("clé secrète absente : ERREUR_INTERNE, même si le journal est injoignable lui aussi", async () => {
    simulation.creerClientSecret.mockImplementation(() => {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY manquante (voir .env.example).");
    });
    await expect(actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI)).resolves.toMatchObject(attendue);
  });

  it("la base répond sans référence : ERREUR_INTERNE, aucune fausse réussite", async () => {
    for (const data of [
      null,
      "",
      "NOVA-2026-0001",
      [],
      [{ ...LIGNE_DEPOSEE, reference: "NOVA-26-1" }],
      [{ reference: "NOVA-2026-0001" }],
      [{ ...LIGNE_DEPOSEE, objet: null }],
      [{ ...LIGNE_DEPOSEE, email: "" }],
      [LIGNE_DEPOSEE, { ...LIGNE_DEPOSEE, reference: "NOVA-2026-0002" }],
      LIGNE_DEPOSEE,
    ]) {
      baseRepond({ data, error: null });
      await expect(actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI)).resolves.toMatchObject(attendue);
    }
    // Jamais de confirmation sans demande enregistrée.
    expect(simulation.cookiesPoses.size).toBe(0);
  });

  it("panne : aucun cookie de confirmation", async () => {
    simulation.retours.deposer_demande = () => Promise.reject(new TypeError("fetch failed"));
    await actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI);
    expect(simulation.cookiesPoses.size).toBe(0);
  });

  it("secret des cookies absent ou trop court : ERREUR_INTERNE, et rien n'est enregistré", async () => {
    for (const secret of ["", "trop-court"]) {
      vi.stubEnv("SECRET_COOKIES", secret);
      await expect(actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI)).resolves.toMatchObject(attendue);
    }
    // Vérifié avant d'appeler la base : pas de demande sans confirmation.
    expect(appels("deposer_demande")).toHaveLength(0);
    expect(simulation.cookiesPoses.size).toBe(0);
  });
});

describe("cookie de confirmation (AD-20)", () => {
  it("réussite : pose le cookie avec la référence, l'objet et l'email renvoyés par la base", async () => {
    await actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI);
    expect(confirmationPosee()).toEqual({ type: "confirmation", ...LIGNE_DEPOSEE });
  });

  it("le cookie est illisible : ni la référence ni l'email n'y apparaissent en clair", async () => {
    await actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI);
    const [valeur = ""] = simulation.cookiesPoses.get(COOKIE_CONFIRMATION) ?? [];
    expect(valeur).toMatch(/^[A-Za-z0-9_-]+$/);
    const decode = Buffer.from(valeur, "base64url").toString("latin1");
    for (const texte of [valeur, decode]) {
      expect(texte).not.toMatch(/NOVA|claire|cabinet-martin|facturation/i);
    }
  });

  it("le cookie est httpOnly, sameSite lax, secure hors développement, valable 30 minutes, limité à /confirmation", async () => {
    await actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI);
    expect(simulation.cookiesPoses.get(COOKIE_CONFIRMATION)?.[1]).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/confirmation",
      maxAge: 1800,
    });

    vi.stubEnv("NODE_ENV", "development");
    await actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI);
    expect(simulation.cookiesPoses.get(COOKIE_CONFIRMATION)?.[1]).toMatchObject({ secure: false });
  });

  it("la réponse au navigateur ne contient que la référence : ni objet ni email", async () => {
    const reponse = await actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI);
    expect(reponse).toEqual({ ok: true, donnees: { reference: "NOVA-2026-0001" } });
  });

  it("saisie refusée (par l'action ou par la base) : aucun cookie", async () => {
    await actionDeposerDemande({ ...SAISIE_DE_CLAIRE, email: "" }, NUMERO_ENVOI);
    baseRepond({ data: null, error: { code: "NV002", message: "catégorie désactivée" } });
    await actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI);
    expect(simulation.cookiesPoses.size).toBe(0);
  });
});

describe("double envoi (AD-20)", () => {
  it("transmet le numéro d'envoi à la base, en minuscules", async () => {
    await actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI.toUpperCase());
    const [, charge] = appels("deposer_demande")[0] as unknown as [string, Record<string, unknown>];
    expect(charge.p_numero_envoi).toBe(NUMERO_ENVOI);
  });

  it("même numéro envoyé deux fois : le second reçoit la référence, l'objet et l'email de la première", async () => {
    // La base renvoie la demande déjà créée, même si la seconde saisie diffère.
    await actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI);
    const second = await actionDeposerDemande(
      { ...SAISIE_DE_CLAIRE, objet: "Autre objet", email: "autre@exemple.fr" },
      NUMERO_ENVOI,
    );

    expect(second).toEqual({ ok: true, donnees: { reference: "NOVA-2026-0001" } });
    expect(confirmationPosee()).toEqual({ type: "confirmation", ...LIGNE_DEPOSEE });
    const numeros = (appels("deposer_demande") as unknown as [string, Record<string, unknown>][]).map(
      ([, charge]) => charge.p_numero_envoi,
    );
    expect(numeros).toEqual([NUMERO_ENVOI, NUMERO_ENVOI]);
  });

  it("numéro d'envoi absent ou mal formé : VALIDATION sans champ, rien en base", async () => {
    for (const numero of [undefined, null, "", "123", 42, "NOVA-2026-0001", `${NUMERO_ENVOI} `]) {
      const reponse = await actionDeposerDemande(SAISIE_DE_CLAIRE, numero);
      expect(reponse).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(reponse.ok ? undefined : reponse.champs).toBeUndefined();
    }
    expect(simulation.rpc).not.toHaveBeenCalled();
    expect(simulation.cookiesPoses.size).toBe(0);
  });

  it("une saisie incorrecte est signalée champ par champ, même sans numéro d'envoi", async () => {
    await expect(actionDeposerDemande({ ...SAISIE_DE_CLAIRE, email: "" }, undefined)).resolves.toMatchObject({
      code: "VALIDATION",
      champs: { email: "L'email est obligatoire" },
    });
  });
});

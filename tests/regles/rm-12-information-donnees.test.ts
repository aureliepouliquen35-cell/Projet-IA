import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RM-12 : aucune demande ne peut être créée sans que la personne ait été
// informée de l'usage de ses données (case cochée par le demandeur, FR-5).
// Trois barrières : le formulaire, la Server Function, la base.

const simulation = vi.hoisted(() => {
  const retour: { data: unknown; error: { code: string; message: string } | null } = {
    data: [{ reference: "NOVA-2026-0001", objet: "Objet", email: "claire@exemple.fr" }],
    error: null,
  };
  const rpc = vi.fn(() => ({ abortSignal: vi.fn(() => Promise.resolve(retour)) }));
  return { retour, rpc, creerClientSecret: vi.fn(() => ({ rpc })) };
});

vi.mock("@/server/supabase-secret", () => ({
  creerClientSecret: simulation.creerClientSecret,
}));
// Cookie de confirmation (AD-20) : posé dans le vide.
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: () => {}, get: () => undefined }),
}));

import { actionDeposerDemande } from "@/server/actions/deposer-demande";
import { MESSAGES_DEPOT } from "@/shared/messages";
import { validerDepot, VALEURS_DEPOT_VIDES } from "@/shared/schemas/depot";

import { LIGNE_DEPOSEE, NUMERO_ENVOI, rendreVue, SAISIE_DE_CLAIRE } from "../aides/formulaire-depot";
import {
  definitionColonne,
  fonctionDeposerDemande,
  fonctionDeposerDemandeEnvoi,
} from "../aides/migration-depot";

const MESSAGE = "Cochez la case pour confirmer avoir lu l'usage de vos données";

beforeEach(() => {
  vi.stubEnv("SECRET_COOKIES", "secret-d-essai-des-cookies-de-passage-0123456789");
  simulation.retour.data = [LIGNE_DEPOSEE];
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  simulation.retour.error = null;
});

describe("RM-12 — le formulaire", () => {
  it("la case n'est jamais cochée d'avance", () => {
    expect(VALEURS_DEPOT_VIDES.personneInformee).toBe(false);
    expect(rendreVue()).toMatch(/<button[^>]*role="checkbox"[^>]*aria-checked="false"/);
  });

  it("le schéma n'accepte que la case cochée, avec le message exact de l'UX", () => {
    expect(MESSAGES_DEPOT.caseObligatoire).toBe(MESSAGE);
    expect(validerDepot(SAISIE_DE_CLAIRE).ok).toBe(true);
    for (const personneInformee of [false, undefined, null, "true", 1, "on"]) {
      expect(validerDepot({ ...SAISIE_DE_CLAIRE, personneInformee })).toEqual({
        ok: false,
        champs: { personneInformee: MESSAGE },
      });
    }
  });
});

describe("RM-12 — la Server Function", () => {
  it("refuse sans la case, avant tout appel à la base", async () => {
    await expect(
      actionDeposerDemande({ ...SAISIE_DE_CLAIRE, personneInformee: false }, NUMERO_ENVOI),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "1 champ est à corriger",
      champs: { personneInformee: MESSAGE },
    });
    expect(simulation.creerClientSecret).not.toHaveBeenCalled();
    expect(simulation.rpc).not.toHaveBeenCalled();
  });

  it("transmet à la base que la case est cochée", async () => {
    await actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI);
    expect(simulation.rpc).toHaveBeenCalledWith(
      "deposer_demande",
      expect.objectContaining({ p_personne_informee: true }),
    );
  });

  it("traduit le refus de la base (NV001) en erreur de saisie sur la case", async () => {
    simulation.retour.data = null;
    simulation.retour.error = { code: "NV001", message: "Demande refusée" };
    await expect(actionDeposerDemande(SAISIE_DE_CLAIRE, NUMERO_ENVOI)).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "1 champ est à corriger",
      champs: { personneInformee: MESSAGE },
    });
  });
});

describe("RM-12 — la base", () => {
  it("la colonne est obligatoire et ne peut contenir que « vrai »", () => {
    expect(definitionColonne("demandes", "personne_informee")).toMatch(
      /^boolean not null constraint \w+ check \(personne_informee\)$/,
    );
  });

  it("deposer_demande refuse (NV001) si la case n'est pas cochée, y compris si elle est absente", () => {
    const { corps } = fonctionDeposerDemande();
    // `is not true` couvre « faux » et l'absence de valeur (null).
    expect(corps).toMatch(
      /if p_personne_informee is not true then\s+raise exception '[^;]*'\s+using errcode = 'nv001';\s+end if;/,
    );
  });

  it("ce refus arrive avant toute écriture : ni numéro pris, ni demande, ni événement", () => {
    const { corps } = fonctionDeposerDemande();
    expect(corps.indexOf("errcode = 'nv001'")).toBeGreaterThan(-1);
    expect(corps.indexOf("errcode = 'nv001'")).toBeLessThan(corps.indexOf("insert into"));
  });

  it("la fonction à numéro d'envoi (story 1.4) refuse de même, avant toute écriture", () => {
    const { corps } = fonctionDeposerDemandeEnvoi();
    expect(corps).toMatch(
      /if p_personne_informee is not true then\s+raise exception '[^;]*'\s+using errcode = 'nv001';\s+end if;/,
    );
    expect(corps.indexOf("errcode = 'nv001'")).toBeLessThan(corps.indexOf("insert into"));
  });

  it("un second envoi ne renvoie qu'une demande déjà créée, donc déjà passée par ce refus", () => {
    // Avant le refus, la fonction ne fait que chercher une demande existante
    // (et la renvoie) : elle n'en crée jamais sans la case cochée.
    const { corps } = fonctionDeposerDemandeEnvoi();
    const avant = corps.slice(0, corps.indexOf("errcode = 'nv001'"));
    expect(avant).not.toMatch(/insert into|update |delete /);
    expect(avant).toMatch(/from public\.demandes d\s+where d\.numero_envoi = p_numero_envoi;/);
  });
});

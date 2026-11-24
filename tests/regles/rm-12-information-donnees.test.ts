import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RM-12 : aucune demande ne peut être créée sans que la personne ait été
// informée de l'usage de ses données (case cochée par le demandeur, FR-5,
// ou, pour une demande saisie par un utilisateur interne, case « La
// personne a été informée de l'usage de ses données », FR-30).
// Trois barrières pour chacune : le formulaire, la Server Function, la base.

const simulation = vi.hoisted(() => {
  const retour: { data: unknown; error: { code: string; message: string } | null } = {
    data: [{ reference: "NOVA-2026-0001", objet: "Objet", email: "claire@exemple.fr" }],
    error: null,
  };
  const rpc = vi.fn(() => ({ abortSignal: vi.fn(() => Promise.resolve(retour)) }));
  // Saisie interne (story 2.3) : la fonction SQL est appelée avec la session.
  const retourSession: { data: unknown; error: { code: string; message: string } | null } = {
    data: [{ reference: "NOVA-2026-0002" }],
    error: null,
  };
  const rpcSession = vi.fn((nom: string, parametres: Record<string, unknown>) => {
    void nom;
    void parametres;
    return { abortSignal: vi.fn(() => Promise.resolve(retourSession)) };
  });
  return {
    retour,
    rpc,
    creerClientSecret: vi.fn(() => ({ rpc })),
    retourSession,
    rpcSession,
    createClient: vi.fn(async () => ({ rpc: rpcSession })),
  };
});

vi.mock("@/server/supabase-secret", () => ({
  creerClientSecret: simulation.creerClientSecret,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
// Personne connectée (la garde est vérifiée par les tests de la saisie).
vi.mock("@/server/garde", () => ({
  exigerUtilisateur: async () => ({ id: "k", nom: "Karim Benali", role: "collaborateur", doitChangerMdp: false }),
}));
vi.mock("next/cache", () => ({ refresh: () => {} }));
// Cookie de confirmation (AD-20) : posé dans le vide.
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: () => {}, get: () => undefined }),
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { ETAT_SAISIE_INITIAL, VueFormulaireSaisie } from "@/app/(interne)/demandes/nouvelle/formulaire-saisie";
import { actionDeposerDemande } from "@/server/actions/deposer-demande";
import { actionSaisirDemande } from "@/server/actions/saisir-demande";
import { MESSAGES_DEPOT, MESSAGES_SAISIE } from "@/shared/messages";
import { validerDepot, VALEURS_DEPOT_VIDES } from "@/shared/schemas/depot";
import { validerSaisieInterne, VALEURS_SAISIE_VIDES } from "@/shared/schemas/saisie";

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
  simulation.retourSession.data = [{ reference: "NOVA-2026-0002" }];
  simulation.retourSession.error = null;
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

// ---------------------------------------------------------------------------
// Saisie interne (story 2.3, écran I5) : la case « La personne a été
// informée de l'usage de ses données » remplace celle du demandeur.
// ---------------------------------------------------------------------------

const MESSAGE_SAISIE = "Confirmez que la personne a été informée de l'usage de ses données";
const SAISIE_INTERNE = { ...SAISIE_DE_CLAIRE, canal: "telephone" };

/** Texte SQL de la migration de la saisie interne, sans commentaires, en minuscules. */
const SQL_SAISIE = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261124100000_saisie_demande.sql"),
  "utf8",
)
  .replace(/--.*$/gm, "")
  .toLowerCase();
const CORPS_SAISIR =
  SQL_SAISIE.match(/create function public\.saisir_demande\([\s\S]*?as \$\$([\s\S]*?)\$\$;/)?.[1] ?? "";

describe("RM-12 — le formulaire de saisie interne (I5)", () => {
  it("la case n'est jamais cochée d'avance", () => {
    expect(VALEURS_SAISIE_VIDES.personneInformee).toBe(false);
    const html = renderToStaticMarkup(
      createElement(VueFormulaireSaisie, {
        categories: [],
        contactDonnees: "donnees@nova-services.example",
        etat: ETAT_SAISIE_INITIAL,
      }),
    );
    expect(html).toMatch(/<button[^>]*role="checkbox"[^>]*aria-checked="false"/);
    expect(html).toContain("La personne a été informée de l&#x27;usage de ses données.");
  });

  it("le schéma n'accepte que la case cochée, avec le message exact de l'UX", () => {
    expect(MESSAGES_SAISIE.caseObligatoire).toBe(MESSAGE_SAISIE);
    expect(validerSaisieInterne(SAISIE_INTERNE).ok).toBe(true);
    for (const personneInformee of [false, undefined, null, "true", 1, "on"]) {
      expect(validerSaisieInterne({ ...SAISIE_INTERNE, personneInformee })).toEqual({
        ok: false,
        champs: { personneInformee: MESSAGE_SAISIE },
      });
    }
  });
});

describe("RM-12 — la Server Function de saisie interne", () => {
  it("refuse sans la case, avant tout appel à la base", async () => {
    await expect(
      actionSaisirDemande({ ...SAISIE_INTERNE, personneInformee: false }, NUMERO_ENVOI),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "1 champ est à corriger",
      champs: { personneInformee: MESSAGE_SAISIE },
    });
    expect(simulation.createClient).not.toHaveBeenCalled();
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("transmet à la base que la case est cochée", async () => {
    await actionSaisirDemande(SAISIE_INTERNE, NUMERO_ENVOI);
    expect(simulation.rpcSession).toHaveBeenCalledWith(
      "saisir_demande",
      expect.objectContaining({ p_personne_informee: true }),
    );
  });

  it("traduit le refus de la base (NV001) en erreur de saisie sur la case", async () => {
    simulation.retourSession.data = null;
    simulation.retourSession.error = { code: "NV001", message: "Demande refusée" };
    await expect(actionSaisirDemande(SAISIE_INTERNE, NUMERO_ENVOI)).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "1 champ est à corriger",
      champs: { personneInformee: MESSAGE_SAISIE },
    });
  });
});

describe("RM-12 — la base, pour la saisie interne", () => {
  it("saisir_demande refuse (NV001) si la case n'est pas cochée, y compris si elle est absente", () => {
    expect(CORPS_SAISIR).toMatch(
      /if p_personne_informee is not true then\s+raise exception '[^;]*'\s+using errcode = 'nv001';\s+end if;/,
    );
  });

  it("ce refus arrive avant toute écriture : ni numéro pris, ni demande, ni événement", () => {
    expect(CORPS_SAISIR.indexOf("errcode = 'nv001'")).toBeGreaterThan(-1);
    expect(CORPS_SAISIR.indexOf("errcode = 'nv001'")).toBeLessThan(CORPS_SAISIR.indexOf("insert into"));
  });

  it("un second envoi ne renvoie qu'une demande déjà créée, donc déjà passée par ce refus", () => {
    const avant = CORPS_SAISIR.slice(0, CORPS_SAISIR.indexOf("errcode = 'nv001'"));
    expect(avant).not.toMatch(/insert into|update |delete /);
    expect(avant).toMatch(/from public\.demandes d\s+where d\.numero_envoi = p_numero_envoi;/);
  });

  it("la demande saisie porte « vrai », seule valeur que la colonne accepte", () => {
    expect(CORPS_SAISIR).toMatch(/p_canal,\s+true,\s+p_numero_envoi,/);
  });
});

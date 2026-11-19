import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RM-1 : une demande créée a toujours le statut « Nouvelle » et la priorité
// « Normale ». La règle est gardée par la base : ce sont les valeurs par
// défaut de la table, et rien ne permet d'en choisir d'autres au dépôt.

const simulation = vi.hoisted(() => {
  const rpc = vi.fn(() => ({
    abortSignal: vi.fn().mockResolvedValue({
      data: [{ reference: "NOVA-2026-0001", objet: "Objet", email: "claire@exemple.fr" }],
      error: null,
    }),
  }));
  return { rpc, creerClientSecret: vi.fn(() => ({ rpc })) };
});

vi.mock("@/server/supabase-secret", () => ({
  creerClientSecret: simulation.creerClientSecret,
}));
// Cookie de confirmation (AD-20) : posé dans le vide.
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: () => {}, get: () => undefined }),
}));

import { actionDeposerDemande } from "@/server/actions/deposer-demande";

import { NUMERO_ENVOI, SAISIE_DE_CLAIRE } from "../aides/formulaire-depot";
import {
  definitionColonne,
  fonctionDeposerDemande,
  fonctionDeposerDemandeEnvoi,
} from "../aides/migration-depot";

beforeEach(() => vi.stubEnv("SECRET_COOKIES", "secret-d-essai-des-cookies-de-passage-0123456789"));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("RM-1 — statut « nouvelle » et priorité « normale » à la création", () => {
  it("la table les donne par défaut", () => {
    expect(definitionColonne("demandes", "statut")).toMatch(/^text not null default 'nouvelle' /);
    expect(definitionColonne("demandes", "priorite")).toMatch(/^text not null default 'normale' /);
  });

  it("deposer_demande ne reçoit ni statut ni priorité", () => {
    const { parametres } = fonctionDeposerDemande();
    expect(parametres).toEqual([
      "p_nom",
      "p_email",
      "p_telephone",
      "p_entreprise",
      "p_categorie_id",
      "p_objet",
      "p_description",
      "p_personne_informee",
    ]);
  });

  it("deposer_demande n'écrit ni statut ni priorité : les valeurs par défaut s'appliquent", () => {
    const { corps } = fonctionDeposerDemande();
    expect(corps).toContain("insert into public.demandes");
    expect(corps).not.toMatch(/statut|priorite|urgente|en_cours|traitee/);
  });

  it("la fonction à numéro d'envoi (story 1.4) ne reçoit et n'écrit, elle non plus, ni statut ni priorité", () => {
    const { parametres, corps } = fonctionDeposerDemandeEnvoi();
    expect(parametres).toEqual([
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
    expect(corps).toContain("insert into public.demandes");
    expect(corps).not.toMatch(/statut|priorite|urgente|en_cours|traitee/);
  });

  it("la Server Function ne transmet ni statut ni priorité, même glissés dans la saisie", async () => {
    await actionDeposerDemande({ ...SAISIE_DE_CLAIRE, statut: "traitee", priorite: "urgente" }, NUMERO_ENVOI);

    expect(simulation.rpc).toHaveBeenCalledTimes(1);
    const [, charge] = simulation.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(Object.keys(charge).join(" ")).not.toMatch(/statut|priorite/);
    expect(JSON.stringify(charge)).not.toMatch(/traitee|urgente/);
  });
});

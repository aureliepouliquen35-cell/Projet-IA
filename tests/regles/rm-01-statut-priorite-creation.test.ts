import { afterEach, describe, expect, it, vi } from "vitest";

// RM-1 : une demande créée a toujours le statut « Nouvelle » et la priorité
// « Normale ». La règle est gardée par la base : ce sont les valeurs par
// défaut de la table, et rien ne permet d'en choisir d'autres au dépôt.

const simulation = vi.hoisted(() => {
  const rpc = vi.fn(() => ({
    abortSignal: vi.fn().mockResolvedValue({ data: "NOVA-2026-0001", error: null }),
  }));
  return { rpc, creerClientSecret: vi.fn(() => ({ rpc })) };
});

vi.mock("@/server/supabase-secret", () => ({
  creerClientSecret: simulation.creerClientSecret,
}));

import { actionDeposerDemande } from "@/server/actions/deposer-demande";

import { SAISIE_DE_CLAIRE } from "../aides/formulaire-depot";
import { definitionColonne, fonctionDeposerDemande } from "../aides/migration-depot";

afterEach(() => vi.clearAllMocks());

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

  it("la Server Function ne transmet ni statut ni priorité, même glissés dans la saisie", async () => {
    await actionDeposerDemande({ ...SAISIE_DE_CLAIRE, statut: "traitee", priorite: "urgente" });

    expect(simulation.rpc).toHaveBeenCalledTimes(1);
    const [, charge] = simulation.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(Object.keys(charge).join(" ")).not.toMatch(/statut|priorite/);
    expect(JSON.stringify(charge)).not.toMatch(/traitee|urgente/);
  });
});

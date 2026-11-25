import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RM-9 : il reste toujours au moins un administrateur actif (FR-25, AD-10).
// - désactiver le dernier administrateur actif est refusé, y compris son
//   propre compte, avec le message exact « Impossible : il doit rester au
//   moins un administrateur actif. », et rien ne change (ni le profil, ni
//   Supabase Auth, ni le journal) ;
// - la règle est tenue par la base (`modifier_compte`), qui verrouille les
//   lignes administrateur : deux administrateurs qui agissent au même
//   instant ne peuvent pas se retirer l'un l'autre, ni chacun le sien ;
// - le retour arrière (`retablir_compte`) tient la même règle.
// Supabase est simulé, avec les règles de la migration ; le texte SQL est lu.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

import { actionChangerEtatCompte } from "@/server/actions/changer-etat-compte";
import { changerEtatCompte } from "@/server/admin";

import { ID_SOPHIE, PROFIL_SOPHIE, type ProfilSimule } from "../aides/supabase-connexion";

const MESSAGE = "Impossible : il doit rester au moins un administrateur actif.";

const ID_LEA = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const PROFIL_LEA: ProfilSimule = {
  id: ID_LEA,
  nom: "Léa Garnier",
  role: "administrateur",
  actif: true,
  doit_changer_mdp: false,
  email: "lea.garnier@nova-services.example",
};

const administrateursActifs = () =>
  [...simulation.profils.values()].filter((p) => p.role === "administrateur" && p.actif).map((p) => p.id);

beforeEach(() => {
  simulation.reinitialiser();
  simulation.profils.set(ID_SOPHIE, { ...PROFIL_SOPHIE });
  simulation.session.id = ID_SOPHIE;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RM-9 : le dernier administrateur actif ne peut pas être désactivé", () => {
  it("seule administratrice active, elle essaie de se désactiver : refus avec le message exact, rien ne change", async () => {
    await expect(actionChangerEtatCompte({ compteId: ID_SOPHIE, actif: false })).resolves.toEqual({
      ok: false,
      code: "CONFLIT",
      message: MESSAGE,
    });
    expect(administrateursActifs()).toEqual([ID_SOPHIE]);
    expect(simulation.updateUserById).not.toHaveBeenCalled();
    expect(simulation.bannis.size).toBe(0);
    expect(simulation.journal()).toEqual([]);
    expect(simulation.session.id).toBe(ID_SOPHIE);
  });

  it("un second administrateur désactivé ne compte pas : toujours refusé", async () => {
    simulation.profils.set(ID_LEA, { ...PROFIL_LEA, actif: false });
    await expect(actionChangerEtatCompte({ compteId: ID_SOPHIE, actif: false })).resolves.toMatchObject({
      code: "CONFLIT",
      message: MESSAGE,
    });
  });

  it("avec un autre administrateur actif : la désactivation passe, il en reste un", async () => {
    simulation.profils.set(ID_LEA, { ...PROFIL_LEA });
    await expect(actionChangerEtatCompte({ compteId: ID_LEA, actif: false })).resolves.toMatchObject({ ok: true });
    expect(administrateursActifs()).toEqual([ID_SOPHIE]);
  });

  it("deux administrateurs au même instant, l'un contre l'autre : un seul réussit (le second est refusé, NV202)", async () => {
    simulation.profils.set(ID_LEA, { ...PROFIL_LEA });
    const premier = await changerEtatCompte(ID_LEA, false, { auteur: ID_SOPHIE });
    const second = await changerEtatCompte(ID_SOPHIE, false, { auteur: ID_LEA });
    expect(premier.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, code: "ACCES_REFUSE" });
    expect(administrateursActifs()).toEqual([ID_SOPHIE]);
  });

  it("deux administrateurs au même instant, chacun sur son propre compte : le second reçoit le message exact", async () => {
    simulation.profils.set(ID_LEA, { ...PROFIL_LEA });
    expect((await changerEtatCompte(ID_LEA, false, { auteur: ID_LEA })).ok).toBe(true);
    await expect(changerEtatCompte(ID_SOPHIE, false, { auteur: ID_SOPHIE })).resolves.toMatchObject({
      code: "CONFLIT",
      message: MESSAGE,
    });
    expect(administrateursActifs()).toEqual([ID_SOPHIE]);
  });

  it("un compte désactivé peut être réactivé : de nouveau deux administrateurs actifs", async () => {
    simulation.profils.set(ID_LEA, { ...PROFIL_LEA, actif: false });
    await expect(actionChangerEtatCompte({ compteId: ID_LEA, actif: true })).resolves.toMatchObject({ ok: true });
    expect(administrateursActifs().sort()).toEqual([ID_LEA, ID_SOPHIE].sort());
  });
});

describe("RM-9 : la base tient la règle (AD-10)", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "20261125090000_desactiver_compte.sql"),
    "utf8",
  ).replace(/--.*$/gm, "");
  const corps = (nom: string) =>
    sql.slice(sql.indexOf(`create function public.${nom}(`), sql.indexOf("$$;", sql.indexOf(`create function public.${nom}(`)));

  it.each(["modifier_compte", "retablir_compte"])(
    "%s verrouille toutes les lignes administrateur (même ordre) avant de compter, et refuse avec le message exact (NV203)",
    (nom) => {
      const texte = corps(nom).replace(/\s+/g, " ");
      const verrou = texte.indexOf("where p.role = 'administrateur' order by p.id for update;");
      const compte = texte.indexOf("and p.id <> p_compte");
      expect(verrou).toBeGreaterThan(0);
      expect(compte).toBeGreaterThan(verrou);
      expect(texte).toContain(`raise exception '${MESSAGE}' using errcode = 'NV203';`);
    },
  );
});

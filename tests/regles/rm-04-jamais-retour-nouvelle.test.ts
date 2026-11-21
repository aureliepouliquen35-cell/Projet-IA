import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RM-4 : une demande ne revient jamais au statut « Nouvelle ». La réouverture
// (Traitée → En cours) est permise. Chaque changement de statut est tracé
// dans l'historique. Trois barrières : l'écran ne le propose pas
// (`TRANSITIONS_STATUT`), le serveur le refuse sans appeler la base, et la
// base le refuse (fonction et contrainte de `evenements`). Supabase est
// simulé ; la migration est lue comme texte.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

import { actionChangerStatut } from "@/server/actions/changer-statut";
import { STATUTS, TRANSITIONS_STATUT } from "@/shared/constantes";

import { fabriquerDemandes, ID_KARIM } from "../aides/supabase-connexion";

const SQL = readFileSync(join(process.cwd(), "supabase", "migrations", "20261121200000_changer_statut.sql"), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/--.*$/gm, "")
  .toLowerCase();

beforeEach(() => {
  simulation.reinitialiser();
  simulation.session.id = ID_KARIM;
  simulation.demandes.push(...fabriquerDemandes(3));
});

describe("RM-4 : jamais de retour à Nouvelle", () => {
  it("l'écran ne le propose depuis aucun statut ; la réouverture l'est", () => {
    for (const statut of STATUTS) expect(TRANSITIONS_STATUT[statut]).not.toContain("nouvelle");
    expect(TRANSITIONS_STATUT.traitee).toEqual(["en_cours"]);
  });

  it.each(["en_cours", "traitee"] as const)("le serveur refuse le retour depuis %s, sans appeler la base", async (statutVu) => {
    const reponse = await actionChangerStatut({ reference: "NOVA-2026-0003", statutVu, nouveauStatut: "nouvelle" });
    expect(reponse).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("la base le refuse : changer_statut (NV301) et la contrainte des événements", () => {
    expect(SQL).toMatch(/p_nouveau_statut not in \('en_cours', 'traitee'\) then\s+raise exception[^;]*errcode = 'nv301'/);
    expect(SQL).toMatch(/when type = 'statut' then[\s\S]*?and nouveau_statut <> 'nouvelle'/);
    expect(SQL).not.toMatch(/\('\w+', 'nouvelle'\)/);
  });

  it("chaque changement appliqué écrit son événement, dans la même fonction", () => {
    const corps = SQL.match(/create function public\.changer_statut\([\s\S]*?as \$\$([\s\S]*?)\$\$;/)?.[1] ?? "";
    const ecriture = corps.slice(corps.indexOf("update public.demandes"));
    expect(ecriture).toMatch(/^update public\.demandes[\s\S]*?insert into public\.evenements[\s\S]*?'statut'/);
  });
});

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

// RM-5 : l'historique d'une demande ne se modifie ni ne se supprime, sauf
// deux exceptions : la suppression définitive d'une demande par un
// administrateur (story 4.4, FR-28), qui efface la demande avec tout son
// historique, et l'anonymisation (epic 6, à venir). AD-3 : les événements ne
// sont effacés que par la fonction SQL `supprimer_demande`.
// - la seule migration qui efface des événements est celle de la story 4.4 ;
// - aucun code de l'application n'écrit ni n'efface directement dans
//   `demandes` ou `evenements` ;
// - une suppression efface la demande et son historique, rien d'autre ;
//   ensuite, elle n'apparaît plus nulle part.
// Supabase est simulé ; les migrations sont lues comme texte.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

import { actionSupprimerDemande } from "@/server/actions/supprimer-demande";
import { lireDemande } from "@/server/lectures/demande";
import { compterATraiter, lireListeDemandes } from "@/server/lectures/demandes";

import { fabriquerDemandes, ID_SOPHIE, PROFIL_SOPHIE } from "../aides/supabase-connexion";

const racine = process.cwd();
const DOSSIER = join(racine, "supabase", "migrations");
const MIGRATION_4_4 = "20261126120000_supprimer_demande.sql";

/** Texte SQL sans commentaires, en minuscules. */
const sql = (fichier: string) =>
  readFileSync(join(DOSSIER, fichier), "utf8").replace(/\r\n/g, "\n").replace(/--.*$/gm, "").toLowerCase();

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

beforeEach(() => {
  simulation.reinitialiser();
  simulation.profils.set(ID_SOPHIE, { ...PROFIL_SOPHIE });
  simulation.session.id = ID_SOPHIE;
  simulation.demandes.push(...fabriquerDemandes(5, 2));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("RM-5 : l'historique ne se modifie ni ne se supprime (base)", () => {
  it("aucune migration ne modifie un événement", () => {
    for (const fichier of readdirSync(DOSSIER).filter((f) => f.endsWith(".sql"))) {
      expect(sql(fichier), fichier).not.toMatch(/update public\.evenements|truncate[^;]*public\.evenements/);
    }
  });

  it("seule la migration de la story 4.4 efface des événements, dans supprimer_demande", () => {
    const effacent = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql") && /delete from public\.evenements/.test(sql(f)));
    expect(effacent).toEqual([MIGRATION_4_4]);
    const texte = sql(MIGRATION_4_4);
    expect(texte.match(/delete from public\.evenements/g)).toHaveLength(1);
    const corps = texte.match(/create function public\.supprimer_demande\([\s\S]*?as \$\$([\s\S]*?)\$\$;/)?.[1] ?? "";
    expect(corps).toMatch(/delete from public\.evenements e\s+where e\.demande_id = v_demande_id;/);
  });

  it("l'effacement est réservé aux administrateurs : exiger_administrateur avant tout", () => {
    const corps = sql(MIGRATION_4_4).match(/as \$\$([\s\S]*?)\$\$;/)?.[1] ?? "";
    expect(corps.indexOf("perform public.exiger_administrateur();")).toBeGreaterThan(-1);
    expect(corps.indexOf("perform public.exiger_administrateur();")).toBeLessThan(corps.indexOf("delete from"));
  });

  it("les tables restent fermées : aucun droit d'écriture direct ni règle RLS d'écriture", () => {
    for (const fichier of readdirSync(DOSSIER).filter((f) => f.endsWith(".sql"))) {
      const texte = sql(fichier);
      expect(texte, fichier).not.toMatch(/grant [a-z, ]*(insert|update|delete)[a-z, ]* on (table )?public\.(evenements|demandes)/);
      expect(texte, fichier).not.toMatch(/create policy[^;]*on public\.(evenements|demandes)/);
    }
  });
});

describe("RM-5 : l'application n'écrit jamais directement dans l'historique (AD-2, AD-3)", () => {
  it("aucun .from(\"demandes\") ni .from(\"evenements\") dans src", () => {
    const code = fichiers(join(racine, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
    const directs = code.filter((f) => /\.from\(\s*["'`](demandes|evenements)["'`]\s*\)/.test(readFileSync(f, "utf8")));
    expect(directs.map((f) => relative(racine, f))).toEqual([]);
  });

  it("la suppression ne passe que par la fonction SQL supprimer_demande", () => {
    const code = fichiers(join(racine, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
    const appelants = code.filter((f) => readFileSync(f, "utf8").includes('"supprimer_demande"'));
    expect(appelants.map((f) => relative(racine, f).replace(/\\/g, "/"))).toEqual(["src/server/actions/supprimer-demande.ts"]);
  });
});

describe("RM-5 : l'exception de la suppression (FR-28)", () => {
  it("la demande et tout son historique sont effacés ; les autres restent intactes", async () => {
    const autres = simulation.demandes.filter((d) => d.reference !== "NOVA-2026-0005").map((d) => ({ ...d }));
    await expect(actionSupprimerDemande({ reference: "NOVA-2026-0005" })).resolves.toMatchObject({ ok: true });
    await expect(lireDemande("NOVA-2026-0005")).resolves.toBeNull();
    expect(simulation.demandes).toEqual(autres);
  });

  it("ensuite, elle n'apparaît plus nulle part : liste, recherche, compteur « à traiter »", async () => {
    await expect(compterATraiter()).resolves.toEqual({ ok: true, donnees: 2 });
    await actionSupprimerDemande({ reference: "NOVA-2026-0005" });
    const liste = await lireListeDemandes(1);
    expect(liste.ok && liste.donnees.demandes.map((d) => d.reference)).not.toContain("NOVA-2026-0005");
    await expect(lireListeDemandes(1, "demandeur5@exemple.fr")).resolves.toMatchObject({ ok: true, donnees: { total: 0 } });
    await expect(compterATraiter()).resolves.toEqual({ ok: true, donnees: 1 });
  });
});

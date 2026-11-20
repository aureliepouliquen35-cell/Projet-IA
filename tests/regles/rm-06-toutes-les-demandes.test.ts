import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RM-6 : tout utilisateur interne voit toutes les demandes (FR-11), qu'elles
// lui soient attribuées ou non, quel que soit son rôle. Aucune lecture ne
// filtre selon la personne connectée : ni la fonction SQL (texte de la
// migration), ni le serveur (paramètres envoyés). Supabase est simulé.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));

import { compterATraiter, lireListeDemandes } from "@/server/lectures/demandes";

import { fabriquerDemandes, ID_KARIM } from "../aides/supabase-connexion";

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const FICHIER = readdirSync(DOSSIER).find((f) => f.endsWith("_liste_demandes.sql"))!;
const SQL = readFileSync(join(DOSSIER, FICHIER), "utf8").replace(/--.*$/gm, "").toLowerCase();

const corps = (nom: string) =>
  SQL.match(new RegExp(`create function public\\.${nom}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`))?.[1] ?? "";

beforeEach(() => {
  simulation.reinitialiser();
  simulation.session.id = ID_KARIM;
});

describe("RM-6 : tout utilisateur interne voit toutes les demandes", () => {
  it.each(["lister_demandes", "compter_a_traiter"])(
    "%s ne filtre selon personne : la session sert seulement à vérifier l'appelant",
    (nom) => {
      const texte = corps(nom);
      expect(texte).not.toContain("auth.uid()");
      expect(texte).not.toMatch(/attribu|profil/);
      expect(texte).toContain("perform public.exiger_utilisateur_interne();");
    },
  );

  it("la liste compte toutes les demandes de la table, sans condition", () => {
    expect(corps("lister_demandes")).toMatch(/select count\(\*\)::integer\s+into v_total\s+from public\.demandes;/);
  });

  it("le serveur n'envoie que la page et la taille, aucun identifiant de personne", async () => {
    await lireListeDemandes(1);
    await compterATraiter();
    expect(simulation.rpcSession.mock.calls).toEqual([
      ["lister_demandes", { p_page: 1, p_taille: 25 }],
      ["compter_a_traiter"],
    ]);
  });

  it.each(["collaborateur", "administrateur"])("un %s voit les 42 demandes", async (role) => {
    simulation.profils.get(ID_KARIM)!.role = role;
    simulation.demandes.push(...fabriquerDemandes(42, 5));
    const liste = await lireListeDemandes(1);
    expect(liste.ok && liste.donnees.total).toBe(42);
    await expect(compterATraiter()).resolves.toEqual({ ok: true, donnees: 5 });
  });
});
